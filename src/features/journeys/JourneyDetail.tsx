import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../services/firebase/firestore';
import type { Entry, Journey } from '../../types/domain';
import { listJourneyEntries } from '../../services/firebase/entries';
import { CreateEntryForm } from '../entries/CreateEntryForm';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));

const formatTime = (value: string | undefined) => {
  if (!value) return '';

  const [hours, minutes] = value.split(':').map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(2000, 0, 1, hours, minutes));
};

const memoryTypeLabels: Record<NonNullable<Entry['memoryType']>, string> = {
  place: 'Place',
  food: 'Food',
  sight: 'Sight',
  event: 'Event',
  moment: 'Moment',
  experience: 'Experience',
  people: 'People',
  other: 'Other',
};

type EntryViewMode = 'compact' | 'cards' | 'map';
type EntrySortField = 'date' | 'rating' | 'title' | 'location' | 'type';

const sortLabels: Record<EntrySortField, string> = {
  date: 'Date & time',
  rating: 'Rating',
  title: 'Title',
  location: 'Location',
  type: 'Type',
};

const getStoryPreview = (story: string) => {
  const previewLength = 280;
  if (story.length <= previewLength) return story;
  return `${story.slice(0, previewLength).trimEnd()}…`;
};

const formatCostTotal = (entry: Entry) => {
  const totals = new Map<string, number>();

  for (const cost of entry.costs) {
    totals.set(
      cost.currency,
      (totals.get(cost.currency) || 0) + cost.amount,
    );
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`)
    .join(' · ');
};

export function JourneyDetail({
  user,
  journeyId,
  onBack,
}: {
  user: User;
  journeyId: string;
  onBack: () => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minRating, setMinRating] = useState('');
  const [memoryTypeFilter, setMemoryTypeFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [entryViewMode, setEntryViewMode] = useState<EntryViewMode>('compact');
  const [entrySortField, setEntrySortField] = useState<EntrySortField>('date');
  const [entrySortDirection, setEntrySortDirection] =
    useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [journeySnapshot, nextEntries] = await Promise.all([
        getDoc(doc(db, 'journeys', journeyId)),
        listJourneyEntries(journeyId),
      ]);

      if (!journeySnapshot.exists()) {
        throw new Error('Journey not found.');
      }

      const data = journeySnapshot.data();

      setJourney({
        id: journeySnapshot.id,
        name: data.name as string,
        place: data.place as string,
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        createdBy: data.createdBy as string,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });

      setEntries(nextEntries);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'We could not load this journey.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [journeyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availablePeople = useMemo(
    () =>
      Array.from(new Set(entries.flatMap((entry) => entry.people))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [entries],
  );

  const availableTags = useMemo(
    () =>
      Array.from(new Set(entries.flatMap((entry) => entry.tags))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const rating = minRating ? Number(minRating) : 0;

    return entries.filter((entry) => {
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
      if (rating && (entry.rating ?? 0) < rating) return false;
      if (memoryTypeFilter && entry.memoryType !== memoryTypeFilter) return false;
      if (personFilter && !entry.people.includes(personFilter)) return false;
      if (tagFilter && !entry.tags.includes(tagFilter)) return false;

      if (query) {
        const searchableText = [
          entry.title,
          entry.story,
          entry.highlight,
          entry.location?.name,
          entry.location?.address,
          ...entry.people,
          ...entry.tags,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();

        if (!searchableText.includes(query)) return false;
      }

      return true;
    });
  }, [
    dateFrom,
    dateTo,
    entries,
    memoryTypeFilter,
    minRating,
    personFilter,
    searchQuery,
    tagFilter,
  ]);

  const sortedEntries = useMemo(() => {
    const nextEntries = [...filteredEntries];

    nextEntries.sort((a, b) => {
      let comparison = 0;

      switch (entrySortField) {
        case 'rating':
          comparison = (a.rating ?? 0) - (b.rating ?? 0);
          break;

        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;

        case 'location':
          comparison = (a.location?.name ?? '').localeCompare(
            b.location?.name ?? '',
          );
          break;

        case 'type':
          comparison = (a.memoryType ?? '').localeCompare(
            b.memoryType ?? '',
          );
          break;

        case 'date':
        default: {
          const aValue = `${a.date}T${a.time ?? '00:00'}`;
          const bValue = `${b.date}T${b.time ?? '00:00'}`;
          comparison = aValue.localeCompare(bValue);
          break;
        }
      }

      return entrySortDirection === 'asc' ? comparison : -comparison;
    });

    return nextEntries;
  }, [entrySortDirection, entrySortField, filteredEntries]);

  const activeFilterCount = [
    dateFrom,
    dateTo,
    minRating,
    memoryTypeFilter,
    personFilter,
    tagFilter,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setMinRating('');
    setMemoryTypeFilter('');
    setPersonFilter('');
    setTagFilter('');
  };

  if (isLoading) {
    return (
      <main className="journey-home">
        <p className="journey-status" aria-live="polite">
          Opening your journey…
        </p>
      </main>
    );
  }

  if (error || !journey) {
    return (
      <main className="journey-home">
        <button className="text-button text-button--back" type="button" onClick={onBack}>
          ← Back to journeys
        </button>
        <p className="auth-error" role="alert">
          {error || 'Journey not found.'}
        </p>
      </main>
    );
  }

  return (
    <main className="journey-home journey-detail">
      <button className="text-button text-button--back" type="button" onClick={onBack}>
        ← Your journeys
      </button>

      <section className="journey-hero">
        <div>
          <p className="journey-card__place">{journey.place}</p>
          <h1>{journey.name}</h1>
          <p className="journey-detail__dates">
            {formatDate(journey.startDate)} — {formatDate(journey.endDate)}
          </p>
        </div>

        <div className="journey-detail__summary">
          <span>{entries.length}</span>
          <small>{entries.length === 1 ? 'memory' : 'memories'}</small>
        </div>
      </section>

      <section className="entry-layout">
        <div>
          <div className="section-heading">
            <div>
              <p className="eyebrow">MEMORIES</p>
              <h2>The moments worth keeping.</h2>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="empty-entries">
              <p className="empty-entries__title">Your first memory awaits.</p>
              <p>Add a place, a moment, a story — whatever you want to remember.</p>
            </div>
          ) : (
            <>
              <div className="entry-toolbar">
                <label className="entry-search">
                  <span className="sr-only">Search memories</span>
                  <span className="entry-search__icon" aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search memories, places, people, tags…"
                  />
                </label>

                <button
                  className={`filter-button${showFilters ? ' filter-button--active' : ''}`}
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  aria-expanded={showFilters}
                  aria-controls="entry-filters"
                >
                  Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                </button>
              </div>

              {showFilters && (
                <div className="entry-filters" id="entry-filters">
                  <div className="entry-filter">
                    <label htmlFor="entry-date-from">From</label>
                    <input
                      id="entry-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                    />
                  </div>

                  <div className="entry-filter">
                    <label htmlFor="entry-date-to">To</label>
                    <input
                      id="entry-date-to"
                      type="date"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                    />
                  </div>

                  <div className="entry-filter">
                    <label htmlFor="entry-rating">Rating</label>
                    <select
                      id="entry-rating"
                      value={minRating}
                      onChange={(event) => setMinRating(event.target.value)}
                    >
                      <option value="">Any rating</option>
                      <option value="5">★★★★★</option>
                      <option value="4">★★★★+</option>
                      <option value="3">★★★+</option>
                      <option value="2">★★+</option>
                      <option value="1">★+</option>
                    </select>
                  </div>

                  <div className="entry-filter">
                    <label htmlFor="entry-type">Type</label>
                    <select
                      id="entry-type"
                      value={memoryTypeFilter}
                      onChange={(event) => setMemoryTypeFilter(event.target.value)}
                    >
                      <option value="">All types</option>
                      {Object.entries(memoryTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-filter">
                    <label htmlFor="entry-person">With</label>
                    <select
                      id="entry-person"
                      value={personFilter}
                      onChange={(event) => setPersonFilter(event.target.value)}
                    >
                      <option value="">Anyone</option>
                      {availablePeople.map((person) => (
                        <option key={person} value={person}>
                          {person}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-filter">
                    <label htmlFor="entry-tag">Tag</label>
                    <select
                      id="entry-tag"
                      value={tagFilter}
                      onChange={(event) => setTagFilter(event.target.value)}
                    >
                      <option value="">All tags</option>
                      {availableTags.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeFilterCount > 0 && (
                    <button
                      className="text-button entry-filters__clear"
                      type="button"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              <div className="entry-display-controls">
                <div className="entry-view-switcher" aria-label="Memory view">
                  <button
                    className={entryViewMode === 'compact' ? 'entry-view-button entry-view-button--active' : 'entry-view-button'}
                    type="button"
                    onClick={() => setEntryViewMode('compact')}
                    aria-pressed={entryViewMode === 'compact'}
                  >
                    Compact
                  </button>

                  <button
                    className={entryViewMode === 'cards' ? 'entry-view-button entry-view-button--active' : 'entry-view-button'}
                    type="button"
                    onClick={() => setEntryViewMode('cards')}
                    aria-pressed={entryViewMode === 'cards'}
                  >
                    Cards
                  </button>

                  <button
                    className="entry-view-button"
                    type="button"
                    disabled
                    title="Map view is coming next"
                  >
                    Map
                  </button>
                </div>

                <div className="entry-sort" aria-label="Sort memories">
                  <span className="entry-sort__label">Sort</span>

                  <select
                    className="entry-sort__select"
                    value={entrySortField}
                    onChange={(event) =>
                      setEntrySortField(event.target.value as EntrySortField)
                    }
                    aria-label="Sort memories by"
                  >
                    {Object.entries(sortLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <button
                    className="entry-sort__direction"
                    type="button"
                    onClick={() =>
                      setEntrySortDirection((current) =>
                        current === 'asc' ? 'desc' : 'asc',
                      )
                    }
                    aria-label={
                      entrySortDirection === 'asc'
                        ? 'Ascending order'
                        : 'Descending order'
                    }
                    title={
                      entrySortDirection === 'asc'
                        ? 'Switch to descending'
                        : 'Switch to ascending'
                    }
                  >
                    <span aria-hidden="true">
                      {entrySortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                    <span>
                      {entrySortField === 'date'
                        ? entrySortDirection === 'asc'
                          ? 'Oldest'
                          : 'Newest'
                        : entrySortField === 'rating'
                          ? entrySortDirection === 'asc'
                            ? 'Lowest'
                            : 'Highest'
                          : entrySortDirection === 'asc'
                            ? 'A–Z'
                            : 'Z–A'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="entry-results-summary">
                <span>
                  {filteredEntries.length}{' '}
                  {filteredEntries.length === 1 ? 'memory' : 'memories'}
                </span>
                {filteredEntries.length !== entries.length && (
                  <span>of {entries.length}</span>
                )}
              </div>

              {filteredEntries.length === 0 ? (
                <div className="empty-entries empty-entries--filtered">
                  <p className="empty-entries__title">No memories match.</p>
                  <p>Try changing your search or filters.</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear search &amp; filters
                  </button>
                </div>
              ) : (
                <div
                  className={`entry-display-area entry-display-area--${entryViewMode}`}
                >
                  <div className="entry-display-area__compact">
                    {sortedEntries.map((entry) => (
                      <details
                        className="entry-river-item"
                        key={`compact-${entry.id}`}
                      >
                        <summary className="entry-river-summary">
                          <div className="entry-river-marker" aria-hidden="true">
                            <span />
                          </div>

                          <div className="entry-river-date">
                            <span className="entry-river-day">
                              {new Date(`${entry.date}T00:00:00`).toLocaleDateString(
                                undefined,
                                { day: 'numeric' },
                              )}
                            </span>
                            <span className="entry-river-month">
                              {new Date(`${entry.date}T00:00:00`).toLocaleDateString(
                                undefined,
                                { month: 'short' },
                              )}
                            </span>
                            <span className="entry-river-year">
                              {new Date(`${entry.date}T00:00:00`).toLocaleDateString(
                                undefined,
                                { year: 'numeric' },
                              )}
                            </span>
                          </div>

                          <div className="entry-river-content">
                            <div className="entry-river-meta">
                              {entry.time && <span>{entry.time}</span>}
                              {entry.memoryType && (
                                <span>{memoryTypeLabels[entry.memoryType]}</span>
                              )}
                              {entry.rating && (
                                <span>★ {entry.rating}/5</span>
                              )}
                            </div>

                            <h3>{entry.title}</h3>

                            {entry.highlight && (
                              <p className="entry-river-highlight">
                                {entry.highlight}
                              </p>
                            )}

                            {entry.location && (
                              <p className="entry-river-location">
                                ◎ {entry.location.name}
                              </p>
                            )}

                            <span
                              className="entry-river-expand"
                              aria-hidden="true"
                            >
                              ›
                            </span>
                          </div>
                        </summary>

                        <div className="entry-river-detail">
                          <p className="entry-river-story">
                            {entry.story}
                          </p>

                          {entry.people.length > 0 && (
                            <div className="entry-river-detail__meta">
                              <span>WITH</span>
                              <span>{entry.people.join(', ')}</span>
                            </div>
                          )}

                          {entry.tags.length > 0 && (
                            <div className="entry-river-detail__tags">
                              {entry.tags.map((tag) => (
                                <span key={tag}>#{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>

                  <div className="entry-display-area__cards">
                    <div className="entry-grid">
                      {sortedEntries.map((entry) => (
                        <article className="entry-card" key={entry.id}>
                          <div className="entry-card__topline">
                            <div className="entry-card__date">
                              <span>{formatDate(entry.date)}</span>
                              {entry.time && (
                                <span>· {formatTime(entry.time)}</span>
                              )}
                            </div>

                            <div className="entry-card__badges">
                              {entry.memoryType && (
                                <span className="entry-card__type">
                                  {memoryTypeLabels[entry.memoryType]}
                                </span>
                              )}

                              {entry.rating && (
                                <span
                                  className="entry-card__rating"
                                  aria-label={`${entry.rating} out of 5 stars`}
                                >
                                  {'★'.repeat(entry.rating)}
                                  {'☆'.repeat(5 - entry.rating)}
                                </span>
                              )}
                            </div>
                          </div>

                          <h3>{entry.title}</h3>

                          {entry.location && (
                            <div className="entry-card__location">
                              <span
                                className="entry-card__location-mark"
                                aria-hidden="true"
                              >
                                ◎
                              </span>
                              <div>
                                <strong>{entry.location.name}</strong>
                                {entry.location.address && (
                                  <span>{entry.location.address}</span>
                                )}
                              </div>
                            </div>
                          )}

                          {entry.story.length > 280 ? (
                            <details className="entry-card__story-details">
                              <summary>
                                {getStoryPreview(entry.story)}{' '}
                                <span>Read full story</span>
                              </summary>
                              <p className="entry-card__story">
                                {entry.story}
                              </p>
                            </details>
                          ) : (
                            <p className="entry-card__story">{entry.story}</p>
                          )}

                          {entry.highlight && (
                            <blockquote className="entry-card__highlight">
                              <span className="entry-card__highlight-label">
                                THE MOMENT
                              </span>
                              <p>“{entry.highlight}”</p>
                            </blockquote>
                          )}

                          {(entry.people.length > 0 ||
                            entry.costs.length > 0) && (
                            <div className="entry-card__details">
                              {entry.people.length > 0 && (
                                <div>
                                  <span className="entry-card__detail-label">
                                    WITH
                                  </span>
                                  <span>{entry.people.join(', ')}</span>
                                </div>
                              )}

                              {entry.costs.length > 0 && (
                                <div>
                                  <span className="entry-card__detail-label">
                                    SPENT
                                  </span>
                                  <span className="entry-card__cost">
                                    {formatCostTotal(entry)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {entry.tags.length > 0 && (
                            <div className="entry-tags">
                              {entry.tags.map((tag) => (
                                <span key={tag}>#{tag}</span>
                              ))}
                            </div>
                          )}

                          {entry.photos.length > 0 && (
                            <div className="entry-card__photos">
                              {entry.photos.map((photo, index) => (
                                <a
                                  className="entry-card__photo"
                                  key={photo.url}
                                  href={photo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={
                                    photo.caption || `Open photo ${index + 1}`
                                  }
                                >
                                  <img
                                    src={photo.url}
                                    alt={photo.caption || ''}
                                    loading="lazy"
                                  />
                                  <span>
                                    {photo.caption || `Photo ${index + 1}`}
                                  </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <CreateEntryForm
          user={user}
          journeyId={journeyId}
          onCreated={load}
        />
      </section>
    </main>
  );
}
