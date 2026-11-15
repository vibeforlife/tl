import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Entry, Journey, ReliveConfiguration } from '../../types/domain';
import {
  buildRelivePresentation,
  formatReliveDuration,
} from '../../domain/relive';
import {
  buildReliveJourneyModel,
} from './model/journeyPlaybackModel';
import {
  createRelivePlaybackEngine,
  createRelivePlaybackState,
  getRelivePlaybackSnapshot,
  nextReliveScene,
  pauseRelive,
  playRelive,
  previousReliveScene,
  restartRelive,
  resumeRelive,
  seekReliveToScene,
  tickRelivePlayback,
} from './engine/relivePlaybackEngine';
import type { RelivePlaybackState } from './engine/relivePlaybackTypes';
import { ReliveMapRenderer } from './map/ReliveMapRenderer';
import './RelivePlayer.css';

type Props = {
  journey: Journey;
  entries: Entry[];
  configuration: ReliveConfiguration;
  onClose: () => void;
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export function RelivePlayer({ journey, entries, configuration, onClose }: Props) {
  const presentation = useMemo(
    () => buildRelivePresentation(journey, entries, configuration),
    [journey, entries, configuration],
  );
  const memoryScenes = useMemo(
    () => presentation.scenes.filter((item) => item.type === 'memory'),
    [presentation.scenes],
  );
  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  );
  const presentationEntries = useMemo(
    () => memoryScenes.flatMap((item) => {
      const entry = entryById.get(item.entryId);
      return entry ? [entry] : [];
    }),
    [memoryScenes, entryById],
  );
  const journeyModel = useMemo(
    () => buildReliveJourneyModel(presentationEntries),
    [presentationEntries],
  );
  const engine = useMemo(
    () => createRelivePlaybackEngine(presentation, journeyModel),
    [presentation, journeyModel],
  );

  const [playbackState, setPlaybackState] = useState<RelivePlaybackState>(
    () => playRelive(engine, createRelivePlaybackState()),
  );
  const [showControls, setShowControls] = useState(true);
  const snapshot = useMemo(
    () => getRelivePlaybackSnapshot(engine, playbackState),
    [engine, playbackState],
  );
  const scene = snapshot.scene;
  const memoryNumber = scene.type === 'memory'
    ? memoryScenes.findIndex((item) => item.id === scene.id) + 1
    : 0;
  const coverPhotoUrl = journey.anchorPhoto?.url ||
    memoryScenes.find((item) => item.type === 'memory' && item.photoUrl)?.photoUrl;

  // One animation clock advances the canonical millisecond cursor. Scene,
  // route reveal, car position, and progress UI are all derived from it.
  useEffect(() => {
    if (playbackState.status !== 'playing') return;

    let animationFrame = 0;
    let previousFrameTime: number | null = null;
    let accumulatedMs = 0;

    const advance = (now: number) => {
      if (previousFrameTime === null) previousFrameTime = now;
      accumulatedMs += now - previousFrameTime;
      previousFrameTime = now;

      if (accumulatedMs >= 33) {
        const deltaMs = accumulatedMs;
        accumulatedMs = 0;
        setPlaybackState((current) => tickRelivePlayback(engine, current, deltaMs));
      }
      animationFrame = window.requestAnimationFrame(advance);
    };

    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [engine, playbackState.status]);

  const togglePlayback = useCallback(() => {
    setPlaybackState((current) => {
      if (current.status === 'playing') return pauseRelive(current);
      if (current.status === 'completed') {
        return playRelive(engine, restartRelive());
      }
      return resumeRelive(engine, current);
    });
  }, [engine]);

  const moveToNextScene = useCallback(() => {
    setPlaybackState((current) => nextReliveScene(engine, current));
  }, [engine]);

  const moveToPreviousScene = useCallback(() => {
    setPlaybackState((current) => previousReliveScene(engine, current));
  }, [engine]);

  const seekToScene = useCallback((sceneIndex: number) => {
    setPlaybackState((current) => seekReliveToScene(engine, current, sceneIndex));
  }, [engine]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveToNextScene();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveToPreviousScene();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, togglePlayback, moveToNextScene, moveToPreviousScene]);

  useEffect(() => {
    let hideTimer = 0;
    const scheduleHide = () => {
      setShowControls(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setShowControls(false), 5200);
    };
    scheduleHide();
    window.addEventListener('mousemove', scheduleHide);
    window.addEventListener('pointerdown', scheduleHide);
    window.addEventListener('keydown', scheduleHide);
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener('mousemove', scheduleHide);
      window.removeEventListener('pointerdown', scheduleHide);
      window.removeEventListener('keydown', scheduleHide);
    };
  }, [snapshot.sceneIndex]);

  const sceneTitle = scene.title;
  const sceneSubtitle = scene.type === 'memory'
    ? [formatDate(scene.date), scene.locationName].filter(Boolean).join('  ·  ')
    : scene.subtitle;
  const totalElapsedSeconds = Math.floor(snapshot.cursorMs / 1000);
  const currentSceneProgress = Math.max(0, Math.min(100, snapshot.sceneProgress * 100));

  return (
    <div
      className={`relive-player${showControls ? ' controls-visible' : ' controls-hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Relive ${journey.name}`}
    >
      <div className="relive-player__stage">
        <ReliveMapRenderer engine={engine} snapshot={snapshot} />

        {scene.type === 'memory' ? (
          <section
            key={scene.id}
            className={`relive-photo${scene.photoUrl ? '' : ' relive-photo--empty'}`}
          >
            {scene.photoUrl ? (
              <img
                className="relive-photo__image"
                src={scene.photoUrl}
                alt={scene.photoCaption || scene.title}
              />
            ) : (
              <div className="relive-photo__no-image">
                <span>✦</span>
                <small>A MOMENT IN THE JOURNEY</small>
              </div>
            )}
            <div className="relive-photo__shade" />
            <div className="relive-photo__topline">
              <span>TRAVEL LORE</span>
              <span>
                MEMORY {String(memoryNumber).padStart(2, '0')} / {String(memoryScenes.length).padStart(2, '0')}
              </span>
            </div>
            <div className="relive-photo__story">
              <p className="relive-photo__eyebrow">
                {scene.locationName || 'A MOMENT TO REMEMBER'}
              </p>
              <h1>{sceneTitle}</h1>
              <p className="relive-photo__date">{sceneSubtitle}</p>
              {scene.highlight && <blockquote>“{scene.highlight}”</blockquote>}
              {scene.photoCaption && <p className="relive-photo__caption">{scene.photoCaption}</p>}
            </div>
            <div className="relive-photo__corner-mark">TL <span>✦</span></div>
          </section>
        ) : (
          <section
            key={scene.id}
            className={`relive-title-scene relive-title-scene--${scene.type}`}
          >
            {coverPhotoUrl && scene.type === 'closing' && (
              <img className="relive-title-scene__cover" src={coverPhotoUrl} alt="" />
            )}
            <div className="relive-title-scene__content">
              {coverPhotoUrl && scene.type === 'opening' && (
                <img className="relive-title-scene__cover" src={coverPhotoUrl} alt="" />
              )}
              <p className="relive-title-scene__eyebrow">
                {scene.type === 'opening' ? 'A TRAVEL LORE FILM' : 'UNTIL THE NEXT JOURNEY'}
              </p>
              <div className="relive-title-scene__rule" />
              <h1>{scene.title}</h1>
              <p>{scene.subtitle}</p>
              {scene.type === 'closing' && (
                <small className="relive-title-scene__dates">
                  {formatDate(journey.startDate)} — {formatDate(journey.endDate)}
                </small>
              )}
              <span className="relive-title-scene__seal">✦</span>
            </div>
          </section>
        )}
      </div>

      <header className="relive-player__topbar">
        <div className="relive-player__brand">
          <span className="relive-brand-mark">TL</span>
          <span>TRAVEL LORE <i> / </i> RELIVE</span>
        </div>
        <div className="relive-player__journey-name">{journey.name}</div>
        <button
          className="relive-player__exit"
          type="button"
          onClick={onClose}
          aria-label="Exit Relive"
        >
          × <span>EXIT</span>
        </button>
      </header>

      <footer className="relive-controls">
        <div className="relive-controls__progress" aria-label="Presentation progress">
          {presentation.scenes.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`relive-progress-segment${index === snapshot.sceneIndex ? ' is-current' : ''}${index < snapshot.sceneIndex ? ' is-complete' : ''}`}
              onClick={() => seekToScene(index)}
              aria-label={`Go to ${item.type === 'memory' ? item.title : item.type}`}
              aria-current={index === snapshot.sceneIndex ? 'step' : undefined}
            >
              <span>
                {index === snapshot.sceneIndex ? (
                  <i style={{ width: `${currentSceneProgress}%` }} />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <div className="relive-controls__row">
          <div className="relive-controls__chapter">
            <span>
              {scene.type === 'memory'
                ? `MEMORY ${String(memoryNumber).padStart(2, '0')}`
                : scene.type.toUpperCase()}
            </span>
            <small>{scene.type === 'memory' ? `${memoryNumber} of ${memoryScenes.length}` : journey.place}</small>
          </div>
          <div className="relive-controls__transport">
            <button
              type="button"
              onClick={moveToPreviousScene}
              disabled={snapshot.sceneIndex === 0}
              aria-label="Previous scene"
            >
              ‹
            </button>
            <button
              className="relive-controls__play"
              type="button"
              onClick={togglePlayback}
              aria-label={snapshot.status === 'playing' ? 'Pause' : 'Play'}
            >
              {snapshot.status === 'playing' ? 'Ⅱ' : '▶'}
            </button>
            <button
              type="button"
              onClick={moveToNextScene}
              disabled={snapshot.sceneIndex === presentation.scenes.length - 1}
              aria-label="Next scene"
            >
              ›
            </button>
          </div>
          <div className="relive-controls__runtime">
            <span>{formatReliveDuration(totalElapsedSeconds)}</span>
            <i>/</i>
            <span>{formatReliveDuration(presentation.estimatedDurationSeconds)}</span>
          </div>
        </div>
      </footer>
      <div className="relive-player__hint">
        SPACE TO PAUSE <span>·</span> ← → TO NAVIGATE <span>·</span> ESC TO EXIT
      </div>
    </div>
  );
}
