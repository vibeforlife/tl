import { describe, expect, it } from 'vitest';
import type { Entry } from '../src/types/domain';
import { calculateCountryVisits } from '../src/features/dashboard/countryVisitCalculations';

const conflictingEntry: Entry = {
  id: 'conflict', journeyId: 'journey-1', title: 'Memory', date: '2026-01-01', story: 'Story', tags: [], costs: [], createdBy: 'user-1',
  createdAt: {} as Entry['createdAt'], updatedAt: {} as Entry['updatedAt'],
  location: { name: 'Saved Mapbox place', latitude: 43.65, longitude: -79.38, countryName: 'Canada', countryCode: 'CA', countrySource: 'mapbox-search-box' },
  geography: { countryCode: 'US', countryName: 'United States', status: 'matched', sourceLatitude: 43.65, sourceLongitude: -79.38, datasetVersion: 'test', algorithmVersion: 'test' },
};

describe('Mapbox country precedence', () => {
  it('uses saved Mapbox country metadata when cached geography conflicts', () => {
    expect(calculateCountryVisits([conflictingEntry]).map((country) => country.code)).toEqual(['CA']);
  });
});
