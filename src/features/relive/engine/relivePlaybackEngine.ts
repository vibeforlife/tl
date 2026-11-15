import type { RelivePresentation } from '../../../domain/relive';
import type { ReliveCoordinate } from '../reliveMapGeometry';
import type { ReliveJourneyModel } from '../model/journeyPlaybackModel';
import { generateReliveJourneyRoutes, interpolateReliveRoute } from '../model/reliveRouteGeometry';
import type {
  RelivePlaybackEngine,
  RelivePlaybackSnapshot,
  RelivePlaybackState,
  RelivePlaybackStatus,
  ReliveSceneTiming,
} from './relivePlaybackTypes';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const createRelivePlaybackEngine = (
  presentation: RelivePresentation,
  journeyModel: ReliveJourneyModel | null = null,
): RelivePlaybackEngine => {
  let cursor = 0;
  const sceneTimings: ReliveSceneTiming[] = presentation.scenes.map((scene, sceneIndex) => {
    const startMs = cursor;
    const durationMs = Math.max(0, Number.isFinite(scene.durationSeconds) ? scene.durationSeconds * 1000 : 0);
    cursor += durationMs;
    return {
      sceneIndex,
      startMs,
      endMs: cursor,
      durationMs,
      scene,
    };
  });

  const routes = journeyModel
    ? generateReliveJourneyRoutes(journeyModel.legs)
    : {};
  return { presentation, durationMs: cursor, sceneTimings, journeyModel, routes };
};

export const createRelivePlaybackState = (): RelivePlaybackState => ({
  cursorMs: 0,
  status: 'paused',
});

const resolveSceneTiming = (
  engine: RelivePlaybackEngine,
  cursorMs: number,
): ReliveSceneTiming => {
  const last = engine.sceneTimings[engine.sceneTimings.length - 1];
  if (!last) {
    throw new Error('A Relive presentation must contain at least one scene.');
  }

  const cursor = clamp(cursorMs, 0, engine.durationMs);
  return engine.sceneTimings.find((timing) =>
    cursor < timing.endMs || timing.sceneIndex === engine.sceneTimings.length - 1,
  ) ?? last;
};

export const getRelivePlaybackSnapshot = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
): RelivePlaybackSnapshot => {
  const cursorMs = clamp(state.cursorMs, 0, engine.durationMs);
  const timing = resolveSceneTiming(engine, cursorMs);
  const sceneElapsedMs = clamp(cursorMs - timing.startMs, 0, timing.durationMs);
  const sceneProgress = timing.durationMs > 0 ? sceneElapsedMs / timing.durationMs : 1;
  const model = engine.journeyModel;
  const activeEntryId = timing.scene.type === 'memory' ? timing.scene.entryId : null;
  const activeMemory = activeEntryId
    ? model?.memories.find((memory) => memory.entry.id === activeEntryId) ?? null
    : null;

  let activeStopIndex = activeMemory?.displayStopId
    ? model?.stops.findIndex((stop) => stop.id === activeMemory.displayStopId) ?? -1
    : -1;
  if (timing.scene.type === 'closing' && model?.stops.length) {
    activeStopIndex = model.stops.length - 1;
  }

  const routeProgressByLeg: Record<string, number> = {};
  let activeLegId: string | null = null;
  if (model) {
    model.legs.forEach((leg, legIndex) => {
      let legProgress = 0;
      if (timing.scene.type === 'closing') {
        legProgress = 1;
      } else if (timing.scene.type === 'memory' && activeStopIndex >= 0) {
        if (legIndex < activeStopIndex - 1) {
          legProgress = 1;
        } else if (legIndex === activeStopIndex - 1) {
          const isEnteringStop = activeMemory?.stopId === leg.toStopId &&
            model.stops[activeStopIndex]?.entryIds[0] === activeEntryId;
          legProgress = isEnteringStop ? sceneProgress : 1;
          if (isEnteringStop) activeLegId = leg.id;
        }
      }
      routeProgressByLeg[leg.id] = legProgress;
    });
  }

  let carCoordinate: ReliveCoordinate | null = activeMemory?.displayCoordinate ?? null;
  if (timing.scene.type === 'opening') {
    carCoordinate = null;
  } else if (timing.scene.type === 'closing' && model?.stops.length) {
    carCoordinate = model.stops[model.stops.length - 1].coordinate;
  } else if (activeLegId) {
    const route = engine.routes[activeLegId];
    carCoordinate = route
      ? interpolateReliveRoute(route.coordinates, routeProgressByLeg[activeLegId])
      : carCoordinate;
  }

  return {
    cursorMs,
    durationMs: engine.durationMs,
    remainingMs: Math.max(0, engine.durationMs - cursorMs),
    status: state.status,
    progress: engine.durationMs > 0 ? cursorMs / engine.durationMs : 1,
    sceneIndex: timing.sceneIndex,
    scene: timing.scene,
    sceneStartMs: timing.startMs,
    sceneElapsedMs,
    sceneDurationMs: timing.durationMs,
    sceneProgress,
    activeEntryId,
    activeMemoryIndex: activeMemory?.chronologicalIndex ?? -1,
    activeStopIndex,
    activeLegId,
    routeProgressByLeg,
    carCoordinate,
  };
};

