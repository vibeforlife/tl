import { describe, expect, it } from 'vitest';
import { resolveLocationCoordinates } from '../src/features/entries/locationCoordinates';
import type { EntryLocation } from '../src/types/domain';

const selectedLocation: EntryLocation = {
  name: 'Toronto',
  latitude: 43.6532,
  longitude: -79.3832,
  mapboxPlaceId: 'mapbox.test',
  countryName: 'Canada',
  countryCode: 'CA',
  countrySource: 'mapbox-search-box',
};

describe('resolveLocationCoordinates', () => {
  it('preserves selected coordinates when manual coordinate fields are blank', () => {
    expect(resolveLocationCoordinates('', '', selectedLocation)).toEqual({
      latitude: 43.6532,
      longitude: -79.3832,
      coordinatesUnchanged: true,
    });
  });

  it('preserves an unchanged coordinate when only the other coordinate is re-entered', () => {
    expect(resolveLocationCoordinates('43.6532', '', selectedLocation)).toEqual({
      latitude: 43.6532,
      longitude: -79.3832,
      coordinatesUnchanged: true,
    });
  });

  it('marks changed coordinates so the caller can discard stale Mapbox metadata', () => {
    expect(resolveLocationCoordinates('45', '-75', selectedLocation)).toEqual({
      latitude: 45,
      longitude: -75,
      coordinatesUnchanged: false,
    });
  });

  it('does not turn missing coordinates into zero for a manually entered location', () => {
    const result = resolveLocationCoordinates('', '', undefined);
    expect(Number.isNaN(result.latitude)).toBe(true);
    expect(Number.isNaN(result.longitude)).toBe(true);
    expect(result.coordinatesUnchanged).toBe(false);
  });
});
