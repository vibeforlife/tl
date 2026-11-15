import type { RelivePresentation, ReliveScene } from '../../../domain/relive';
import type { ReliveCoordinate } from '../reliveMapGeometry';
import type { ReliveJourneyModel } from '../model/journeyPlaybackModel';
import type { ReliveRouteGeometry } from '../model/reliveRouteGeometry';

export type RelivePlaybackStatus = 'paused' | 'playing' | 'completed';

export interface RelivePlaybackState {
  /** Canonical elapsed playback time. All scene and route progress derives from this. */
  cursorMs: number;
  status: RelivePlaybackStatus;
}

export interface ReliveSceneTiming {
  sceneIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  scene: ReliveScene;
}

export interface RelivePlaybackSnapshot {
  cursorMs: number;
  durationMs: number;
  remainingMs: number;
  status: RelivePlaybackStatus;
  progress: number;
  sceneIndex: number;
  scene: ReliveScene;
  sceneStartMs: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  sceneProgress: number;
  activeEntryId: string | null;
  activeMemoryIndex: number;
  activeStopIndex: number;
  activeLegId: string | null;
  /** Per-leg reveal fractions derived from the canonical playback cursor. */
  routeProgressByLeg: Record<string, number>;
  /** Car coordinate on the shared generated route geometry, or last mapped position. */
  carCoordinate: ReliveCoordinate | null;
}

export interface RelivePlaybackEngine {
  presentation: RelivePresentation;
  durationMs: number;
  sceneTimings: ReliveSceneTiming[];
  journeyModel: ReliveJourneyModel | null;
  routes: Record<string, ReliveRouteGeometry>;
}
