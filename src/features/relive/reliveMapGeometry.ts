import type { Entry } from '../../types/domain';

export type ReliveCoordinate = [longitude: number, latitude: number];

export interface ReliveMapStop {
  id: string;
  title: string;
  coordinate: ReliveCoordinate;
  entryIds: string[];
}

export interface ReliveMapPointFeature {
  type: 'Feature';
  properties: {
    stopId: string;
    entryId: string;
    memoryNumber: string;
    memoryCount: number;
    isActive: number;
    title: string;
  };
  geometry: { type: 'Point'; coordinates: ReliveCoordinate };
}

const EARTH_RADIUS_KM = 6371;

const isValidCoordinate = (entry: Entry): boolean => {
  const location = entry.location;
  return Boolean(
    location &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 && location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 && location.longitude <= 180,
  );
};

const distanceKm = (a: ReliveCoordinate, b: ReliveCoordinate): number => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(b[0] - a[0]);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

const getCoordinate = (entry: Entry): ReliveCoordinate | null => {
  if (!isValidCoordinate(entry) || !entry.location) return null;
  return [entry.location.longitude, entry.location.latitude];
};

export const RELIVE_MAP_CLUSTER_RADIUS_PX = 58;
export const RELIVE_MAP_CLUSTER_MAX_ZOOM = 10;

/**
 * Builds one point per distinct saved location for the detailed camera view.
 * Memories sharing effectively identical coordinates remain a single counted
 * pin; nearby but distinct coordinates can separate once playback zooms in.
 */
export const buildReliveMapPointFeatures = (
  entries: Entry[],
  stops: ReliveMapStop[],
  activeMappedEntryId: string | null,
): { type: 'FeatureCollection'; features: ReliveMapPointFeature[] } => {
  const mapped = entries.flatMap((entry, index) => {
    const coordinate = getCoordinate(entry);
    if (!coordinate) return [];
    const stop = stops.find((candidate) => candidate.entryIds.includes(entry.id));
    if (!stop) return [];
    return [{ entry, index, stopId: stop.id, coordinate }];
  });
  const consumed = new Set<string>();
  const features: ReliveMapPointFeature[] = [];
  const coLocatedToleranceKm = 0.002;

  mapped.forEach((point) => {
    if (consumed.has(point.entry.id)) return;
    const coLocated = mapped.filter((candidate) =>
      candidate.stopId === point.stopId &&
      distanceKm(candidate.coordinate, point.coordinate) <= coLocatedToleranceKm,
    );
    coLocated.forEach((candidate) => consumed.add(candidate.entry.id));

    coLocated.forEach((candidate, fanIndex) => {
      // Memories saved at effectively identical coordinates receive a small
      // deterministic visual fan-out. This is only a marker-layout treatment;
      // route geometry and camera bounds continue using the true coordinates.
      let displayCoordinate = candidate.coordinate;
      if (coLocated.length > 1) {
        const angle = (2 * Math.PI * fanIndex) / coLocated.length - Math.PI / 2;
        const radiusKm = 0.12;
        const latitudeOffset = (radiusKm / 111.32) * Math.sin(angle);
        const longitudeScale = Math.max(0.15, Math.cos(candidate.coordinate[1] * Math.PI / 180));
        const longitudeOffset = (radiusKm / (111.32 * longitudeScale)) * Math.cos(angle);
        displayCoordinate = [candidate.coordinate[0] + longitudeOffset, candidate.coordinate[1] + latitudeOffset];
      }

      features.push({
        type: 'Feature',
        properties: {
          stopId: candidate.stopId,
          entryId: candidate.entry.id,
          memoryNumber: String(candidate.index + 1).padStart(2, '0'),
          memoryCount: 1,
          isActive: candidate.entry.id === activeMappedEntryId ? 1 : 0,
          title: candidate.entry.title,
        },
        geometry: { type: 'Point', coordinates: displayCoordinate },
      });
    });
  });

  features.sort((a, b) => Number(a.properties.memoryNumber) - Number(b.properties.memoryNumber));
  return { type: 'FeatureCollection', features };
};

/**
 * For a Memory without coordinates, retain the most recent earlier mapped
 * Memory as the active map marker. For a mapped Memory, highlight itself.
 */
/** Returns true only when this Memory begins a new grouped map stop. */
export const isReliveNewStopMemory = (
  stops: ReliveMapStop[],
  activeEntryId: string | null,
): boolean => {
  if (!activeEntryId) return false;
  const stop = stops.find((candidate) => candidate.entryIds.includes(activeEntryId));
  return stop?.entryIds[0] === activeEntryId;
};

export const resolveReliveActiveMappedEntryId = (
  entries: Entry[],
  activeEntryId: string | null,
): string | null => {
  if (!activeEntryId) return null;
  const activeIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  if (activeIndex < 0) return null;
  for (let index = activeIndex; index >= 0; index -= 1) {
    if (getCoordinate(entries[index])) return entries[index].id;
  }
  return null;
};

/**
 * Collapses nearby Memory coordinates into one visual stop. This prevents a
 * dense stack of numbered markers when several Memories belong to the same
 * neighbourhood or landmark. The first coordinate remains the stop anchor.
 */
export const buildReliveMapStops = (
  entries: Entry[],
  mergeRadiusKm = 3,
): ReliveMapStop[] => {
  const stops: ReliveMapStop[] = [];
  let currentStop: ReliveMapStop | null = null;

  for (const entry of entries) {
    if (!isValidCoordinate(entry) || !entry.location) continue;
    const coordinate: ReliveCoordinate = [entry.location.longitude, entry.location.latitude];
    const belongsToCurrentStop = currentStop !== null &&
      distanceKm(currentStop.coordinate, coordinate) <= mergeRadiusKm;

    if (belongsToCurrentStop && currentStop) {
      currentStop.entryIds.push(entry.id);
    } else {
      currentStop = {
        id: entry.id,
        title: entry.title,
        coordinate,
        entryIds: [entry.id],
      };
      stops.push(currentStop);
    }
  }

  return stops;
};

/**
 * Returns the most recent mapped stop at or before the current Memory.
 * A Memory without coordinates therefore leaves the atlas at the last known
 * location instead of zooming back out to the entire Journey.
 */
export const resolveReliveActiveStopIndex = (
  entries: Entry[],
  stops: ReliveMapStop[],
  activeEntryId: string | null,
): number => {
  if (!activeEntryId) return -1;
  const activeEntryIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  if (activeEntryIndex < 0) return -1;

  for (let index = activeEntryIndex; index >= 0; index -= 1) {
    const stopIndex = stops.findIndex((stop) => stop.entryIds.includes(entries[index].id));
    if (stopIndex >= 0) return stopIndex;
  }

  return -1;
};
