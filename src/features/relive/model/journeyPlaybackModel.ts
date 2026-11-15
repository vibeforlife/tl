import type { Entry } from '../../../types/domain';
import type { ReliveCoordinate } from '../reliveMapGeometry';

export interface ReliveJourneyStop {
  id: string;
  title: string;
  coordinate: ReliveCoordinate;
  entryIds: string[];
  firstEntryIndex: number;
  lastEntryIndex: number;
}

export interface ReliveJourneyMemory {
  entry: Entry;
  chronologicalIndex: number;
  /** Actual saved coordinate; null when the Memory has no valid coordinates. */
  mappedCoordinate: ReliveCoordinate | null;
  /** Last mapped coordinate at or before this Memory, for display continuity. */
  displayCoordinate: ReliveCoordinate | null;
  /** Geographic stop currently represented on the map, including inherited position. */
  displayStopId: string | null;
  /** Stop created/continued by this Memory; null when the Memory has no valid coordinates. */
  stopId: string | null;
}

export interface ReliveJourneyLeg {
  id: string;
  fromStopId: string;
  toStopId: string;
  from: ReliveCoordinate;
  to: ReliveCoordinate;
  fromEntryId: string;
  toEntryId: string;
}

export interface ReliveJourneyModel {
  memories: ReliveJourneyMemory[];
  stops: ReliveJourneyStop[];
  legs: ReliveJourneyLeg[];
  mappedMemoryCount: number;
}

const EARTH_RADIUS_KM = 6371;
export const RELIVE_STOP_MERGE_RADIUS_KM = 3;

export const isReliveCoordinateValid = (
  latitude: number,
  longitude: number,
): boolean =>
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

export const getReliveEntryCoordinate = (
  entry: Entry,
): ReliveCoordinate | null => {
  const location = entry.location;
  if (!location || !isReliveCoordinateValid(location.latitude, location.longitude)) {
    return null;
  }
  return [location.longitude, location.latitude];
};

export const reliveDistanceKm = (
  a: ReliveCoordinate,
  b: ReliveCoordinate,
): number => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeA = radians(a[1]);
  const latitudeB = radians(b[1]);
  const deltaLatitude = latitudeB - latitudeA;
  // Normalize the longitude delta so antimeridian-neighbouring points remain close.
  const rawDeltaLongitude = radians(b[0] - a[0]);
  const deltaLongitude = ((rawDeltaLongitude + Math.PI) % (2 * Math.PI) + 2 * Math.PI) %
    (2 * Math.PI) - Math.PI;
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) *
    Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

const chronologicalCompare = (a: Entry, b: Entry): number => {
  const dateTimeA = `${a.date}T${a.time || '00:00'}`;
  const dateTimeB = `${b.date}T${b.time || '00:00'}`;
  return dateTimeA.localeCompare(dateTimeB) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id);
};

/**
 * Creates the geographic/timeline model used by Relive.
 *
 * Mapped Memories are grouped only against the current consecutive stop.
 * Memories without valid coordinates remain in chronological order and inherit
 * the previous mapped coordinate for display, without creating a route leg or
 * changing the current geographic stop.
 */
export const buildReliveJourneyModel = (
  sourceEntries: Entry[],
  mergeRadiusKm = RELIVE_STOP_MERGE_RADIUS_KM,
): ReliveJourneyModel => {
  const entries = [...sourceEntries].sort(chronologicalCompare);
  const stops: ReliveJourneyStop[] = [];
  const memories: ReliveJourneyMemory[] = [];
  let lastMappedCoordinate: ReliveCoordinate | null = null;
  let currentStop: ReliveJourneyStop | null = null;

  entries.forEach((entry, chronologicalIndex) => {
    const mappedCoordinate = getReliveEntryCoordinate(entry);
    let stopId: string | null = null;

    if (mappedCoordinate) {
      const isWithinCurrentStop = currentStop !== null &&
        reliveDistanceKm(currentStop.coordinate, mappedCoordinate) <= mergeRadiusKm;

      if (isWithinCurrentStop && currentStop) {
        currentStop.entryIds.push(entry.id);
        currentStop.lastEntryIndex = chronologicalIndex;
      } else {
        currentStop = {
          id: entry.id,
          title: entry.title,
          coordinate: mappedCoordinate,
          entryIds: [entry.id],
          firstEntryIndex: chronologicalIndex,
          lastEntryIndex: chronologicalIndex,
        };
        stops.push(currentStop);
      }

      stopId = currentStop.id;
      lastMappedCoordinate = mappedCoordinate;
    }

    memories.push({
      entry,
      chronologicalIndex,
      mappedCoordinate,
      displayCoordinate: mappedCoordinate ?? lastMappedCoordinate,
      displayStopId: currentStop?.id ?? null,
      stopId,
    });
  });

  const legs: ReliveJourneyLeg[] = stops.slice(1).map((stop, index) => {
    const previousStop = stops[index];
    return {
      id: `${previousStop.id}->${stop.id}`,
      fromStopId: previousStop.id,
      toStopId: stop.id,
      from: previousStop.coordinate,
      to: stop.coordinate,
      fromEntryId: previousStop.entryIds[previousStop.entryIds.length - 1],
      toEntryId: stop.entryIds[0],
    };
  });

  return {
    memories,
    stops,
    legs,
    mappedMemoryCount: memories.filter((memory) => memory.mappedCoordinate !== null).length,
  };
};
