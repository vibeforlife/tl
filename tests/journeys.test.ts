import { describe, expect, it } from 'vitest';
import { validateJourneyInput } from '../src/services/firebase/journeys';

describe('Journey validation', () => {
  it('requires the four Journey fields', () => {
    expect(validateJourneyInput({ name: '', place: 'Japan', startDate: '2026-04-01', endDate: '2026-04-10' })).toBe('Please enter a journey name.');
    expect(validateJourneyInput({ name: 'Japan', place: '', startDate: '2026-04-01', endDate: '2026-04-10' })).toBe('Please enter a place.');
    expect(validateJourneyInput({ name: 'Japan', place: 'Japan', startDate: '', endDate: '2026-04-10' })).toBe('Please choose a start date.');
    expect(validateJourneyInput({ name: 'Japan', place: 'Japan', startDate: '2026-04-01', endDate: '' })).toBe('Please choose an end date.');
  });

  it('rejects an end date before the start date', () => {
    expect(validateJourneyInput({ name: 'Japan', place: 'Japan', startDate: '2026-04-10', endDate: '2026-04-01' })).toBe('End date cannot be before the start date.');
  });

  it('accepts a valid Journey', () => {
    expect(validateJourneyInput({ name: 'Japan 2026', place: 'Japan', startDate: '2026-04-01', endDate: '2026-04-10' })).toBeNull();
  });
});
