import { describe, expect, it } from 'vitest';
import type { Entry, Journey } from '../src/types/domain';
import {
  buildRelivePresentation,
  formatReliveDuration,
  selectReliveEntries,
  sortReliveEntries,
} from '../src/domain/relive';

const journey = {
  id: 'journey-1',
  name: 'South India',
  place: 'India',
  startDate: '2026-10-01',
  endDate: '2026-10-10',
  createdBy: 'owner-1',
} as Journey;

const makeEntry = (overrides: Partial<Entry> & Pick<Entry, 'id' | 'title' | 'date'>): Entry => ({
  id: overrides.id,
  journeyId: 'journey-1',
  title: overrides.title,
  date: overrides.date,
  story: 'Long private story text is not part of a Relive scene.',
  peopleRefs: [],
  tags: [],
  costs: [],
  createdBy: 'owner-1',
  ...overrides,
} as Entry);

const baseConfiguration = {
  title: 'South India — A Journey',
  selectionMode: 'automatic',
  selectedEntryIds: [],
  durationMode: 'journey',
} as const;

describe('Relive presentation domain', () => {
  it('sorts Memories chronologically with stable tie-breakers', () => {
    const entries = [
      makeEntry({ id: 'b', title: 'Temple', date: '2026-10-03' }),
      makeEntry({ id: 'c', title: 'Breakfast', date: '2026-10-02', time: '09:00' }),
      makeEntry({ id: 'a', title: 'Arrival', date: '2026-10-01' }),
    ];

    expect(sortReliveEntries(entries).map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
  });

  it('includes all Memories in automatic mode', () => {
    const entries = [
      makeEntry({ id: 'later', title: 'Later', date: '2026-10-03' }),
      makeEntry({ id: 'earlier', title: 'Earlier', date: '2026-10-01' }),
    ];

    expect(selectReliveEntries(entries, baseConfiguration).map((entry) => entry.id))
      .toEqual(['earlier', 'later']);
  });

  it('includes only curated Memory IDs and preserves chronological order', () => {
    const entries = [
      makeEntry({ id: 'c', title: 'Third', date: '2026-10-03' }),
      makeEntry({ id: 'a', title: 'First', date: '2026-10-01' }),
      makeEntry({ id: 'b', title: 'Second', date: '2026-10-02' }),
    ];

    expect(selectReliveEntries(entries, {
      selectionMode: 'curated',
      selectedEntryIds: ['c', 'a'],
    }).map((entry) => entry.id)).toEqual(['a', 'c']);
  });

  it('builds opening, Memory and closing scenes without exposing full stories', () => {
    const entry = makeEntry({
      id: 'memory-1',
      title: 'An afternoon in Madurai',
      date: '2026-10-03',
      highlight: 'A memorable visit.',
      photo: { url: 'https://example.com/photo.jpg', storagePath: 'photos/1' },
      location: { name: 'Madurai', latitude: 9.9252, longitude: 78.1198 },
    });

    const presentation = buildRelivePresentation(
      journey,
      [entry],
      baseConfiguration,
    );

    expect(presentation.scenes.map((scene) => scene.type))
      .toEqual(['opening', 'memory', 'closing']);

    const memoryScene = presentation.scenes[1];
    expect(memoryScene.type).toBe('memory');
    if (memoryScene.type === 'memory') {
      expect(memoryScene.highlight).toBe('A memorable visit.');
      expect(memoryScene.photoUrl).toBe('https://example.com/photo.jpg');
      expect(memoryScene.coordinates).toEqual({ latitude: 9.9252, longitude: 78.1198 });
      expect(JSON.stringify(memoryScene)).not.toContain('Long private story text');
    }
  });

  it('uses different pacing modes without dropping selected Memories', () => {
    const entries = [
      makeEntry({ id: 'a', title: 'First', date: '2026-10-01' }),
      makeEntry({ id: 'b', title: 'Second', date: '2026-10-02' }),
    ];

    const highlights = buildRelivePresentation(journey, entries, {
      ...baseConfiguration,
      durationMode: 'highlights',
    });
    const complete = buildRelivePresentation(journey, entries, {
      ...baseConfiguration,
      durationMode: 'complete',
    });

    expect(highlights.memoryCount).toBe(2);
    expect(complete.memoryCount).toBe(2);
    expect(complete.estimatedDurationSeconds).toBeGreaterThan(highlights.estimatedDurationSeconds);
  });

  it('formats estimated runtimes clearly', () => {
    expect(formatReliveDuration(65)).toBe('1 min 5 sec');
    expect(formatReliveDuration(8)).toBe('8 sec');
  });
});
