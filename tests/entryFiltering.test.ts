import { describe, expect, it } from 'vitest';
import type { Entry } from '../src/types/domain';
import { filterEntries, sortEntries } from '../src/features/entries/entryFiltering';

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'entry-1', journeyId: 'journey-1', title: 'Base title', date: '2026-01-02',
  story: 'Base story', people: ['Base person'], tags: ['base-tag'], costs: [],
  createdBy: 'user-1', createdAt: {} as Entry['createdAt'], updatedAt: {} as Entry['updatedAt'],
  ...overrides,
});

describe('shared Entry filtering and sorting', () => {
  it('searches title, story, highlight, location, people and tags independently', () => {
    const entries = [
      makeEntry({ id: 'title', title: 'Louvre visit' }),
      makeEntry({ id: 'story', story: 'A culture-filled afternoon' }),
      makeEntry({ id: 'highlight', highlight: 'A culture discovery' }),
      makeEntry({ id: 'location', location: { name: 'Culture Centre', latitude: 1, longitude: 2 } }),
      makeEntry({ id: 'person', people: ['Culture Guide'] }),
      makeEntry({ id: 'tag', tags: ['culture'] }),
      makeEntry({ id: 'unmatched', title: 'Different memory', story: 'Nothing relevant', people: [], tags: [] }),
    ];
    expect(filterEntries(entries, { searchQuery: 'louvre' }).map((entry) => entry.id)).toEqual(['title']);
    expect(filterEntries(entries, { searchQuery: 'culture' }).map((entry) => entry.id)).toEqual([
      'story', 'highlight', 'location', 'person', 'tag',
    ]);
  });
  it('applies date, rating, type, person and tag filters together', () => {
    const entries = [
      makeEntry({ rating: 5, memoryType: 'sight', people: ['Alex'], tags: ['culture'] }),
      makeEntry({ id: '2', rating: 3, memoryType: 'food' }),
    ];
    expect(filterEntries(entries, { minRating: 4, memoryType: 'sight', person: 'Alex', tag: 'culture', dateFrom: '2026-01-01' })).toHaveLength(1);
  });
  it('sorts without mutating the input array', () => {
    const entries = [makeEntry({ id: 'later', date: '2026-02-01' }), makeEntry({ id: 'earlier', date: '2026-01-01' })];
    const sorted = sortEntries(entries, 'date', 'asc');
    expect(sorted.map((entry) => entry.id)).toEqual(['earlier', 'later']);
    expect(entries[0].id).toBe('later');
  });
});
