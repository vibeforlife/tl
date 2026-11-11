import { describe, expect, it } from 'vitest';
import type { Entry } from '../src/types/domain';
import { getEntryCountry, isEntryCountryAssigned, calculateCountryVisits } from '../src/features/dashboard/countryVisitCalculations';

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'memory-1', journeyId: 'journey-1', title: 'Memory', date: '2026-01-01',
  story: 'Story', tags: [], costs: [], createdBy: 'user-1',
  createdAt: {} as Entry['createdAt'], updatedAt: {} as Entry['updatedAt'],
  ...overrides,
});

describe('manual country assignment', () => {
  it('uses a manual country when Mapbox country metadata is absent', () => {
    const memory = entry({ manualCountry: {
      countryCode: 'IN', countryName: 'India', source: 'manual',
      assignedBy: 'user-1', assignedAt: {} as never,
    } as NonNullable<Entry['manualCountry']> });
    expect(getEntryCountry(memory)).toMatchObject({ code: 'IN', name: 'India', source: 'manual' });
    expect(isEntryCountryAssigned(memory)).toBe(true);
  });

  it('keeps Mapbox country metadata authoritative over a conflicting manual assignment', () => {
    const memory = entry({
      location: { name: 'Place', latitude: 1, longitude: 2, countryName: 'Canada', countryCode: 'CA', countrySource: 'mapbox-search-box' },
      manualCountry: { countryCode: 'IN', countryName: 'India', source: 'manual', assignedBy: 'user-1', assignedAt: {} as never },
    });
    expect(getEntryCountry(memory)).toMatchObject({ code: 'CA', name: 'Canada', source: 'mapbox' });
  });

  it('keeps a Memory without Mapbox or manual metadata unassigned even when cached geography exists', () => {
    const memory = entry({ geography: {
      countryCode: 'IN', countryName: 'India', status: 'matched',
      sourceLatitude: 1, sourceLongitude: 2, datasetVersion: 'v1', algorithmVersion: 'v1',
    } });
    expect(getEntryCountry(memory)).toBeNull();
    expect(isEntryCountryAssigned(memory)).toBe(false);
  });

  it('includes manual assignments in country visit summaries', () => {
    const memory = entry({ manualCountry: {
      countryCode: 'IQ', countryName: 'Iraq', source: 'manual',
      assignedBy: 'user-1', assignedAt: {} as never,
    } });
    expect(calculateCountryVisits([memory])).toMatchObject([
      { code: 'IQ', name: 'Iraq', memoryCount: 1, journeyCount: 1 },
    ]);
  });
});
