import { describe, expect, it } from 'vitest';
import type { Entry, Journey } from '../src/types/domain';
import {
  calculateDaysCovered,
  calculateNamedPeopleCount,
  calculateRecordedPlaceCount,
} from '../src/features/dashboard/dashboardCalculations';

const journey = (startDate: string, endDate: string): Journey => ({
  id: `${startDate}-${endDate}`,
  name: 'Test journey',
  place: 'Somewhere',
  startDate,
  endDate,
  createdBy: 'user-1',
  createdAt: {} as Journey['createdAt'],
  updatedAt: {} as Journey['updatedAt'],
});

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'entry-1',
  journeyId: 'journey-1',
  title: 'A memory',
  date: '2026-01-01',
  story: 'A story',
  people: [],
  tags: [],
  costs: [],
  createdBy: 'user-1',
  createdAt: {} as Entry['createdAt'],
  updatedAt: {} as Entry['updatedAt'],
  ...overrides,
});

describe('dashboard calculations', () => {
  it('counts inclusive Journey dates and merges overlapping ranges', () => {
    expect(calculateDaysCovered([
      journey('2026-10-01', '2026-10-07'),
      journey('2026-10-05', '2026-10-10'),
    ])).toBe(10);
  });

  it('merges adjacent date ranges without double counting', () => {
    expect(calculateDaysCovered([
      journey('2026-10-01', '2026-10-03'),
      journey('2026-10-04', '2026-10-05'),
    ])).toBe(5);
  });

  it('ignores invalid or reversed date ranges', () => {
    expect(calculateDaysCovered([
      journey('2026-02-30', '2026-03-02'),
      journey('2026-04-03', '2026-04-01'),
    ])).toBe(0);
  });

  it('counts unique recorded places using Mapbox IDs when available', () => {
    expect(calculateRecordedPlaceCount([
      entry({ location: { name: 'Paris', latitude: 48.8566, longitude: 2.3522, mapboxPlaceId: 'place.1' } }),
      entry({ id: 'entry-2', location: { name: 'Paris, France', latitude: 48.8566, longitude: 2.3522, mapboxPlaceId: 'place.1' } }),
      entry({ id: 'entry-3', location: { name: 'Lyon', latitude: 45.764, longitude: 4.8357 } }),
    ])).toBe(2);
  });

  it('counts entered people names case-insensitively and trims whitespace', () => {
    expect(calculateNamedPeopleCount([
      entry({ people: ['Amina', ' Samir  Khan '] }),
      entry({ id: 'entry-2', people: ['amina', 'Samir Khan', 'Leila'] }),
    ])).toBe(3);
  });
});
