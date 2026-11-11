import { describe, expect, it } from 'vitest';
import type { Entry } from '../src/types/domain';
import { calculateCountryVisits } from '../src/features/dashboard/countryVisitCalculations';

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'memory-1',
  journeyId: 'journey-1',
  title: 'A memory',
  date: '2026-01-01',
  story: 'A story',
  peopleRefs: [], tags: [],
  costs: [],
  createdBy: 'user-1',
  createdAt: {} as Entry['createdAt'],
  updatedAt: {} as Entry['updatedAt'],
  ...overrides,
});

const withCountry = (code: string, name: string, overrides: Partial<Entry> = {}) =>
  entry({
    location: {
      name: 'A place',
      latitude: 10,
      longitude: 20,
      countryCode: code,
      countryName: name,
      countrySource: 'mapbox-search-box',
    },
    ...overrides,
  });

describe('country visit calculations', () => {
  it('counts distinct countries, Memories, Journeys and anchor photos', () => {
    const result = calculateCountryVisits([
      withCountry('CA', 'Canada', { photo: { url: 'photo-1', storagePath: 'p1' } }),
      withCountry('CA', 'Canada', { id: 'memory-2', photo: { url: 'photo-2', storagePath: 'p2' } }),
      withCountry('CA', 'Canada', { id: 'memory-3', journeyId: 'journey-2' }),
      withCountry('FR', 'France', { id: 'memory-4', journeyId: 'journey-3' }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      code: 'CA',
      name: 'Canada',
      memoryCount: 3,
      journeyCount: 2,
      photoCount: 2,
    });
    expect(result[1]).toMatchObject({
      code: 'FR',
      name: 'France',
      memoryCount: 1,
      journeyCount: 1,
      photoCount: 0,
    });
  });

  it('deduplicates repeated journey-memory records', () => {
    const memory = withCountry('CA', 'Canada');
    expect(calculateCountryVisits([memory, memory])[0].memoryCount).toBe(1);
  });

  it('does not infer countries without Mapbox provenance', () => {
    const unverified = entry({
      location: {
        name: 'Toronto',
        address: 'Toronto, Canada',
        latitude: 43.65,
        longitude: -79.38,
        countryCode: 'CA',
        countryName: 'Canada',
      },
    });
    expect(calculateCountryVisits([unverified])).toEqual([]);
  });

  it('rejects malformed country codes and blank country names', () => {
    expect(calculateCountryVisits([
      withCountry('CAN', 'Canada'),
      withCountry('US', '   '),
    ])).toEqual([]);
  });

  it('sorts the report alphabetically by country name', () => {
    expect(calculateCountryVisits([
      withCountry('JP', 'Japan', { id: 'memory-jp' }),
      withCountry('CA', 'Canada', { id: 'memory-ca' }),
    ]).map((country) => country.name)).toEqual(['Canada', 'Japan']);
  });
});
