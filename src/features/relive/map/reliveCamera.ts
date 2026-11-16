import type { ReliveCoordinate } from '../reliveMapGeometry';
import { reliveDistanceKm } from '../model/journeyPlaybackModel';

export interface ReliveCameraFrame {
  coordinates: ReliveCoordinate[];
  maxZoom: number;
  mode: 'regional' | 'local';
}

const LOCAL_CONTEXT_RADIUS_KM = 120;
const MIN_REGIONAL_ZOOM = 4.8;
const MAX_REGIONAL_ZOOM = 6.8;
const MAX_CITY_ZOOM = 10.8;
const MAX_DENSE_CLUSTER_ZOOM = 11.2;

/**
 * Selects a conservative geographic frame around the active stop.
 * Nearby stops are selected by geographic distance, not chronology, so a
 * short detour does not force the camera to include an entire continent.
 */
export const getReliveAdaptiveCameraFrame = (
  stops: ReliveCoordinate[],
  activeStopIndex: number,
  stopMemoryCounts: number[] = [],
): ReliveCameraFrame | null => {
  if (stops.length === 0 || activeStopIndex < 0 || activeStopIndex >= stops.length) {
    return null;
  }

  const active = stops[activeStopIndex];
  const nearby = stops.filter(
    (coordinate) => reliveDistanceKm(active, coordinate) <= LOCAL_CONTEXT_RADIUS_KM,
  );
  const coordinates = nearby.length > 1 ? nearby : [active];
  const spreadKm = coordinates.reduce(
    (maximum, coordinate) => Math.max(maximum, reliveDistanceKm(active, coordinate)),
    0,
  );
  const activeStopMemoryCount = stopMemoryCounts[activeStopIndex] ?? 1;

  // Dense city stays deserve a closer view even when repeated Memories were
  // grouped into one geographic stop by the journey model.
  let maxZoom = 5.8;
  if (coordinates.length === 1) {
    // A single coordinate has a spread of zero; do not mistake that for a
    // dense multi-stop cluster. Only repeated Memories justify city zoom.
    if (activeStopMemoryCount >= 3) maxZoom = MAX_CITY_ZOOM;
  } else if (spreadKm <= 12) {
    maxZoom = MAX_DENSE_CLUSTER_ZOOM;
  } else if (spreadKm <= 40) {
    maxZoom = 9.5;
  } else if (spreadKm <= 120) {
    maxZoom = 8.2;
  } else if (coordinates.length > 1) {
    maxZoom = MAX_REGIONAL_ZOOM;
  }

  return {
    coordinates,
    maxZoom: Math.max(MIN_REGIONAL_ZOOM, maxZoom),
    mode: coordinates.length === 1 ? 'regional' : 'local',
  };
};

export interface ReliveCameraPlan {
  key: string;
  coordinates: ReliveCoordinate[];
  focusCoordinate: ReliveCoordinate | null;
  maxZoom: number;
  mode: 'transit' | 'regional' | 'local';
}

const TRANSIT_TO_DESTINATION_PROGRESS = 0.62;
const TRANSIT_MAX_ZOOM = 4.8;

/**
 * Chooses framing independently of route reveal and car interpolation.
 * During an incoming leg, briefly frame that leg; once it is substantially
 * complete, or for any later Memory at the stop, frame the active stop's
 * geographic neighbourhood.
 */
export const getReliveCameraPlan = (
  stops: ReliveCoordinate[],
  activeStopIndex: number,
  activeLeg: { id: string; from: ReliveCoordinate; to: ReliveCoordinate } | null,
  sceneProgress: number,
  stopMemoryCounts: number[] = [],
): ReliveCameraPlan | null => {
  if (activeLeg && sceneProgress < TRANSIT_TO_DESTINATION_PROGRESS) {
    return {
      key: `transit:${activeLeg.id}`,
      coordinates: [activeLeg.from, activeLeg.to],
      focusCoordinate: null,
      maxZoom: TRANSIT_MAX_ZOOM,
      mode: 'transit',
    };
  }

  const frame = getReliveAdaptiveCameraFrame(stops, activeStopIndex, stopMemoryCounts);
  if (!frame) return null;

  // A geographic signature keeps the camera stable across consecutive
  // Memories/stops that belong to the same local cluster.
  const activeCoordinate = stops[activeStopIndex];
  const focusKey = `${activeCoordinate[0].toFixed(4)},${activeCoordinate[1].toFixed(4)}`;
  const key = `${frame.mode}:${frame.coordinates
    .map(([longitude, latitude]) => `${longitude.toFixed(4)},${latitude.toFixed(4)}`)
    .join('|')}:focus:${focusKey}`;

  return { ...frame, key, focusCoordinate: activeCoordinate };
};
