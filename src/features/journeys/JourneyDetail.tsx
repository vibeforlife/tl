import type { ChangeEvent } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { optimizeImageFile } from '../../services/firebase/imageOptimization';
import { CreateEntryForm } from '../entries/CreateEntryForm';
import { EntryCard } from '../entries/EntryCard';
import { filterEntries, getEntryPeopleOptions, sortEntries } from '../entries/entryFiltering';
import {
  readJourneyScrollPosition,
  saveJourneyScrollPosition,
  type EntryViewMode,
} from './navigationState';
import { buildJustifiedRows } from './albumLayout';
import { JourneyExportDialog } from '../journey-export/JourneyExportDialog';
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

type EntrySortField = 'date' | 'rating' | 'title' | 'location' | 'type';

const sortLabels: Record<EntrySortField, string> = {
  date: 'Date & time',
  rating: 'Rating',
  title: 'Title',
  location: 'Location',
  type: 'Type',
};

export function JourneyDetail({
  user,
  journeyId,
  onBack,
  onEntryEditDirtyChange,
  initialEntryViewMode = 'cards',
  initialEntryId = null,
  onEntryViewModeChange,
}: {
  user: User;
  journeyId: string;
  onBack: () => void;
  onEntryEditDirtyChange?: (dirty: boolean) => void;
  initialEntryViewMode?: EntryViewMode;
  initialEntryId?: string | null;
  onEntryViewModeChange?: (mode: EntryViewMode) => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [isJourneyExportOpen, setIsJourneyExportOpen] = useState(false);
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
  const [isPreparingAnchorPhoto, setIsPreparingAnchorPhoto] = useState(false);
  const [anchorPhotoUploadProgress, setAnchorPhotoUploadProgress] =
    useState<number | null>(null);
  const anchorPhotoSelectionGenerationRef = useRef(0);
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
  const [isEditingEntryDirty, setIsEditingEntryDirty] = useState(false);
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
  const [entryViewMode, setEntryViewMode] =
    useState<EntryViewMode>(initialEntryViewMode);
  const [selectedAlbumEntryId, setSelectedAlbumEntryId] =
    useState<string | null>(null);
  const [albumSortDirection, setAlbumSortDirection] =
    useState<'asc' | 'desc'>('asc');
  const [albumWidth, setAlbumWidth] = useState(0);
  const [albumAspectRatios, setAlbumAspectRatios] =
    useState<Record<string, number>>({});
  const albumContainerRef = useRef<HTMLDivElement | null>(null);
  const lightboxContentRef = useRef<HTMLDivElement | null>(null);
  const albumTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handleEntryViewModeChange = useCallback((nextMode: EntryViewMode) => {
    setEntryViewMode(nextMode);
    onEntryViewModeChange?.(nextMode);
  }, [onEntryViewModeChange]);
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
        ...(typeof data.googlePhotosUrl === 'string' && data.googlePhotosUrl.trim()
          ? { googlePhotosUrl: data.googlePhotosUrl.trim() }
          : {}),
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

  // Restore only after the Journey and its Memories have loaded and rendered.
  useEffect(() => {
    if (isLoading || error || !journey || initialEntryId) return;

    const savedPosition = readJourneyScrollPosition(user.uid, journeyId);
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        window.scrollTo({ top: savedPosition, behavior: 'auto' });
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [isLoading, error, journey, journeyId, user.uid, initialEntryId]);

  // Track the page scroll without writing to localStorage on every scroll event.
  useEffect(() => {
    let trackingReady = false;
    let pendingFrame: number | null = null;

    const savePosition = () => {
      saveJourneyScrollPosition(user.uid, journeyId, window.scrollY);
    };

    const handleScroll = () => {
      if (!trackingReady) return;

      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
      }

      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        savePosition();
      });
    };

    const handlePageHide = () => {
      if (trackingReady) savePosition();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handlePageHide();
    };

    // Do not overwrite the saved position while the initial page is loading.
    const enableTracking = () => {
      trackingReady = true;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const readyFrame = requestAnimationFrame(enableTracking);

    return () => {
      cancelAnimationFrame(readyFrame);
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [journeyId, user.uid]);

  const availablePeople = useMemo(
    () => getEntryPeopleOptions(entries),
    [entries],
  );

  const availableTags = useMemo(
    () =>
      Array.from(new Set(entries.flatMap((entry) => entry.tags))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [entries],
  );

  const filteredEntries = useMemo(() => filterEntries(entries, {
    searchQuery,
    dateFrom,
    dateTo,
    minRating,
    memoryType: memoryTypeFilter,
    person: personFilter,
    tag: tagFilter,
  }), [entries, searchQuery, dateFrom, dateTo, minRating, memoryTypeFilter, personFilter, tagFilter]);

  const sortedEntries = useMemo(
    () => sortEntries(filteredEntries, entrySortField, entrySortDirection),
    [filteredEntries, entrySortField, entrySortDirection],
  );

  const albumEntries = useMemo(() => {
    const nextEntries = filteredEntries.filter((entry) =>
      Boolean(entry.photo?.url),
    );
    nextEntries.sort((a, b) => {
      const aValue = `${a.date}T${a.time ?? '00:00'}`;
      const bValue = `${b.date}T${b.time ?? '00:00'}`;
      const comparison = aValue.localeCompare(bValue);
      return albumSortDirection === 'asc' ? comparison : -comparison;
    });
    return nextEntries;
  }, [albumSortDirection, filteredEntries]);

  const albumRows = useMemo(
    () =>
      buildJustifiedRows(
        albumEntries,
        albumAspectRatios,
        albumWidth,
      ),
    [albumAspectRatios, albumEntries, albumWidth],
  );

  useEffect(() => {
    const container = albumContainerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setAlbumWidth(container.clientWidth);
    };
    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [entryViewMode, albumEntries.length]);

  const selectedAlbumEntry =
    albumEntries.find((entry) => entry.id === selectedAlbumEntryId) ?? null;

  useEffect(() => {
    if (selectedAlbumEntryId && !selectedAlbumEntry) {
      setSelectedAlbumEntryId(null);
    }
  }, [selectedAlbumEntry, selectedAlbumEntryId]);

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
    setIsPreparingAnchorPhoto(false);
    setAnchorPhotoUploadProgress(null);
    anchorPhotoSelectionGenerationRef.current += 1;
    setEditInput({
      name: journey.name,
      place: journey.place,
      startDate: journey.startDate,
      endDate: journey.endDate,
    });
    setIsEditOpen(true);
  };

  const handleEditAnchorPhotoChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) return;

    const generation =
      anchorPhotoSelectionGenerationRef.current + 1;
    anchorPhotoSelectionGenerationRef.current = generation;

    setEditAnchorPhoto(null);
    setIsPreparingAnchorPhoto(true);
    setAnchorPhotoUploadProgress(null);
    setRemoveAnchorPhoto(false);
    setManagementError(null);

    try {
      const optimizedFile =
        await optimizeImageFile(file);

      if (
        anchorPhotoSelectionGenerationRef.current !==
        generation
      ) {
        return;
      }

      setEditAnchorPhoto(optimizedFile);
    } catch (photoError) {
      if (
        anchorPhotoSelectionGenerationRef.current !==
        generation
      ) {
        return;
      }

      setEditAnchorPhoto(null);

      setManagementError(
        photoError instanceof Error
          ? photoError.message
          : 'We could not prepare that photo for upload.',
      );
    } finally {
      if (
        anchorPhotoSelectionGenerationRef.current ===
        generation
      ) {
        setIsPreparingAnchorPhoto(false);
      }
    }
  };

  const handleSaveJourney = async () => {
    if (!journey || !editInput) return;

    setIsSavingJourney(true);
    setAnchorPhotoUploadProgress(null);
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
          (progress) => setAnchorPhotoUploadProgress(progress),
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

  useEffect(() => {
    if (!editingEntry || !isEditingEntryDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [editingEntry, isEditingEntryDirty]);

  const openEditEntry = (entry: Entry) => {
    if (!canEditJourney) return;
    setIsEditingEntryDirty(false);
    onEntryEditDirtyChange?.(false);
    setEditingEntry(entry);
  };

  const closeEditEntry = () => {
    if (
      isEditingEntryDirty &&
      !window.confirm(
        'You have unsaved changes to this memory. Discard them?',
      )
    ) {
      return false;
    }

    setIsEditingEntryDirty(false);
    onEntryEditDirtyChange?.(false);
    setEditingEntry(null);
    return true;
  };

  const handleEntryUpdated = async () => {
    await load();
    setIsEditingEntryDirty(false);
    onEntryEditDirtyChange?.(false);
    setEditingEntry(null);
  };

  const handleOpenMemory = useCallback((entry: Entry) => {
    setSelectedAlbumEntryId(null);
    handleEntryViewModeChange('cards');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = Array.from(
          document.querySelectorAll<HTMLElement>('[data-entry-id]'),
        ).find((element) => element.dataset.entryId === entry.id);

        target?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    });
  }, [handleEntryViewModeChange]);

  const handleViewEntryFromMap = (entry: Entry) => {
    handleOpenMemory(entry);
  };

  const initialEntryHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialEntryId || isLoading || error || !journey) return;
    if (initialEntryHandledRef.current === initialEntryId) return;
    const targetEntry = entries.find((entry) => entry.id === initialEntryId);
    if (!targetEntry) return;
    initialEntryHandledRef.current = initialEntryId;
    handleOpenMemory(targetEntry);
  }, [initialEntryId, isLoading, error, journey, entries, handleOpenMemory]);

  useEffect(() => {
    if (!selectedAlbumEntry) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = requestAnimationFrame(() => {
      lightboxContentRef.current
        ?.querySelector<HTMLElement>('.entry-lightbox__close')
        ?.focus();
    });

    const handleLightboxKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedAlbumEntryId(null);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const currentIndex = albumEntries.findIndex(
          (entry) => entry.id === selectedAlbumEntry.id,
        );
        if (currentIndex < 0 || albumEntries.length < 2) return;
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex =
          (currentIndex + direction + albumEntries.length) % albumEntries.length;
        setSelectedAlbumEntryId(albumEntries[nextIndex].id);
        return;
      }

      if (event.key === 'Tab') {
        const focusable = Array.from(
          lightboxContentRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !lightboxContentRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !lightboxContentRef.current?.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleLightboxKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleLightboxKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (albumTriggerRef.current?.isConnected) {
        albumTriggerRef.current.focus();
      }
    };
  }, [albumEntries, selectedAlbumEntry]);

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
      <button
        className="text-button text-button--back"
        type="button"
        onClick={() => {
          if (editingEntry && !closeEditEntry()) {
            return;
          }

          onBack();
        }}
      >
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

            <button
              className="journey-management__button"
              type="button"
              onClick={() => setIsJourneyExportOpen(true)}
            >
              Export PDF
            </button>

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
                        <option key={person.id} value={person.id}>
                          {person.label}
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
                    className={entryViewMode === 'cards' ? 'entry-view-button entry-view-button--active' : 'entry-view-button'}
                    type="button"
                    onClick={() => handleEntryViewModeChange('cards')}
                    aria-pressed={entryViewMode === 'cards'}
                  >
                    Cards
                  </button>

                  <button
                    className={entryViewMode === 'album' ? 'entry-view-button entry-view-button--active' : 'entry-view-button'}
                    type="button"
                    onClick={() => handleEntryViewModeChange('album')}
                    aria-pressed={entryViewMode === 'album'}
                  >
                    Album
                  </button>

                  <button
                    className={
                      entryViewMode === 'map'
                        ? 'entry-view-button entry-view-button--active'
                        : 'entry-view-button'
                    }
                    type="button"
                    onClick={() => handleEntryViewModeChange('map')}
                    aria-pressed={entryViewMode === 'map'}
                  >
                    Map
                  </button>
                </div>

                {entryViewMode === 'cards' && (
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
                )}

                {entryViewMode === 'album' && (
                  <div className="entry-sort entry-sort--album" aria-label="Sort album photos">
                    <span className="entry-sort__label">Album order</span>
                    <button
                      className="entry-sort__direction"
                      type="button"
                      onClick={() =>
                        setAlbumSortDirection((current) =>
                          current === 'asc' ? 'desc' : 'asc',
                        )
                      }
                      aria-label={
                        albumSortDirection === 'asc'
                          ? 'Switch to newest first'
                          : 'Switch to oldest first'
                      }
                    >
                      <span aria-hidden="true">
                        {albumSortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                      <span>
                        {albumSortDirection === 'asc' ? 'Oldest first' : 'Newest first'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="entry-results-summary">
                <span>
                  {entryViewMode === 'album'
                    ? `${albumEntries.length} ${albumEntries.length === 1 ? 'photo' : 'photos'}`
                    : `${filteredEntries.length} ${filteredEntries.length === 1 ? 'memory' : 'memories'}`}
                </span>
                {filteredEntries.length !== entries.length && (
                  <span>
                    {entryViewMode === 'album'
                      ? `from ${filteredEntries.length} matching memories`
                      : `of ${entries.length} memories`}
                  </span>
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

                  <div className="entry-display-area__album">
                    {albumEntries.length === 0 ? (
                      <div className="empty-entries empty-entries--filtered">
                        <p className="empty-entries__title">No photos in this selection.</p>
                        <p>Memories without anchor photos are still available in Cards and Map.</p>
                      </div>
                    ) : (
                      <div
                        className="entry-album"
                        aria-label="Memory photo album"
                        ref={albumContainerRef}
                      >
                        {albumRows.map((row, rowIndex) => (
                          <div
                            className="entry-album__row"
                            key={`album-row-${rowIndex}`}
                            style={{ height: `${row.height}px` }}
                          >
                            {row.items.map(({ entry, width }) => (
                              <button
                                className="entry-album__item"
                                key={entry.id}
                                type="button"
                                style={{ width: `${width}px`, height: `${row.height}px` }}
                                onClick={(event) => {
                                  albumTriggerRef.current = event.currentTarget;
                                  setSelectedAlbumEntryId(entry.id);
                                }}
                                aria-label={`View photo for ${entry.title || 'memory'}`}
                              >
                                <img
                                  src={entry.photo!.url}
                                  alt=""
                                  loading="lazy"
                                  onLoad={(event) => {
                                    const image = event.currentTarget;
                                    if (!image.naturalWidth || !image.naturalHeight) return;
                                    const ratio = image.naturalWidth / image.naturalHeight;
                                    setAlbumAspectRatios((current) =>
                                      current[entry.id] === ratio
                                        ? current
                                        : { ...current, [entry.id]: ratio },
                                    );
                                  }}
                                />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="entry-display-area__cards">
                    <div className="entry-grid">
                      {sortedEntries.map((entry) => (
                        <EntryCard key={entry.id} entry={entry} canEdit={canEditJourney} onEdit={openEditEntry} onDelete={openDeleteEntry} />
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
                onDirtyChange={(dirty) => {
                  setIsEditingEntryDirty(dirty);
                  onEntryEditDirtyChange?.(dirty);
                }}
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

                  {isPreparingAnchorPhoto && (
                    <span className="journey-modal__photo-file-name">
                      Preparing photo…
                    </span>
                  )}

                  {anchorPhotoUploadProgress !== null && isSavingJourney && (
                    <span className="journey-modal__photo-file-name">
                      Uploading photo {anchorPhotoUploadProgress}%
                    </span>
                  )}

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
                        const shouldRemove = event.target.checked;

                        if (shouldRemove) {
                          anchorPhotoSelectionGenerationRef.current += 1;
                          setEditAnchorPhoto(null);
                          setIsPreparingAnchorPhoto(false);
                          setAnchorPhotoUploadProgress(null);
                        }

                        setRemoveAnchorPhoto(shouldRemove);
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
                onClick={() => {
                  anchorPhotoSelectionGenerationRef.current += 1;
                  setIsPreparingAnchorPhoto(false);
                  setAnchorPhotoUploadProgress(null);
                  setEditAnchorPhoto(null);
                  setIsEditOpen(false);
                }}
                disabled={isSavingJourney}
              >
                Cancel
              </button>

              <button
                className="primary-button"
                type="button"
                onClick={() => void handleSaveJourney()}
                disabled={
                  isSavingJourney ||
                  isPreparingAnchorPhoto
                }
              >
                {isPreparingAnchorPhoto
                  ? 'Preparing photo…'
                  : anchorPhotoUploadProgress !== null && isSavingJourney
                    ? `Uploading photo ${anchorPhotoUploadProgress}%`
                    : isSavingJourney
                      ? 'Saving…'
                      : 'Save changes'}
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
      {isJourneyExportOpen && journey && (
        <JourneyExportDialog
          journey={journey}
          entries={entries}
          onClose={() => setIsJourneyExportOpen(false)}
        />
      )}
      {selectedAlbumEntry?.photo && (
        <div
          className="entry-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Memory photo"
        >
          <button
            className="entry-lightbox__backdrop"
            type="button"
            aria-label="Close photo"
            onClick={() => setSelectedAlbumEntryId(null)}
          />
          <div className="entry-lightbox__content" ref={lightboxContentRef}>
            <button
              className="entry-lightbox__close"
              type="button"
              onClick={() => setSelectedAlbumEntryId(null)}
              aria-label="Close photo"
            >
              ×
            </button>
            {albumEntries.length > 1 && (
              <>
                <button
                  className="entry-lightbox__previous"
                  type="button"
                  onClick={() => {
                    const index = albumEntries.findIndex(
                      (entry) => entry.id === selectedAlbumEntry.id,
                    );
                    setSelectedAlbumEntryId(
                      albumEntries[(index - 1 + albumEntries.length) % albumEntries.length].id,
                    );
                  }}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  className="entry-lightbox__next"
                  type="button"
                  onClick={() => {
                    const index = albumEntries.findIndex(
                      (entry) => entry.id === selectedAlbumEntry.id,
                    );
                    setSelectedAlbumEntryId(
                      albumEntries[(index + 1) % albumEntries.length].id,
                    );
                  }}
                  aria-label="Next photo"
                >
                  ›
                </button>
              </>
            )}
            <img
              className="entry-lightbox__image"
              src={selectedAlbumEntry.photo.url}
              alt={
                selectedAlbumEntry.photo.caption?.trim() ||
                selectedAlbumEntry.title ||
                'Memory photo'
              }
            />
            {(selectedAlbumEntry.photo.caption?.trim() || selectedAlbumEntry.title) && (
              <p className="entry-lightbox__caption">
                {selectedAlbumEntry.photo.caption?.trim() || selectedAlbumEntry.title}
              </p>
            )}
            {selectedAlbumEntry.date && (
              <p className="entry-lightbox__date">
                {formatDate(selectedAlbumEntry.date)}
              </p>
            )}
            <button
              className="entry-lightbox__open-memory"
              type="button"
              onClick={() => handleOpenMemory(selectedAlbumEntry)}
            >
              Open Memory
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
