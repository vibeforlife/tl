import type { ReliveCoordinate } from '../reliveMapGeometry';
import type { ReliveJourneyLeg } from './journeyPlaybackModel';

export interface ReliveRouteGeometry {
  /** Continuous, unwrapped path used by both the visible route and car motion. */
  coordinates: ReliveCoordinate[];
  distanceKm: number;
}

export type ReliveRouteGeoJsonGeometry =
  | { type: 'LineString'; coordinates: ReliveCoordinate[] }
  | { type: 'MultiLineString'; coordinates: ReliveCoordinate[][] };

export interface ReliveRouteOptions {
  /** Stable seed used to choose the curve direction. */
  seed?: string;
  /** Number of route samples, including both endpoints. */
  samples?: number;
}

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => degrees * Math.PI / 180;

const shortestLongitudeDelta = (from: number, to: number): number =>
  ((to - from + 540) % 360) - 180;

// Preserve the caller's exact longitude whenever the direct segment is already
// the shortest path. Only use an unwrapped equivalent when crossing the
// antimeridian; this avoids floating-point drift at ordinary route endpoints.
const unwrappedEndLongitude = (start: number, end: number): number => {
  const directDelta = end - start;
  return directDelta >= -180 && directDelta < 180
    ? end
    : start + shortestLongitudeDelta(start, end);
};

const distanceKm = (a: ReliveCoordinate, b: ReliveCoordinate): number => {
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const dLat = lat2 - lat1;
  const dLng = radians(shortestLongitudeDelta(a[0], b[0]));
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

const stableSign = (seed: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? 1 : -1;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Generates a deterministic, restrained quadratic curve between two points.
 * Longitude is unwrapped along the shortest path during generation, then
 * normalized for GeoJSON output so antimeridian crossings do not span the map.
 */
export const generateReliveRouteGeometry = (
  start: ReliveCoordinate,
  end: ReliveCoordinate,
  options: ReliveRouteOptions = {},
): ReliveRouteGeometry => {
  const samples = Math.max(2, Math.floor(options.samples ?? 40));
  const totalDistanceKm = distanceKm(start, end);
  if (totalDistanceKm < 0.02) {
    return {
      coordinates: [[start[0], start[1]], [unwrappedEndLongitude(start[0], end[0]), end[1]]],
      distanceKm: totalDistanceKm,
    };
  }

  const meanLatitude = (start[1] + end[1]) / 2;
  const longitudeScale = Math.max(0.08, Math.cos(radians(meanLatitude)));
  const deltaLongitude = shortestLongitudeDelta(start[0], end[0]);
  const dx = deltaLongitude * longitudeScale;
  const dy = end[1] - start[1];
  const vectorLength = Math.hypot(dx, dy) || 1;
  const normalX = -dy / vectorLength;
  const normalY = dx / vectorLength;
  const curveKm = clamp(totalDistanceKm * 0.045, 0.08, 28);
  const curveDegrees = curveKm / 111.32;
  const curveSign = stableSign(options.seed ?? `${start.join(',')}|${end.join(',')}`);
  const controlX = (start[0] + deltaLongitude / 2) +
    (normalX * curveDegrees) / longitudeScale * curveSign;
  const controlY = (start[1] + end[1]) / 2 +
    normalY * curveDegrees * curveSign;

  const coordinates: ReliveCoordinate[] = [];
  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1);
    const inverse = 1 - t;
    const longitude =
      inverse * inverse * start[0] +
      2 * inverse * t * controlX +
      t * t * (start[0] + deltaLongitude);
    const latitude =
      inverse * inverse * start[1] +
      2 * inverse * t * controlY +
      t * t * end[1];
    // Keep longitudes unwrapped internally: a dateline crossing must remain
    // a short continuous segment. The map renderer can split this line for
    // GeoJSON display without changing the car's interpolation path.
    coordinates.push([longitude, clamp(latitude, -90, 90)]);
  }

  // Preserve exact saved endpoints (apart from longitude normalization).
  coordinates[0] = [start[0], start[1]];
  coordinates[coordinates.length - 1] = [
    unwrappedEndLongitude(start[0], end[0]),
    end[1],
  ];

  return { coordinates, distanceKm: totalDistanceKm };
};

export const generateReliveJourneyRoutes = (
  legs: ReliveJourneyLeg[],
  options: ReliveRouteOptions = {},
): Record<string, ReliveRouteGeometry> =>
  Object.fromEntries(legs.map((leg) => [
    leg.id,
    generateReliveRouteGeometry(leg.from, leg.to, {
      ...options,
      seed: options.seed ? `${options.seed}:${leg.id}` : leg.id,
    }),
  ]));

