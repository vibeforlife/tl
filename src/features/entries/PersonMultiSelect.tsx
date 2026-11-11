import { useMemo, useState } from 'react';
import type { Person, MemoryPerson } from '../../types/domain';

type Props = {
  id: string;
  people: Person[];
  selected: MemoryPerson[];
  onChange: (next: MemoryPerson[]) => void;
  onCreatePerson: (name: string) => Promise<MemoryPerson>;
  disabled?: boolean;
};

export function PersonMultiSelect({
  id,
  people,
  selected,
  onChange,
  onCreatePerson,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const selectedKeys = new Set(selected.map((item) => `${item.ownerId}:${item.personId}`));
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...people]
      .filter((person) => !needle || [person.name, ...person.aliases].some((value) => value.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, query]);
  const exactMatch = filtered.some((person) =>
    [person.name, ...person.aliases].some((value) =>
      value.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
    ),
  );

  const toggle = (person: Person, checked: boolean) => {
    const key = `${person.ownerId}:${person.id}`;
    if (checked) {
      if (selectedKeys.has(key)) return;
      onChange([...selected, { personId: person.id, ownerId: person.ownerId, displayName: person.name }]);
    } else {
      onChange(selected.filter((item) => `${item.ownerId}:${item.personId}` !== key));
    }
  };

  const removeSelected = (person: MemoryPerson) => {
    const key = `${person.ownerId}:${person.personId}`;
    onChange(selected.filter((item) => `${item.ownerId}:${item.personId}` !== key));
  };

  const create = async () => {
    const name = query.trim().replace(/\s+/g, ' ');
    if (!name || isCreating || disabled) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const person = await onCreatePerson(name);
      const key = `${person.ownerId}:${person.personId}`;
      if (!selectedKeys.has(key)) onChange([...selected, person]);
      setQuery('');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'We could not create this person.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="person-multi-select">
      <input
        id={id}
        type="search"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setCreateError(null); }}
        placeholder="Search or add a person"
        disabled={disabled || isCreating}
        aria-label="Search people"
      />
      {selected.length > 0 && (
        <div className="person-selection-chips" aria-label="Selected people">
          {selected.map((person) => (
            <span className="person-selection-chip" key={`${person.ownerId}:${person.personId}`}>
              {person.displayName}
              <button
                type="button"
                aria-label={`Remove ${person.displayName}`}
                onClick={() => removeSelected(person)}
                disabled={disabled || isCreating}
              >×</button>
            </span>
          ))}
        </div>
      )}
      {filtered.length > 0 && (
        <div className="person-multi-select-options">
          {filtered.map((person) => {
            const key = `${person.ownerId}:${person.id}`;
            return (
              <label className="person-multi-select-option" key={key}>
                <input
                  type="checkbox"
                  checked={selectedKeys.has(key)}
                  onChange={(event) => toggle(person, event.target.checked)}
                  disabled={disabled || isCreating}
                />
                <span>{person.name}</span>
              </label>
            );
          })}
        </div>
      )}
      {query.trim() && !exactMatch && (
        <button className="person-multi-select-create" type="button" onClick={() => void create()} disabled={disabled || isCreating}>
          {isCreating ? 'Adding…' : `＋ Add “${query.trim()}”`}
        </button>
      )}
      {people.length === 0 && !query.trim() && <p className="field-hint">Search above to add someone to this Memory.</p>}
      {filtered.length === 0 && query.trim() && <p className="field-hint">No matching profile. You can create this person.</p>}
      {createError && <p className="field-error" role="alert">{createError}</p>}
    </div>
  );
}
