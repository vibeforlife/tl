import { describe, expect, it } from 'vitest';
import type { RelivePresentation } from '../../../domain/relive';
import type { Entry } from '../../../types/domain';
import { buildReliveJourneyModel } from '../model/journeyPlaybackModel';
import {
  completeRelive,
  createRelivePlaybackEngine,
  createRelivePlaybackState,
  getRelivePlaybackSnapshot,
  nextReliveScene,
  pauseRelive,
  playRelive,
  previousReliveScene,
  restartRelive,
  resumeRelive,
  seekRelive,
  seekReliveToScene,
  tickRelivePlayback,
} from './relivePlaybackEngine';

const presentation: RelivePresentation = {
  journeyId: 'journey-1',
  title: 'A Journey',
  durationMode: 'journey',
  memoryCount: 2,
  estimatedDurationSeconds: 10,
  scenes: [
    { id: 'opening', type: 'opening', title: 'Opening', subtitle: 'Start', durationSeconds: 2 },
    { id: 'memory-a', type: 'memory', entryId: 'a', title: 'A', date: '2026-01-01', highlight: '', durationSeconds: 3 },
    { id: 'memory-b', type: 'memory', entryId: 'b', title: 'B', date: '2026-01-02', highlight: '', durationSeconds: 3 },
    { id: 'closing', type: 'closing', title: 'Closing', subtitle: 'End', durationSeconds: 2 },
  ],
};

describe('Relive canonical playback engine', () => {
  const engine = createRelivePlaybackEngine(presentation);

  it('derives scene selection and progress from one millisecond cursor', () => {
    const snapshot = getRelivePlaybackSnapshot(engine, { cursorMs: 3500, status: 'paused' });
    expect(snapshot.sceneIndex).toBe(1);
    expect(snapshot.scene.id).toBe('memory-a');
    expect(snapshot.sceneElapsedMs).toBe(1500);
    expect(snapshot.sceneProgress).toBe(0.5);
    expect(snapshot.progress).toBe(0.35);
  });

  it('supports play, pause, and exact resume from the canonical cursor', () => {
    let state = playRelive(engine, createRelivePlaybackState());
    state = tickRelivePlayback(engine, state, 1250);
    state = pauseRelive(state);
    expect(state).toEqual({ cursorMs: 1250, status: 'paused' });
    state = resumeRelive(engine, state);
    state = tickRelivePlayback(engine, state, 500);
    expect(state).toEqual({ cursorMs: 1750, status: 'playing' });
  });

  it('supports seeking while paused or playing and clamps to the presentation bounds', () => {
    const paused = seekRelive(engine, createRelivePlaybackState(), 4000);
    expect(paused).toEqual({ cursorMs: 4000, status: 'paused' });
    const playing = seekRelive(engine, { cursorMs: 0, status: 'playing' }, 5000);
    expect(playing).toEqual({ cursorMs: 5000, status: 'playing' });
    expect(seekRelive(engine, paused, -10).cursorMs).toBe(0);
    expect(seekRelive(engine, paused, 999999)).toEqual({ cursorMs: 10000, status: 'completed' });
  });

  it('moves next and previous by scene boundaries', () => {
    const state = { cursorMs: 2500, status: 'paused' as const };
    expect(nextReliveScene(engine, state).cursorMs).toBe(5000);
    expect(previousReliveScene(engine, state).cursorMs).toBe(0);
    expect(seekReliveToScene(engine, state, 2).cursorMs).toBe(5000);
  });

  it('completes at the exact duration and can restart cleanly', () => {
    const started = playRelive(engine, createRelivePlaybackState());
    const completed = tickRelivePlayback(engine, started, 20000);
    expect(completed).toEqual({ cursorMs: 10000, status: 'completed' });
    expect(getRelivePlaybackSnapshot(engine, completed).scene.id).toBe('closing');
    expect(restartRelive()).toEqual({ cursorMs: 0, status: 'paused' });
    expect(completeRelive(engine)).toEqual({ cursorMs: 10000, status: 'completed' });
  });

  it('derives the active stop, leg reveal and car position from the same playback cursor', () => {
    const entries = [
      { id: 'a', title: 'A', date: '2026-01-01', location: { name: 'A', latitude: 19.076, longitude: 72.877 } },
      { id: 'b', title: 'B', date: '2026-01-02', location: { name: 'B', latitude: 13.0827, longitude: 80.2707 } },
    ] as Entry[];
    const model = buildReliveJourneyModel(entries);
    const routePresentation: RelivePresentation = {
      ...presentation,
      scenes: [
        { id: 'opening', type: 'opening', title: 'Opening', subtitle: 'Start', durationSeconds: 2 },
        { id: 'memory-a', type: 'memory', entryId: 'a', title: 'A', date: '2026-01-01', highlight: '', durationSeconds: 3 },
        { id: 'memory-b', type: 'memory', entryId: 'b', title: 'B', date: '2026-01-02', highlight: '', durationSeconds: 3 },
        { id: 'closing', type: 'closing', title: 'Closing', subtitle: 'End', durationSeconds: 2 },
      ],
    };
    const routeEngine = createRelivePlaybackEngine(routePresentation, model);
    const inboundLeg = model.legs[0];

    const halfway = getRelivePlaybackSnapshot(routeEngine, { cursorMs: 6500, status: 'playing' });
    expect(halfway.scene.id).toBe('memory-b');
    expect(halfway.activeEntryId).toBe('b');
    expect(halfway.activeMemoryIndex).toBe(1);
    expect(halfway.activeStopIndex).toBe(1);
    expect(halfway.activeLegId).toBe(inboundLeg.id);
    expect(halfway.routeProgressByLeg[inboundLeg.id]).toBe(0.5);
    expect(halfway.carCoordinate).not.toBeNull();
    expect(Number.isFinite(halfway.carCoordinate?.[0])).toBe(true);
    expect(Number.isFinite(halfway.carCoordinate?.[1])).toBe(true);

    const completed = getRelivePlaybackSnapshot(routeEngine, { cursorMs: 10000, status: 'completed' });
    expect(completed.routeProgressByLeg[inboundLeg.id]).toBe(1);
    expect(completed.carCoordinate).toEqual(inboundLeg.to);
  });

  it('does not advance while paused or for invalid deltas', () => {
    const paused = createRelivePlaybackState();
    expect(tickRelivePlayback(engine, paused, 1000)).toBe(paused);
    const playing = playRelive(engine, paused);
    expect(tickRelivePlayback(engine, playing, Number.NaN)).toBe(playing);
    expect(tickRelivePlayback(engine, playing, -100)).toBe(playing);
  });
});