export const playRelive = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
): RelivePlaybackState => {
  if (engine.durationMs <= 0) return { cursorMs: 0, status: 'completed' };
  if (state.cursorMs >= engine.durationMs) return { cursorMs: 0, status: 'playing' };
  return { ...state, status: 'playing' };
};

export const pauseRelive = (
  state: RelivePlaybackState,
): RelivePlaybackState => ({ ...state, status: 'paused' });

export const resumeRelive = playRelive;

export const tickRelivePlayback = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
  deltaMs: number,
): RelivePlaybackState => {
  if (state.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  const cursorMs = clamp(state.cursorMs + deltaMs, 0, engine.durationMs);
  return {
    cursorMs,
    status: cursorMs >= engine.durationMs ? 'completed' : 'playing',
  };
};

/** Seeking preserves play/pause state, except seeking to the end completes playback. */
export const seekRelive = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
  cursorMs: number,
): RelivePlaybackState => {
  const nextCursor = clamp(Number.isFinite(cursorMs) ? cursorMs : 0, 0, engine.durationMs);
  return {
    cursorMs: nextCursor,
    status: nextCursor >= engine.durationMs ? 'completed' : state.status,
  };
};

export const seekReliveToScene = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
  sceneIndex: number,
): RelivePlaybackState => {
  const timing = engine.sceneTimings[clamp(Math.floor(sceneIndex), 0, engine.sceneTimings.length - 1)];
  if (!timing) return state;
  return { cursorMs: timing.startMs, status: state.status === 'playing' ? 'playing' : 'paused' };
};

export const nextReliveScene = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
): RelivePlaybackState => {
  const snapshot = getRelivePlaybackSnapshot(engine, state);
  const nextTiming = engine.sceneTimings[snapshot.sceneIndex + 1];
  if (!nextTiming) return { cursorMs: engine.durationMs, status: 'completed' };
  return { cursorMs: nextTiming.startMs, status: state.status === 'playing' ? 'playing' : 'paused' };
};

export const previousReliveScene = (
  engine: RelivePlaybackEngine,
  state: RelivePlaybackState,
): RelivePlaybackState => {
  const snapshot = getRelivePlaybackSnapshot(engine, state);
  const previousTiming = engine.sceneTimings[Math.max(0, snapshot.sceneIndex - 1)];
  return {
    cursorMs: previousTiming?.startMs ?? 0,
    status: state.status === 'playing' ? 'playing' : 'paused',
  };
};

export const restartRelive = (): RelivePlaybackState => ({
  cursorMs: 0,
  status: 'paused',
});

export const completeRelive = (
  engine: RelivePlaybackEngine,
): RelivePlaybackState => ({ cursorMs: engine.durationMs, status: 'completed' });

export const isRelivePlaybackStatus = (
  value: string,
): value is RelivePlaybackStatus =>
  value === 'paused' || value === 'playing' || value === 'completed';
