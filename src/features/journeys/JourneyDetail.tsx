import type { ChangeEvent } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../services/firebase/firestore';
import type {
  Entry,
  InvitationRole,
  Journey,
  JourneyRole,
} from '../../types/domain';
import { deleteEntry, listJourneyEntries } from '../../services/firebase/entries';
import {
  clearJourneyAnchorPhoto,
  deleteJourney,
  getJourneyMember,
  updateJourney,
  updateJourneyAnchorPhoto,
  type CreateJourneyInput,
} from '../../services/firebase/journeys';
import { createJourneyShareLink } from '../../services/firebase/sharing';
import { deleteStorageFile, uploadJourneyAnchorPhoto } from '../../services/firebase/storage';
import { CreateEntryForm } from '../entries/CreateEntryForm';
const JourneyMap = lazy(() =>
  import('./JourneyMap').then(({ JourneyMap }) => ({
    default: JourneyMap,
  })),
);

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
  const [journeyRole, setJourneyRole] = useState<JourneyRole | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editInput, setEditInput] = useState<CreateJourneyInput | null>(null);
  const [editAnchorPhoto, setEditAnchorPhoto] = useState<File | null>(null);
  const [removeAnchorPhoto, setRemoveAnchorPhoto] = useState(false);
  const [editAnchorPhotoPreviewUrl, setEditAnchorPhotoPreviewUrl] =
    useState<string | null>(null);
  const [isSavingJourney, setIsSavingJourney] = useState(false);
  useEffect(() => {
    if (!editAnchorPhoto) {
      setEditAnchorPhotoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(editAnchorPhoto);
    setEditAnchorPhotoPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [editAnchorPhoto]);

  const [isDeletingJourney, setIsDeletingJourney] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkRole, setShareLinkRole] = useState<InvitationRole | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [isCreatingShareLink, setIsCreatingShareLink] =
    useState<InvitationRole | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<Entry | null>(null);
  const [deleteEntryConfirmed, setDeleteEntryConfirmed] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
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
      const [journeySnapshot, nextEntries, member] = await Promise.all([
        getDoc(doc(db, 'journeys', journeyId)),
        listJourneyEntries(journeyId),
        getJourneyMember(journeyId, user.uid),
      ]);

      if (!journeySnapshot.exists()) {
        throw new Error('Journey not found.');
      }

      if (!member) {
        throw new Error('You no longer have access to this journey.');
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
        ...(data.anchorPhoto
          ? {
              anchorPhoto: {
                url: data.anchorPhoto.url as string,
                storagePath: data.anchorPhoto.storagePath as string,
              },
            }
          : {}),
      });

      setJourneyRole(member.role);
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
  }, [journeyId, user.uid]);

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

  const canEditJourney = journeyRole === 'owner' || journeyRole === 'editor';
  const canDeleteJourney = journeyRole === 'owner';
  const canShareJourney = journeyRole === 'owner';

  const handleCreateShareLink = async (role: InvitationRole) => {
    if (!canShareJourney) return;

    setIsCreatingShareLink(role);
    setShareLink(null);
    setShareLinkRole(null);
    setShareLinkCopied(false);
    setManagementError(null);

    try {
      const link = await createJourneyShareLink(journeyId, role);
      setShareLink(link);
      setShareLinkRole(role);

      try {
        await navigator.clipboard.writeText(link);
        setShareLinkCopied(true);
      } catch {
        setShareLinkCopied(false);
      }
    } catch (shareError) {
      setManagementError(
        shareError instanceof Error
          ? shareError.message
          : 'We could not create the sharing link.',
      );
    } finally {
      setIsCreatingShareLink(null);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setShareLinkCopied(true);
    } catch {
      setShareLinkCopied(false);
    }
  };

  const openEditJourney = () => {
    if (!journey) return;

    setIsDeleteOpen(false);
    setManagementError(null);
    setEditAnchorPhoto(null);
    setRemoveAnchorPhoto(false);
    setEditInput({
      name: journey.name,
      place: journey.place,
      startDate: journey.startDate,
      endDate: journey.endDate,
    });
    setIsEditOpen(true);
  };

  const handleEditAnchorPhotoChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;

    setEditAnchorPhoto(file);

    if (file) {
      setRemoveAnchorPhoto(false);
    }
  };

  const handleSaveJourney = async () => {
    if (!journey || !editInput) return;

    setIsSavingJourney(true);
    setManagementError(null);

    const previousAnchorPhoto = journey.anchorPhoto;
    let nextAnchorPhoto = previousAnchorPhoto;
    let photoCleanupWarning: string | null = null;

    try {
      await updateJourney(journey.id, editInput);

      if (editAnchorPhoto) {
        const uploadedPhoto = await uploadJourneyAnchorPhoto(
          journey.id,
          editAnchorPhoto,
        );

        try {
          await updateJourneyAnchorPhoto(journey.id, {
            url: uploadedPhoto.url,
            storagePath: uploadedPhoto.path,
          });
        } catch (photoMetadataError) {
          try {
            await deleteStorageFile(uploadedPhoto.path);
          } catch {
            // Best-effort cleanup. The old photo remains the active photo.
          }

          throw photoMetadataError;
        }

        nextAnchorPhoto = {
          url: uploadedPhoto.url,
          storagePath: uploadedPhoto.path,
        };

        if (
          previousAnchorPhoto &&
          previousAnchorPhoto.storagePath !== uploadedPhoto.path
        ) {
          try {
            await deleteStorageFile(previousAnchorPhoto.storagePath);
          } catch {
            photoCleanupWarning =
              'Journey saved, but the previous anchor photo could not be removed from storage.';
          }
        }
      } else if (removeAnchorPhoto && previousAnchorPhoto) {
        await clearJourneyAnchorPhoto(journey.id);
        nextAnchorPhoto = undefined;

        try {
          await deleteStorageFile(previousAnchorPhoto.storagePath);
        } catch {
          photoCleanupWarning =
            'Journey saved without an anchor photo, but the previous photo could not be removed from storage.';
        }
      }

      setJourney((current) =>
        current
          ? {
              ...current,
              name: editInput.name.trim(),
              place: editInput.place.trim(),
              startDate: editInput.startDate,
              endDate: editInput.endDate,
              ...(nextAnchorPhoto
                ? { anchorPhoto: nextAnchorPhoto }
                : { anchorPhoto: undefined }),
            }
          : current,
      );

      setIsEditOpen(false);

      if (photoCleanupWarning) {
        setManagementError(photoCleanupWarning);
      }
    } catch (saveError) {
      setManagementError(
        saveError instanceof Error
          ? saveError.message
          : 'We could not save this journey.',
      );
    } finally {
      setIsSavingJourney(false);
    }
  };

  const openEditEntry = (entry: Entry) => {
    if (!canEditJourney) return;
    setEditingEntry(entry);
  };

  const closeEditEntry = () => {
    setEditingEntry(null);
  };

  const handleEntryUpdated = async () => {
    await load();
    setEditingEntry(null);
  };

  const handleViewEntryFromMap = (entry: Entry) => {
    setEntryViewMode('compact');

    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-entry-id="${entry.id}"]`,
      );

      if (!target) return;

      if (target instanceof HTMLDetailsElement) {
        target.open = true;
      }

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const openDeleteEntry = (entry: Entry) => {
    if (!canEditJourney) return;

    setDeletingEntry(entry);
    setDeleteEntryConfirmed(false);
    setManagementError(null);
  };

  const closeDeleteEntry = () => {
    if (isDeletingEntry) return;

    setDeletingEntry(null);
    setDeleteEntryConfirmed(false);
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry || !canEditJourney || !deleteEntryConfirmed) return;

    setIsDeletingEntry(true);
    setManagementError(null);

    try {
      await deleteEntry(journeyId, deletingEntry.id);
      await load();
      setDeletingEntry(null);
      setDeleteEntryConfirmed(false);
    } catch (deleteError) {
      setManagementError(
        deleteError instanceof Error
          ? deleteError.message
          : 'We could not delete this memory.',
      );
    } finally {
      setIsDeletingEntry(false);
    }
  };

  const handleDeleteJourney = async () => {
    if (!journey || !canDeleteJourney || !deleteConfirmed) return;

    setIsDeletingJourney(true);
    setManagementError(null);

    try {
      await deleteJourney(journey.id);
      onBack();
    } catch (deleteError) {
      setManagementError(
        deleteError instanceof Error
          ? deleteError.message
          : 'We could not delete this journey.',
      );
      setIsDeletingJourney(false);
    }
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

      <section
        className={`journey-hero${journey.anchorPhoto ? ' journey-hero--has-photo' : ''}`}
        style={
          journey.anchorPhoto
            ? {
                backgroundImage: `url("${journey.anchorPhoto.url}")`,
              }
            : undefined
        }
      >
        {journey.anchorPhoto ? (
          <span
            className="journey-hero__photo-overlay"
            aria-hidden="true"
          />
        ) : null}

        <div className="journey-hero__main">
          <p className="journey-card__place">{journey.place}</p>
          <h1>{journey.name}</h1>
          <p className="journey-detail__dates">
            {formatDate(journey.startDate)} — {formatDate(journey.endDate)}
          </p>

          <div className="journey-management">
            {journeyRole && (
              <span className="journey-role" aria-label={`Your role: ${journeyRole}`}>
                {journeyRole}
              </span>
            )}

            {canEditJourney && (
              <button
                className="journey-management__button"
                type="button"
                onClick={openEditJourney}
              >
                Edit journey
              </button>
            )}

            {canShareJourney && (
              <>
                <button
                  className="journey-management__button journey-management__button--share-edit"
                  type="button"
                  disabled={isCreatingShareLink !== null}
                  onClick={() => {
                    void handleCreateShareLink('editor');
                  }}
                >
                  {isCreatingShareLink === 'editor' ? 'Creating…' : 'Share edit'}
                </button>

                <button
                  className="journey-management__button journey-management__button--share-read"
                  type="button"
                  disabled={isCreatingShareLink !== null}
                  onClick={() => {
                    void handleCreateShareLink('viewer');
                  }}
                >
                  {isCreatingShareLink === 'viewer'
                    ? 'Creating…'
                    : 'Share read only'}
                </button>
              </>
            )}

            {canDeleteJourney && (
              <button
                className="journey-management__button journey-management__button--danger"
                type="button"
                onClick={() => {
                  setIsEditOpen(false);
                  setManagementError(null);
                  setIsDeleteOpen(true);
                }}
              >
                Delete journey
              </button>
            )}

            {shareLink && (
              <div className="journey-share-result">
                <div className="journey-share-result__row">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    aria-label="Journey sharing link"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="journey-share-result__copy"
                    type="button"
                    onClick={() => {
                      void handleCopyShareLink();
                    }}
                  >
                    {shareLinkCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <p className="journey-share-result__status" aria-live="polite">
                  {shareLinkCopied
                    ? 'Link copied. Send it by WhatsApp, email, text, or anywhere else.'
                    : shareLinkRole === 'editor'
                      ? 'Edit access link ready.'
                      : 'Read-only access link ready.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="journey-detail__summary">
          <span>{entries.length}</span>
          <small>{entries.length === 1 ? 'memory' : 'memories'}</small>
        </div>
      </section>

      {managementError && (
        <p className="journey-management__error" role="alert">
          {managementError}
        </p>
      )}

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
                    className={
                      entryViewMode === 'map'
                        ? 'entry-view-button entry-view-button--active'
                        : 'entry-view-button'
                    }
                    type="button"
                    onClick={() => setEntryViewMode('map')}
                    aria-pressed={entryViewMode === 'map'}
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
                  <div className="entry-display-area__map">
                    <Suspense

                      fallback={

                        <div className="journey-map journey-map--loading">

                          <div className="journey-map__message">

                            <p className="eyebrow">JOURNEY MAP</p>

                            <h3>Loading your map…</h3>

                            <p>Preparing the places in this journey.</p>

                          </div>

                        </div>

                      }

                    >

                      <JourneyMap
                        entries={sortedEntries}
                        onViewEntry={handleViewEntryFromMap}
                      />

                    </Suspense>
                  </div>

                  <div className="entry-display-area__compact">
                    {sortedEntries.map((entry) => (
                      <details
                        className="entry-river-item"
                        key={`compact-${entry.id}`}
                        data-entry-id={entry.id}
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

                            <div className="entry-river-title-row">
                              <h3>{entry.title}</h3>
                              {canEditJourney && (
                                <span className="entry-actions">
                                  <button
                                    className="entry-action-button"
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openEditEntry(entry);
                                    }}
                                    aria-label={`Edit ${entry.title}`}
                                  >
                                    Edit
                                  </button>

                                  <button
                                    className="entry-action-button entry-action-button--danger"
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openDeleteEntry(entry);
                                    }}
                                    aria-label={`Delete ${entry.title}`}
                                  >
                                    Delete
                                  </button>
                                </span>
                              )}
                            </div>

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

                          <div className="entry-card__title-row">
                            <h3>{entry.title}</h3>
                            {canEditJourney && (
                              <span className="entry-actions">
                                <button
                                  className="entry-action-button"
                                  type="button"
                                  onClick={() => openEditEntry(entry)}
                                  aria-label={`Edit ${entry.title}`}
                                >
                                  Edit
                                </button>

                                <button
                                  className="entry-action-button entry-action-button--danger"
                                  type="button"
                                  onClick={() => openDeleteEntry(entry)}
                                  aria-label={`Delete ${entry.title}`}
                                >
                                  Delete
                                </button>
                              </span>
                            )}
                          </div>

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

                          {entry.photo && (
                            <div className="entry-card__photos">
                              <a
                                className="entry-card__photo"
                                href={entry.photo.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={
                                  entry.photo.caption || 'Open anchor photo'
                                }
                              >
                                <img
                                  src={entry.photo.url}
                                  alt={entry.photo.caption || ''}
                                  loading="lazy"
                                />
                                <span>
                                  {entry.photo.caption || 'Anchor photo'}
                                </span>
                              </a>
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

        {canEditJourney && (
          <CreateEntryForm
            user={user}
            journeyId={journeyId}
            onCreated={load}
          />
        )}
      </section>
      {deletingEntry && (
        <div
          className="journey-modal journey-modal--danger"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-memory-title"
        >
          <div
            className="journey-modal__backdrop"
            onClick={closeDeleteEntry}
            aria-hidden="true"
          />

          <div className="journey-modal__panel">
            <div className="journey-modal__header">
              <div>
                <p className="eyebrow">DELETE MEMORY</p>
                <h2 id="delete-memory-title">Let this memory go?</h2>
              </div>

              <button
                className="journey-modal__close"
                type="button"
                onClick={closeDeleteEntry}
                aria-label="Close delete memory"
                disabled={isDeletingEntry}
              >
                ×
              </button>
            </div>

            <div className="journey-modal__body">
              <p>
                You are about to permanently delete{' '}
                <strong>{deletingEntry.title}</strong>.
              </p>

              <p>
                This removes the memory and its details from Travel Lore.
                This action cannot be undone.
              </p>

              <label className="journey-delete-confirmation">
                <input
                  type="checkbox"
                  checked={deleteEntryConfirmed}
                  onChange={(event) =>
                    setDeleteEntryConfirmed(event.target.checked)
                  }
                  disabled={isDeletingEntry}
                />
                <span className="journey-delete-confirmation__text">
                  <strong>I understand this is permanent.</strong>
                  <span>
                    I confirm that I want to permanently delete this
                    memory and all of its associated Travel Lore content.
                  </span>
                </span>
              </label>

              <div className="journey-modal__actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeDeleteEntry}
                  disabled={isDeletingEntry}
                >
                  Cancel
                </button>

                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void handleDeleteEntry()}
                  disabled={!deleteEntryConfirmed || isDeletingEntry}
                >
                  {isDeletingEntry ? 'Deleting…' : 'Delete Memory'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingEntry && (
        <div
          className="journey-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-memory-title"
        >
          <div
            className="journey-modal__backdrop"
            onClick={closeEditEntry}
            aria-hidden="true"
          />

          <div className="journey-modal__panel">
            <div className="journey-modal__header">
              <div>
                <p className="eyebrow">MEMORY</p>
                <h2 id="edit-memory-title">Edit memory.</h2>
              </div>

              <button
                className="journey-modal__close"
                type="button"
                onClick={closeEditEntry}
                aria-label="Close edit memory"
              >
                ×
              </button>
            </div>

            <div className="memory-edit-modal__body">
              <CreateEntryForm
                user={user}
                journeyId={journeyId}
                entry={editingEntry}
                idPrefix="edit-memory"
                onCreated={() => undefined}
                onUpdated={handleEntryUpdated}
              />
            </div>
          </div>
        </div>
      )}

      {isEditOpen && editInput && (
        <div
          className="journey-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-journey-title"
        >
          <div
            className="journey-modal__backdrop"
            onClick={() => !isSavingJourney && setIsEditOpen(false)}
            aria-hidden="true"
          />

          <div className="journey-modal__panel">
            <div className="journey-modal__header">
              <div>
                <p className="eyebrow">JOURNEY</p>
                <h2 id="edit-journey-title">Shape the story.</h2>
              </div>

              <button
                className="journey-modal__close"
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={isSavingJourney}
                aria-label="Close edit journey"
              >
                ×
              </button>
            </div>

            <div className="journey-modal__fields">
              <label>
                <span>Journey name</span>
                <input
                  value={editInput.name}
                  onChange={(event) =>
                    setEditInput((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                  autoFocus
                />
              </label>

              <label>
                <span>Place</span>
                <input
                  value={editInput.place}
                  onChange={(event) =>
                    setEditInput((current) =>
                      current
                        ? { ...current, place: event.target.value }
                        : current,
                    )
                  }
                />
              </label>

              <div className="journey-modal__date-grid">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={editInput.startDate}
                    onChange={(event) =>
                      setEditInput((current) =>
                        current
                          ? { ...current, startDate: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>

                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={editInput.endDate}
                    onChange={(event) =>
                      setEditInput((current) =>
                        current
                          ? { ...current, endDate: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              </div>
              <section className="journey-modal__photo-section">
                <div>
                  <span className="journey-modal__photo-label">
                    Anchor photo
                  </span>

                  <p className="journey-modal__photo-help">
                    This photo represents the journey on your journey card.
                  </p>
                </div>

                {editAnchorPhotoPreviewUrl ? (
                  <img
                    className="journey-modal__photo-preview"
                    src={editAnchorPhotoPreviewUrl}
                    alt="New anchor photo preview"
                  />
                ) : journey.anchorPhoto && !removeAnchorPhoto ? (
                  <img
                    className="journey-modal__photo-preview"
                    src={journey.anchorPhoto.url}
                    alt="Current anchor photo"
                  />
                ) : (
                  <p className="journey-modal__photo-empty">
                    {removeAnchorPhoto
                      ? 'The current anchor photo will be removed.'
                      : 'No anchor photo selected.'}
                  </p>
                )}

                <div className="journey-modal__photo-picker">
                  <label className="journey-modal__photo-file">
                    <span className="journey-modal__photo-file-button">
                      {journey.anchorPhoto
                        ? 'Choose a different photo'
                        : 'Choose a photo'}
                    </span>

                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={handleEditAnchorPhotoChange}
                      disabled={isSavingJourney}
                    />
                  </label>

                  <span className="journey-modal__photo-file-name">
                    {editAnchorPhoto
                      ? editAnchorPhoto.name
                      : removeAnchorPhoto
                        ? 'Photo will be removed'
                        : journey.anchorPhoto
                          ? 'Current photo'
                          : 'No photo selected'}
                  </span>
                </div>

                {journey.anchorPhoto && (
                  <label className="journey-modal__photo-remove">
                    <input
                      type="checkbox"
                      checked={removeAnchorPhoto}
                      onChange={(event) => {
                        setRemoveAnchorPhoto(event.target.checked);

                        if (event.target.checked) {
                          setEditAnchorPhoto(null);
                        }
                      }}
                      disabled={isSavingJourney}
                    />

                    <span
                      className="journey-modal__photo-checkbox"
                      aria-hidden="true"
                    />

                    <span>Remove anchor photo</span>
                  </label>
                )}
              </section>

            </div>

            {managementError && (
              <p className="journey-modal__error" role="alert">
                {managementError}
              </p>
            )}

            <div className="journey-modal__actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setIsEditOpen(false)}
                disabled={isSavingJourney}
              >
                Cancel
              </button>

              <button
                className="primary-button"
                type="button"
                onClick={() => void handleSaveJourney()}
                disabled={isSavingJourney}
              >
                {isSavingJourney ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteOpen && canDeleteJourney && (
        <div
          className="journey-modal journey-modal--danger"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-journey-title"
        >
          <div
            className="journey-modal__backdrop"
            onClick={() => {
              if (isDeletingJourney) return;
              setDeleteConfirmed(false);
              setManagementError(null);
              setIsDeleteOpen(false);
            }}
            aria-hidden="true"
          />

          <div className="journey-modal__panel">
            <div className="journey-modal__header">
              <div>
                <p className="eyebrow">PERMANENT</p>
                <h2 id="delete-journey-title">Leave no loose ends.</h2>
              </div>

              <button
                className="journey-modal__close"
                type="button"
                onClick={() => {
                  setDeleteConfirmed(false);
                  setManagementError(null);
                  setIsDeleteOpen(false);
                }}
                disabled={isDeletingJourney}
                aria-label="Close delete journey"
              >
                ×
              </button>
            </div>

            <p className="journey-modal__warning">
              This will permanently delete <strong>{journey.name}</strong>,
              including its memories and journey membership. This cannot be
              undone.
            </p>

            <label className="journey-delete-confirmation">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
                disabled={isDeletingJourney}
              />
              <span className="journey-delete-confirmation__text">
                <strong>I understand this is permanent.</strong>
                <span>
                  I confirm that this will permanently delete this journey and
                  all associated memories, details, pictures, and other content.
                  This action cannot be undone.
                </span>
              </span>
            </label>

            {managementError && (
              <p className="journey-modal__error" role="alert">
                {managementError}
              </p>
            )}

            <div className="journey-modal__actions">
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setDeleteConfirmed(false);
                  setManagementError(null);
                  setIsDeleteOpen(false);
                }}
                disabled={isDeletingJourney}
              >
                Keep journey
              </button>

              <button
                className="danger-button"
                type="button"
                onClick={() => void handleDeleteJourney()}
                disabled={isDeletingJourney || !deleteConfirmed}
              >
                {isDeletingJourney ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
