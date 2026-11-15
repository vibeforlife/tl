import type { RelivePlaybackEngine, RelivePlaybackSnapshot } from '../engine/relivePlaybackTypes';
import type { ReliveCoordinate } from '../reliveMapGeometry';
import {
  getReliveRoutePrefix,
  interpolateReliveRoute,
  toReliveRouteGeoJsonGeometry,
} from '../model/reliveRouteGeometry';

export type ReliveStopProperties = {
  memoryCount: number;
  isActive: number;
  memoryNumber: number;
  title: string;
};

export type ReliveRouteProperties = {
  legId: string;
  progress: number;
};

export type RelivePointCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  ReliveStopProperties
>;

export type ReliveLineCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  ReliveRouteProperties
>;

export interface ReliveMapData {
  stops: RelivePointCollection;
  contextRoutes: ReliveLineCollection;
  travelledRoutes: ReliveLineCollection;
  carBearing: number | null;
}

const shortestLongitudeDelta = (from: number, to: number): number =>
  ((to - from + 540) % 360) - 180;

const toBearing = (
  from: ReliveCoordinate,
  to: ReliveCoordinate,
): number => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeA = radians(from[1]);
  const latitudeB = radians(to[1]);
  const longitudeDelta = radians(shortestLongitudeDelta(from[0], to[0]));
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeB);
  const x = Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

export const getReliveRouteBearing = (
  coordinates: ReliveCoordinate[],
  progress: number,
): number | null => {
  if (coordinates.length < 2) return null;
  const safeProgress = Math.max(0, Math.min(1, progress));
  const fromProgress = safeProgress >= 1 ? Math.max(0, safeProgress - 0.01) : safeProgress;
  const toProgress = safeProgress >= 1 ? safeProgress : Math.min(1, safeProgress + 0.01);
  const from = interpolateReliveRoute(coordinates, fromProgress);
  const to = interpolateReliveRoute(coordinates, toProgress);
  if (!from || !to || (from[0] === to[0] && from[1] === to[1])) return null;
  return toBearing(from, to);
};

export const buildReliveStopFeatures = (
  engine: RelivePlaybackEngine,
  activeStopIndex: number,
): RelivePointCollection => ({
  type: 'FeatureCollection',
  features: (engine.journeyModel?.stops ?? []).map((stop, index) => ({
    type: 'Feature',
    id: stop.id,
    geometry: { type: 'Point', coordinates: stop.coordinate },
    properties: {
      memoryCount: stop.entryIds.length,
      isActive: index === activeStopIndex ? 1 : 0,
      memoryNumber: stop.firstEntryIndex + 1,
      title: stop.title,
    },
  })),
});

export const buildReliveContextRouteFeatures = (
  engine: RelivePlaybackEngine,
): ReliveLineCollection => ({
  type: 'FeatureCollection',
  features: Object.entries(engine.routes).map(([legId, route]) => ({
    type: 'Feature',
    properties: { legId, progress: 1 },
    geometry: toReliveRouteGeoJsonGeometry(route.coordinates),
  })),
});

export const buildReliveTravelledRouteFeatures = (
  engine: RelivePlaybackEngine,
  routeProgressByLeg: Record<string, number>,
): ReliveLineCollection => ({
  type: 'FeatureCollection',
  features: (engine.journeyModel?.legs ?? []).flatMap((leg) => {
    const progress = routeProgressByLeg[leg.id] ?? 0;
    const route = engine.routes[leg.id];
    if (!route || progress <= 0) return [];
    return [{
      type: 'Feature' as const,
      properties: { legId: leg.id, progress },
      geometry: toReliveRouteGeoJsonGeometry(
        getReliveRoutePrefix(route.coordinates, progress),
      ),
    }];
  }),
});

export const getReliveSnapshotCarBearing = (
  engine: RelivePlaybackEngine,
  activeLegId: string | null,
  routeProgressByLeg: Record<string, number>,
): number | null => {
  const activeRoute = activeLegId ? engine.routes[activeLegId] : null;
  if (!activeLegId || !activeRoute) return null;
  return getReliveRouteBearing(
    activeRoute.coordinates,
    routeProgressByLeg[activeLegId] ?? 0,
  );
};

export const buildReliveMapData = (
  engine: RelivePlaybackEngine,
  snapshot: RelivePlaybackSnapshot,
): ReliveMapData => ({
  stops: buildReliveStopFeatures(engine, snapshot.activeStopIndex),
  contextRoutes: buildReliveContextRouteFeatures(engine),
  travelledRoutes: buildReliveTravelledRouteFeatures(engine, snapshot.routeProgressByLeg),
  carBearing: getReliveSnapshotCarBearing(engine, snapshot.activeLegId, snapshot.routeProgressByLeg),
});

/** Unwraps sequential stop longitudes so camera bounds follow the short route. */
export const getReliveUnwrappedStopCoordinates = (
  coordinates: ReliveCoordinate[],
): ReliveCoordinate[] => {
  if (coordinates.length === 0) return [];
  const result: ReliveCoordinate[] = [[coordinates[0][0], coordinates[0][1]]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = result[index - 1][0];
    const longitude = previous + shortestLongitudeDelta(previous, coordinates[index][0]);
    result.push([longitude, coordinates[index][1]]);
  }
  return result;
};
