import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types/domain';
import {
  buildReliveJourneyModel,
  getReliveEntryCoordinate,
  reliveDistanceKm,
} from './journeyPlaybackModel';

const entry = (
  id: string,
  date: string,
  latitude?: number,
  longitude?: number,
): Entry => ({
  id,
  title: `Memory ${id}`,
  date,
  location: latitude === undefined || longitude === undefined
    ? undefined
    : { name: `Place ${id}`, latitude, longitude },
} as Entry);

describe('Relive journey playback model', () => {
  it('sorts memories chronologically before building geographic stops', () => {
    const model = buildReliveJourneyModel([
      entry('later', '2026-05-03', 13.08, 80.27),
      entry('earlier', '2026-05-01', 19.07, 72.87),
    ]);
    expect(model.memories.map((memory) => memory.entry.id)).toEqual(['earlier', 'later']);
    expect(model.stops).toHaveLength(2);
  });

  it('groups mapped memories only against the current consecutive stop (A → B → A)', () => {
    const model = buildReliveJourneyModel([
      entry('a1', '2026-05-01', 19.076, 72.877),
      entry('b', '2026-05-02', 13.0827, 80.2707),
      entry('a2', '2026-05-03', 19.077, 72.878),
    ]);
    expect(model.stops.map((stop) => stop.entryIds)).toEqual([['a1'], ['b'], ['a2']]);
    expect(model.legs).toHaveLength(2);
    expect(model.legs.map((leg) => [leg.fromEntryId, leg.toEntryId])).toEqual([
      ['a1', 'b'],
      ['b', 'a2'],
    ]);
  });

  it('does not let an unmapped Memory break proximity grouping', () => {
    const model = buildReliveJourneyModel([
      entry('a1', '2026-05-01', 19.076, 72.877),
      entry('no-coordinates', '2026-05-02'),
      entry('a2', '2026-05-03', 19.077, 72.878),
    ]);
    expect(model.stops).toHaveLength(1);
    expect(model.stops[0].entryIds).toEqual(['a1', 'a2']);
    expect(model.legs).toHaveLength(0);
    expect(model.memories[1].mappedCoordinate).toBeNull();
    expect(model.memories[1].displayCoordinate).toEqual([72.877, 19.076]);
  });

  it('keeps invalid coordinates in the timeline but excludes them from map calculations', () => {
    const model = buildReliveJourneyModel([
      entry('valid', '2026-05-01', 19.076, 72.877),
      entry('invalid-latitude', '2026-05-02', 91, 72),
      entry('invalid-longitude', '2026-05-03', 19, 181),
    ]);
    expect(model.memories).toHaveLength(3);
    expect(model.mappedMemoryCount).toBe(1);
    expect(model.stops).toHaveLength(1);
    expect(model.memories[1].displayCoordinate).toEqual([72.877, 19.076]);
  });

  it('treats the antimeridian as a short geographic crossing', () => {
    const distance = reliveDistanceKm([179.8, 10], [-179.8, 10]);
    expect(distance).toBeLessThan(50);
  });

  it('keeps an entirely unmapped Journey in the timeline without inventing geography', () => {
    const model = buildReliveJourneyModel([
      entry('first', '2026-05-01'),
      entry('second', '2026-05-02', 120, 500),
    ]);
    expect(model.memories).toHaveLength(2);
    expect(model.stops).toEqual([]);
    expect(model.legs).toEqual([]);
    expect(model.memories.every((memory) =>
      memory.mappedCoordinate === null &&
      memory.displayCoordinate === null &&
      memory.displayStopId === null,
    )).toBe(true);
  });

  it('returns null for invalid saved coordinates', () => {
    expect(getReliveEntryCoordinate(entry('bad', '2026-05-01', 100, 20))).toBeNull();
  });
});
