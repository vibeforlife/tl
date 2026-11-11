import { useMemo, useState } from 'react';
import type { Person, MemoryPerson } from '../../types/domain';

type Props = {
  id: string;
  people: Person[];
  selected: MemoryPerson[];
  onChange: (next: MemoryPerson[]) => void;
  disabled?: boolean;
};

export function PersonMultiSelect({ id, people, selected, onChange, disabled = false }: Props) {
  const [query, setQuery] = useState('');
  const selectedKeys = new Set(selected.map((item) => `${item.ownerId}:${item.personId}`));
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...people]
      .filter((person) => !needle || [person.name, ...person.aliases].some((value) => value.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, query]);

  const toggle = (person: Person, checked: boolean) => {
    const key = `${person.ownerId}:${person.id}`;
    if (checked) {
      if (selectedKeys.has(key)) return;
      onChange([...selected, { personId: person.id, ownerId: person.ownerId, displayName: person.name }]);
    } else {
      onChange(selected.filter((item) => `${item.ownerId}:${item.personId}` !== key));
    }
  };

  return (
    <div className="person-multi-select">
      <input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" disabled={disabled || people.length === 0} aria-label="Search people" />
      {selected.length > 0 && <div className="person-selection-chips" aria-label="Selected people">{selected.map((person) => <span className="person-selection-chip" key={`${person.ownerId}:${person.personId}`}>{person.displayName}</span>)}</div>}
      {people.length === 0 ? <p className="field-hint">No people profiles yet. Add people in your People directory first.</p> :
        filtered.length === 0 ? <p className="field-hint">No matching people found.</p> :
        <div className="person-multi-select-options">{filtered.map((person) => {
          const key = `${person.ownerId}:${person.id}`;
          return <label className="person-multi-select-option" key={key}><input type="checkbox" checked={selectedKeys.has(key)} onChange={(event) => toggle(person, event.target.checked)} disabled={disabled} /><span>{person.name}</span></label>;
        })}</div>}
    </div>
  );
}
