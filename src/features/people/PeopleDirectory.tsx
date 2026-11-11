import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import type {User} from 'firebase/auth';
import type {Entry,Person} from '../../types/domain';
import {createPersonProfile,deletePersonProfile,listMyPeople,normalizeDirectoryPersonName,updatePersonProfile} from '../../services/firebase/people';
import './people.css';

type Draft={name:string;aliases:string;notes:string};
const emptyDraft:Draft={name:'',aliases:'',notes:''};

export function PeopleDirectory({user,entries,initialSelectedPersonKey,onBack,onOpenMemory}:{
  user:User; entries:Entry[]; initialSelectedPersonKey?:string|null;
  onBack:()=>void; onOpenMemory:(entry:Entry)=>void;
}){
  const [people,setPeople]=useState<Person[]>([]);
  const [query,setQuery]=useState('');
  const [draft,setDraft]=useState<Draft>(emptyDraft);
  const [editing,setEditing]=useState<Person|null>(null);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [selectedPersonKey,setSelectedPersonKey]=useState<string|null>(initialSelectedPersonKey??null);

  const reload=useCallback(async()=>{
    setLoading(true);
    try{setPeople(await listMyPeople(user.uid));setError(null);}
    catch{setError('We could not load your People directory. Please try again.');}
    finally{setLoading(false);}
  },[user.uid]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{if(initialSelectedPersonKey)setSelectedPersonKey(initialSelectedPersonKey);},[initialSelectedPersonKey]);

  const filtered=useMemo(()=>{
    const q=normalizeDirectoryPersonName(query);
    return q?people.filter(p=>[p.name,...(p.aliases||[])].some(v=>normalizeDirectoryPersonName(v).includes(q))):people;
  },[people,query]);
  const selectedMemories=useMemo(()=>selectedPersonKey
    ?entries.filter(entry=>entry.peopleRefs.some(ref=>`${ref.ownerId}:${ref.personId}`===selectedPersonKey)).sort((a,b)=>b.date.localeCompare(a.date))
    :[],[entries,selectedPersonKey]);
  const selectedReference=useMemo(()=>{
    if(!selectedPersonKey)return null;
    for(const entry of entries){const ref=entry.peopleRefs.find(p=>`${p.ownerId}:${p.personId}`===selectedPersonKey);if(ref)return ref;}
    return null;
  },[entries,selectedPersonKey]);
  const selectedProfile=people.find(p=>selectedPersonKey===`${user.uid}:${p.id}`)??null;

  const create=()=>{setEditing(null);setDraft(emptyDraft);setError(null);setOpen(true);};
  const edit=(person:Person)=>{setEditing(person);setDraft({name:person.name,aliases:(person.aliases||[]).join(', '),notes:person.notes||''});setError(null);setOpen(true);};
  const close=()=>{if(!saving){setOpen(false);setEditing(null);}};
  const removePerson=async(person:Person)=>{
    if(deletingId||saving)return;
    if(!window.confirm(`Delete ${person.name}?\n\nThis will also remove this person's associations from all your Memories. The Memories themselves will not be deleted.`))return;
    setDeletingId(person.id);setError(null);
    try{await deletePersonProfile(user.uid,person.id);if(selectedPersonKey===`${user.uid}:${person.id}`)setSelectedPersonKey(null);await reload();}
    catch(err){setError(err instanceof Error?err.message:'We could not delete this person. Please try again.');}
    finally{setDeletingId(null);}
  };
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(saving)return;setSaving(true);setError(null);
    try{
      const aliases=draft.aliases.split(',').map(v=>v.trim()).filter(Boolean);
      if(!normalizeDirectoryPersonName(draft.name))throw new Error('Enter a name for this person.');
      const input={name:draft.name,aliases,notes:draft.notes};
      if(editing)await updatePersonProfile(user.uid,editing.id,input);else await createPersonProfile(user.uid,input);
      setOpen(false);setEditing(null);await reload();
    }catch(err){setError(err instanceof Error?err.message:'We could not save this profile.');}
    finally{setSaving(false);}
  };

  return <main className="people-directory">
    <header className="people-directory__header">
      <button className="people-directory__back" onClick={onBack} type="button">← Back</button>
      <p className="eyebrow">YOUR PEOPLE</p><h1>People, remembered.</h1>
      <p>A personal directory of the people who are part of your journeys and stories.</p>
    </header>
    <div className="people-directory__toolbar">
      <input aria-label="Search people" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search names and aliases…"/>
      <button className="primary-button" type="button" onClick={create}>＋ Add person</button>
    </div>
    {error&&!open&&<p className="auth-error" role="alert">{error}</p>}
    {loading?<p>Loading your people…</p>:filtered.length===0?
      <section className="people-directory__empty">
        <h2>{query?'No matching people.':'Your directory begins here.'}</h2>
        <p>{query?'Try another name or alias.':'Add people you want to remember. Profiles can exist before they are linked to a Memory.'}</p>
        {!query&&<button className="secondary-button" type="button" onClick={create}>Add your first person</button>}
      </section>:
      <section className="people-directory__grid">
        {filtered.map(person=>{
          const key=`${user.uid}:${person.id}`;
          const count=entries.filter(entry=>entry.peopleRefs.some(ref=>ref.ownerId===user.uid&&ref.personId===person.id)).length;
          return <article className={`people-card${selectedPersonKey===key?' people-card--selected':''}`} key={person.id}>
            <button className="people-card__view" type="button" onClick={()=>setSelectedPersonKey(selectedPersonKey===key?null:key)} aria-expanded={selectedPersonKey===key}>
              <span className="people-card__avatar" aria-hidden="true">{person.name.trim().charAt(0).toUpperCase()}</span>
              <span className="people-card__body"><strong>{person.name}</strong>
                {!!person.aliases?.length&&<small>{person.aliases.join(' · ')}</small>}
                <small>{count} associated {count===1?'Memory':'Memories'}</small>
              </span>
            </button>
            <div className="people-card__actions">
              <button type="button" className="people-card__edit" onClick={()=>edit(person)} disabled={Boolean(deletingId)}>Edit</button>
              <button type="button" className="people-card__delete" onClick={()=>void removePerson(person)} disabled={Boolean(deletingId)}>{deletingId===person.id?'Deleting…':'Delete'}</button>
            </div>
          </article>;
        })}
      </section>}
    {selectedPersonKey&&<section className="people-memories" aria-live="polite">
      <div className="people-memories__heading">
        <div><p className="eyebrow">CONNECTED STORIES</p><h2>{selectedProfile?.name??selectedReference?.displayName??'Person'}</h2></div>
        <button type="button" className="secondary-button" onClick={()=>setSelectedPersonKey(null)}>Close ×</button>
      </div>
      {selectedProfile?.notes&&<p>{selectedProfile.notes}</p>}
      {selectedMemories.length===0?<p>No Memories are currently linked to this person.</p>:
        <ul className="people-memories__list">
          {selectedMemories.map(entry=><li key={`${entry.journeyId}:${entry.id}`}>
            <button type="button" onClick={()=>onOpenMemory(entry)}><strong>{entry.title}</strong><span>{entry.date}{entry.location?.name?` · ${entry.location.name}`:''}</span></button>
          </li>)}
        </ul>}
    </section>}
    {open&&<div className="journey-modal">
      <button className="journey-modal__backdrop" type="button" aria-label="Close" onClick={close}/>
      <section className="journey-modal__panel people-editor" role="dialog" aria-modal="true" aria-labelledby="person-form-title">
        <div className="journey-modal__header"><div><p className="eyebrow">{editing?'UPDATE PROFILE':'NEW PROFILE'}</p><h2 id="person-form-title">{editing?'Edit person':'Add a person'}</h2></div>
          <button className="journey-modal__close" type="button" onClick={close} disabled={saving}>×</button></div>
        <form onSubmit={submit}>
          <label>Name<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} maxLength={120} required disabled={saving}/></label>
          <label>Aliases (comma-separated)<input value={draft.aliases} onChange={e=>setDraft({...draft,aliases:e.target.value})} maxLength={500} disabled={saving}/></label>
          <label>Notes<textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} rows={4} maxLength={3000} disabled={saving}/></label>
          {error&&<p className="auth-error" role="alert">{error}</p>}
          <div className="journey-modal__actions"><button className="secondary-button" type="button" onClick={close} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving?'Saving…':editing?'Save changes':'Create profile'}</button></div>
        </form>
      </section>
    </div>}
  </main>;
}
