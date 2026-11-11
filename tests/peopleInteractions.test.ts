import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('People interaction wiring', () => {
  it('searches names and aliases', () => {
    const source = read('src/features/entries/PersonMultiSelect.tsx');
    expect(source).toContain('[person.name, ...person.aliases]');
    expect(source).toContain('value={query}');
  });

  it('creates inline profiles and selects the returned profile', () => {
    const selector = read('src/features/entries/PersonMultiSelect.tsx');
    const form = read('src/features/entries/CreateEntryForm.tsx');
    expect(selector).toContain('await onCreatePerson(name)');
    expect(selector).toContain('onChange([...selected, person])');
    expect(form).toContain('createPersonProfile(user.uid, { name, aliases: [] })');
    expect(form).toContain('onCreatePerson={createPersonFromMemory}');
  });

  it('removes selected people without deleting their profile', () => {
    const source = read('src/features/entries/PersonMultiSelect.tsx');
    expect(source).toContain('onChange(selected.filter((item) => `${item.ownerId}:${item.personId}` !== key))');
  });

  it('confirms deletion and invokes association cleanup', () => {
    const source = read('src/features/people/PeopleDirectory.tsx');
    expect(source).toContain('window.confirm(`Delete ${person.name}?');
    expect(source).toContain('await deletePersonProfile(user.uid, person.id)');
    expect(source).toContain('The Memories themselves will not be deleted.');
  });

  it('wires dashboard popup to Memory and profile navigation', () => {
    const source = read('src/features/dashboard/TravelDashboard.tsx');
    expect(source).toContain('setSelectedDashboardPersonKey(person.key)');
    expect(source).toContain('onOpenMemory(entry)');
    expect(source).toContain('onSelectPerson(key)');
    expect(source).toContain('Close person preview');
  });
});