/**
 * Converts the continuous internal route into standards-compliant GeoJSON.
 * Antimeridian crossings are split at +/-180 so the map draws two nearby
 * segments instead of a line spanning almost the entire world.
 */
export const toReliveRouteGeoJsonGeometry = (
  coordinates: ReliveCoordinate[],
): ReliveRouteGeoJsonGeometry => {
  if (coordinates.length <= 1) {
    return { type: 'LineString', coordinates: coordinates.map(([lon, lat]) => [lon, lat]) };
  }

  const zoneFor = (longitude: number) => Math.floor((longitude + 180) / 360);
  const normalizeInZone = (longitude: number, zone: number) =>
    longitude - zone * 360;

  const firstZone = zoneFor(coordinates[0][0]);
  let current: ReliveCoordinate[] = [[
    normalizeInZone(coordinates[0][0], firstZone),
    coordinates[0][1],
  ]];
  const segments: ReliveCoordinate[][] = [];

  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    const fromZone = zoneFor(from[0]);
    const toZone = zoneFor(to[0]);

    if (fromZone === toZone) {
      current.push([normalizeInZone(to[0], toZone), to[1]]);
      continue;
    }

    // Route sampling is dense enough that a segment can cross at most one
    // world boundary; handle eastbound and westbound crossings separately.
    const eastbound = toZone > fromZone;
    const boundary = eastbound ? 180 + fromZone * 360 : -180 + fromZone * 360;
    const fraction = (boundary - from[0]) / (to[0] - from[0]);
    const crossingLatitude = from[1] + (to[1] - from[1]) * fraction;

    current.push([eastbound ? 180 : -180, crossingLatitude]);
    segments.push(current);
    current = [[eastbound ? -180 : 180, crossingLatitude]];
    current.push([normalizeInZone(to[0], toZone), to[1]]);
  }

  segments.push(current);
  return segments.length === 1
    ? { type: 'LineString', coordinates: segments[0] }
    : { type: 'MultiLineString', coordinates: segments };
};

/** Returns the point at a fraction of the route's cumulative geographic length. */
export const interpolateReliveRoute = (
  coordinates: ReliveCoordinate[],
  progress: number,
): ReliveCoordinate | null => {
  if (coordinates.length === 0) return null;
  if (coordinates.length === 1) return coordinates[0];
  const normalizedProgress = clamp(progress, 0, 1);
  if (normalizedProgress <= 0) return coordinates[0];
  if (normalizedProgress >= 1) return coordinates[coordinates.length - 1];
  const segmentLengths = coordinates.slice(1).map((point, index) =>
    distanceKm(coordinates[index], point),
  );
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) return coordinates[0];

  const targetDistance = totalLength * normalizedProgress;
  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (traversed + segmentLength >= targetDistance || index === segmentLengths.length - 1) {
      const segmentProgress = segmentLength === 0
        ? 0
        : clamp((targetDistance - traversed) / segmentLength, 0, 1);
      const from = coordinates[index];
      const to = coordinates[index + 1];
      const deltaLongitude = shortestLongitudeDelta(from[0], to[0]);
      return [
        from[0] + deltaLongitude * segmentProgress,
        from[1] + (to[1] - from[1]) * segmentProgress,
      ];
    }
    traversed += segmentLength;
  }
  return coordinates[coordinates.length - 1];
};

export const getReliveRoutePrefix = (
  coordinates: ReliveCoordinate[],
  progress: number,
): ReliveCoordinate[] => {
  if (coordinates.length < 2) return [...coordinates];
  const normalizedProgress = clamp(progress, 0, 1);
  if (normalizedProgress <= 0) return [coordinates[0], coordinates[0]];
  if (normalizedProgress >= 1) return [...coordinates];

  const segmentLengths = coordinates.slice(1).map((point, index) =>
    distanceKm(coordinates[index], point),
  );
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  const targetDistance = totalLength * normalizedProgress;
  const result = [coordinates[0]];
  let traversed = 0;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (traversed + segmentLength < targetDistance) {
      result.push(coordinates[index + 1]);
      traversed += segmentLength;
      continue;
    }
    const point = interpolateReliveRoute(coordinates, normalizedProgress);
    if (point) result.push(point);
    break;
  }
  return result;
};
