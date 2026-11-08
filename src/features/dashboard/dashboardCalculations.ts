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

    const name = location.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
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

const normalizePersonName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export interface NamedPersonSummary {
  key: string;
  label: string;
  count: number;
}

/** Returns distinct entered names and Memory frequency; alias matching is never inferred. */
export const calculatePeopleSummary = (entries: Entry[]): NamedPersonSummary[] => {
  const people = new Map<string, NamedPersonSummary>();

  for (const entry of entries) {
    const namesInThisMemory = new Set<string>();
    for (const person of entry.people) {
      const label = person.trim().replace(/\s+/g, ' ');
      const key = normalizePersonName(label);
      if (!key || namesInThisMemory.has(key)) continue;
      namesInThisMemory.add(key);

      const existing = people.get(key);
      people.set(key, {
        key,
        label: existing?.label ?? label,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return [...people.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
};

export const calculateNamedPeopleCount = (entries: Entry[]): number =>
  calculatePeopleSummary(entries).length;

export interface MemoryCounts {
  total: number;
  authoredByCurrentUser: number;
  authoredByOthers: number;
}

/** Counts unique Memories by journey + document ID and preserves author attribution. */
export const calculateMemoryCounts = (
  entries: Entry[],
  currentUserId: string,
): MemoryCounts => {
  const uniqueEntries = new Map<string, Entry>();

  for (const entry of entries) {
    uniqueEntries.set(`${entry.journeyId}:${entry.id}`, entry);
  }

  let authoredByCurrentUser = 0;
  let authoredByOthers = 0;

  for (const entry of uniqueEntries.values()) {
    if (entry.createdBy === currentUserId) {
      authoredByCurrentUser += 1;
    } else {
      authoredByOthers += 1;
    }
  }

  return {
    total: uniqueEntries.size,
    authoredByCurrentUser,
    authoredByOthers,
  };
};

export interface DashboardCoreStats {
  journeyCount: number;
  daysCovered: number;
  memories: MemoryCounts;
  recordedPlaces: number;
  namedPeople: number;
}

/** Calculates dashboard totals from the Journeys and accessible Memories supplied by the caller. */
export const calculateDashboardCoreStats = (
  journeys: Journey[],
  entries: Entry[],
  currentUserId: string,
): DashboardCoreStats => ({
  journeyCount: new Set(journeys.map((journey) => journey.id)).size,
  daysCovered: calculateDaysCovered(journeys),
  memories: calculateMemoryCounts(entries, currentUserId),
  recordedPlaces: calculateRecordedPlaceCount(entries),
  namedPeople: calculateNamedPeopleCount(entries),
});
