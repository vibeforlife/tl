import { useEffect, useMemo, useState } from 'react';
import type { Entry, Journey, ReliveConfiguration, ReliveDurationMode, ReliveSelectionMode } from '../../types/domain';
import {
  buildRelivePresentation,
  formatReliveDuration,
  getReliveDurationLabel,
  sortReliveEntries,
} from '../../domain/relive';
import {
  getOrCreateJourneyRelive,
  saveJourneyRelive,
} from '../../services/firebase/relives';
import { DEFAULT_RELIVE_SOUNDTRACK_ID, getReliveSoundtrack, RELIVE_SOUNDTRACKS } from './soundtracks';
import './RelivePreparation.css';

interface RelivePreparationProps {
  journey: Journey;
  entries: Entry[];
  ownerId: string;
  onClose: () => void;
  onPlay: (configuration: ReliveConfiguration) => void;
}

const durationDescriptions: Record<ReliveDurationMode, string> = {
  highlights: 'A concise overview, with brisker photo holds and transitions.',
  journey: 'A balanced walkthrough that gives each Memory room to breathe.',
  complete: 'A slower, more immersive presentation with longer photo holds.',
};

const formatMemoryDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));

export function RelivePreparation({
  journey,
  entries,
  ownerId,
  onClose,
  onPlay,
}: RelivePreparationProps) {
  const [configuration, setConfiguration] = useState<ReliveConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const orderedEntries = useMemo(() => sortReliveEntries(entries), [entries]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    void getOrCreateJourneyRelive(journey.id, ownerId, journey.name)
      .then((result) => {
        if (active) setConfiguration(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'We could not load your Relive settings.',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [journey.id, journey.name, ownerId]);

  const selectedEntryIds = useMemo(
    () => new Set(configuration?.selectedEntryIds ?? []),
    [configuration?.selectedEntryIds],
  );

  const selectedCount = configuration
    ? configuration.selectionMode === 'automatic'
      ? entries.length
      : entries.filter((entry) => selectedEntryIds.has(entry.id)).length
    : 0;

  const presentation = useMemo(() => {
    if (!configuration) return null;
    return buildRelivePresentation(journey, entries, configuration);
  }, [configuration, entries, journey]);

  const updateConfiguration = (
    update: Partial<ReliveConfiguration>,
  ) => {
    setSaved(false);
    setConfiguration((current) => current ? { ...current, ...update } : current);
  };

  const changeSelectionMode = (selectionMode: ReliveSelectionMode) => {
    if (!configuration) return;
    updateConfiguration({
      selectionMode,
      selectedEntryIds:
        selectionMode === 'curated'
          ? (configuration.selectedEntryIds.length > 0
              ? configuration.selectedEntryIds
              : entries.map((entry) => entry.id))
          : configuration.selectedEntryIds,
    });
  };

  const toggleEntry = (entryId: string, checked: boolean) => {
    if (!configuration) return;
    const selected = new Set(configuration.selectedEntryIds);
    if (checked) selected.add(entryId);
    else selected.delete(entryId);
    updateConfiguration({ selectedEntryIds: Array.from(selected) });
  };

  const handleSave = async (playAfterSave = false) => {
    if (!configuration || isSaving) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const nextConfiguration = {
        ...configuration,
        selectedEntryIds: configuration.selectedEntryIds.filter((entryId) =>
          entries.some((entry) => entry.id === entryId),
        ),
      };
      await saveJourneyRelive(nextConfiguration);
      setConfiguration(nextConfiguration);
      setSaved(true);
      if (playAfterSave) onPlay(nextConfiguration);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'We could not save your Relive settings.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relive-modal" role="dialog" aria-modal="true" aria-labelledby="relive-title">
      <button
        className="relive-modal__backdrop"
        type="button"
        aria-label="Close Relive preparation"
        onClick={onClose}
      />
      <section className="relive-panel">
        <header className="relive-panel__header">
          <div>
            <p className="relive-eyebrow">TRAVEL LORE PRESENTS</p>
            <h2 id="relive-title">Relive this Journey</h2>
            <p className="relive-panel__subtitle">{journey.name} · {journey.place}</p>
          </div>
          <button className="relive-panel__close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {isLoading ? (
          <div className="relive-panel__status" role="status">Preparing your Relive…</div>
        ) : error && !configuration ? (
          <div className="relive-panel__status relive-panel__status--error" role="alert">{error}</div>
        ) : configuration ? (
          <>
            <div className="relive-panel__body">
              <section className="relive-section">
                <label className="relive-title-field">
                  <span>Presentation title</span>
                  <input
                    type="text"
                    maxLength={100}
                    autoFocus
                    value={configuration.title}
                    onChange={(event) => updateConfiguration({ title: event.target.value })}
                  />
                </label>
                <div className="relive-section__heading">
                  <span className="relive-section__number">01</span>
                  <div>
                    <h3>Your Memories</h3>
                    <p>Choose whether to include every Memory or curate the presentation.</p>
                  </div>
                </div>

                <div className="relive-choice-row">
                  <label className={`relive-choice${configuration.selectionMode === 'automatic' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="relive-selection"
                      value="automatic"
                      checked={configuration.selectionMode === 'automatic'}
                      onChange={() => changeSelectionMode('automatic')}
                    />
                    <span>
                      <strong>All Memories</strong>
                      <small>Automatically include all {entries.length} Memories.</small>
                    </span>
                  </label>
                  <label className={`relive-choice${configuration.selectionMode === 'curated' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="relive-selection"
                      value="curated"
                      checked={configuration.selectionMode === 'curated'}
                      onChange={() => changeSelectionMode('curated')}
                    />
                    <span>
                      <strong>Curate selection</strong>
                      <small>Choose exactly which Memories appear.</small>
                    </span>
                  </label>
                </div>

                <div className="relive-memory-summary">
                  <strong>{selectedCount} of {entries.length} Memories selected</strong>
                  {configuration.selectionMode === 'curated' && (
                    <div className="relive-memory-list">
                      {orderedEntries.map((entry) => (
                        <label className="relive-memory-option" key={entry.id}>
                          <input
                            type="checkbox"
                            checked={selectedEntryIds.has(entry.id)}
                            onChange={(event) => toggleEntry(entry.id, event.target.checked)}
                          />
                          {entry.photo?.url ? (
                            <img src={entry.photo.url} alt="" loading="lazy" />
                          ) : (
                            <span className="relive-memory-option__placeholder" aria-hidden="true">✦</span>
                          )}
                          <span className="relive-memory-option__details">
                            <strong>{entry.title}</strong>
                            <small>{formatMemoryDate(entry.date)}{entry.location?.name ? ` · ${entry.location.name}` : ''}</small>
                          </span>
                        </label>
                      ))}
                      {entries.length === 0 && (
                        <p className="relive-empty">Add Memories to this Journey before curating a Relive.</p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="relive-section">
                <div className="relive-section__heading">
                  <span className="relive-section__number">02</span>
                  <div>
                    <h3>Set the pace</h3>
                    <p>Every selected Memory remains in the presentation. These modes change pacing, not selection.</p>
                  </div>
                </div>

                <div className="relive-duration-options">
                  {(['highlights', 'journey', 'complete'] as const).map((mode) => (
                    <label className={`relive-duration-option${configuration.durationMode === mode ? ' is-selected' : ''}`} key={mode}>
                      <input
                        type="radio"
                        name="relive-duration"
                        value={mode}
                        checked={configuration.durationMode === mode}
                        onChange={() => updateConfiguration({ durationMode: mode })}
                      />
                      <span className="relive-duration-option__copy">
                        <strong>{getReliveDurationLabel(mode)}</strong>
                        <small>{durationDescriptions[mode]}</small>
                      </span>
                      {configuration.durationMode === mode && <span className="relive-duration-option__check" aria-hidden="true">✓</span>}
                    </label>
                  ))}
                </div>
              </section>

              <section className="relive-section relive-section--music">
                <div className="relive-section__heading">
                  <span className="relive-section__number">03</span>
                  <div>
                    <h3>Soundtrack</h3>
                    <p>Choose the music that will accompany your Journey from beginning to end.</p>
                  </div>
                </div>
                <label className="relive-soundtrack-select">
                  <span>Choose a soundtrack</span>
                  <select
                    value={configuration.soundtrackId || DEFAULT_RELIVE_SOUNDTRACK_ID}
                    onChange={(event) => updateConfiguration({ soundtrackId: event.target.value, musicEnabled: true })}
                  >
                    {RELIVE_SOUNDTRACKS.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.title} — {track.mood}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="relive-soundtrack-preview">
                  <div>
                    <strong>{getReliveSoundtrack(configuration.soundtrackId).title}</strong>
                    <small>{getReliveSoundtrack(configuration.soundtrackId).creator} · Preview</small>
                  </div>
                  <audio
                    key={getReliveSoundtrack(configuration.soundtrackId).id}
                    controls
                    preload="none"
                    src={getReliveSoundtrack(configuration.soundtrackId).src}
                    aria-label={`Preview ${getReliveSoundtrack(configuration.soundtrackId).title}`}
                  />
                </div>
                <p className="relive-note">Music is enabled by default. You can mute it or adjust its volume during playback.</p>
              </section>

              {presentation && (
                <section className="relive-estimate" aria-live="polite">
                  <div>
                    <span className="relive-estimate__label">ESTIMATED RUNTIME</span>
                    <strong>{formatReliveDuration(presentation.estimatedDurationSeconds)}</strong>
                  </div>
                  <div>
                    <span className="relive-estimate__label">SCENES</span>
                    <strong>{presentation.scenes.length}</strong>
                  </div>
                  <p>Estimate based on the current pacing model. Final timing will be refined during playback development.</p>
                </section>
              )}
            </div>

            {error && <p className="relive-panel__error" role="alert">{error}</p>}
            {saved && <p className="relive-panel__success" role="status">Your Relive settings have been saved.</p>}

            <footer className="relive-panel__footer">
              <span className="relive-owner-note">Only the Journey owner can edit this presentation.</span>
              <div>
                <button className="relive-button relive-button--secondary" type="button" onClick={onClose}>Close</button>
                <button className="relive-button relive-button--secondary" type="button" onClick={() => void handleSave(false)} disabled={isSaving || (configuration.selectionMode === 'curated' && selectedCount === 0)}>
                  Save settings
                </button>
                <button className="relive-button relive-button--primary" type="button" onClick={() => void handleSave(true)} disabled={isSaving || selectedCount === 0}>
                  {isSaving ? 'Preparing…' : '▶ Play Relive'}
                </button>
              </div>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}
