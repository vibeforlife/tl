import type { Entry, Journey } from '../../types/domain';

const toUtcDay = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(timestamp / 86_400_000);
};

/** Counts inclusive calendar dates across Journeys, merging overlapping ranges. */
export const calculateDaysCovered = (journeys: Journey[]): number => {
  const intervals = journeys
    .map((journey) => ({
      start: toUtcDay(journey.startDate),
      end: toUtcDay(journey.endDate),
    }))
    .filter(
      (range): range is { start: number; end: number } =>
        range.start !== null && range.end !== null && range.end >= range.start,
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (intervals.length === 0) return 0;

  let total = 0;
  let currentStart = intervals[0].start;
  let currentEnd = intervals[0].end;

  for (const interval of intervals.slice(1)) {
    if (interval.start <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart + 1;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }

  return total + currentEnd - currentStart + 1;
};

/** Counts distinct recorded location identities, not inferred cities or regions. */
export const calculateRecordedPlaceCount = (entries: Entry[]): number => {
  const places = new Set<string>();

  for (const entry of entries) {
    const location = entry.location;
    if (!location || !location.name.trim()) continue;

    if (location.mapboxPlaceId?.trim()) {
      places.add(`mapbox:${location.mapboxPlaceId.trim().toLowerCase()}`);
      continue;
    }

    const name = location.name.trim().toLocaleLowerCase();
    const latitude = Number.isFinite(location.latitude)
      ? location.latitude.toFixed(4)
      : 'unknown';
    const longitude = Number.isFinite(location.longitude)
      ? location.longitude.toFixed(4)
      : 'unknown';
    places.add(`${name}:${latitude}:${longitude}`);
  }

  return places.size;
};

/** Counts distinct entered people names, case-insensitively. Alias matching is not inferred. */
export const calculateNamedPeopleCount = (entries: Entry[]): number => {
  const people = new Set<string>();

  for (const entry of entries) {
    for (const person of entry.people) {
      const normalized = person.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (normalized) people.add(normalized);
    }
  }

  return people.size;
};
