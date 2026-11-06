import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Entry, Journey } from '../../types/domain';
import { listJourneyEntries } from '../../services/firebase/entries';
import { listMyJourneys } from '../../services/firebase/journeys';
import { TravelDashboard } from '../dashboard/TravelDashboard';
import { CreateJourneyForm } from './CreateJourneyForm';
import { JourneyDetail } from './JourneyDetail';
import {
  clearJourneyScrollPosition,
  readJourneyNavigationState,
  saveJourneyNavigationState,
  type EntryViewMode,
} from './navigationState';

export function JourneyHome({
  user,
  homeRequest = 0,
}: {
  user: User;
  homeRequest?: number;
}) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateJourneyOpen, setIsCreateJourneyOpen] = useState(false);
  const createJourneySectionRef = useRef<HTMLElement | null>(null);
  const editingEntryDirtyRef = useRef(false);
  const selectedJourneyIdRef = useRef<string | null>(null);
  selectedJourneyIdRef.current = selectedJourneyId;
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryViewMode, setSelectedEntryViewMode] =
    useState<EntryViewMode>('cards');
  const hasRestoredNavigationRef = useRef(false);

  const loadJourneys = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextJourneys = await listMyJourneys(user.uid);
      const entryGroups = await Promise.all(
        nextJourneys.map((journey) => listJourneyEntries(journey.id)),
      );
      setJourneys(nextJourneys);
      setEntries(entryGroups.flat());

      if (!hasRestoredNavigationRef.current) {
        hasRestoredNavigationRef.current = true;
        const savedNavigation = readJourneyNavigationState(user.uid);

        if (
          savedNavigation.page === 'journey' &&
          nextJourneys.some(
            (journey) => journey.id === savedNavigation.journeyId,
          )
        ) {
          setSelectedEntryViewMode(savedNavigation.entryViewMode);
          setSelectedJourneyId(savedNavigation.journeyId);
        } else {
          saveJourneyNavigationState(user.uid, { page: 'home' });
        }
      }
    } catch {
      setError('We could not load your travel dashboard. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user.uid]);

  useEffect(() => {
    void loadJourneys();
  }, [loadJourneys]);

  useEffect(() => {
    if (isCreateJourneyOpen) {
      createJourneySectionRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    }
  }, [isCreateJourneyOpen]);

  useEffect(() => {
    if (homeRequest === 0) {
      return;
    }

    if (editingEntryDirtyRef.current) {
      const shouldDiscard = window.confirm(
        'You have unsaved changes to this memory. Discard them?',
      );

      if (!shouldDiscard) {
        return;
      }
    }

    editingEntryDirtyRef.current = false;
    hasRestoredNavigationRef.current = true;
    if (selectedJourneyIdRef.current) {
      clearJourneyScrollPosition(user.uid, selectedJourneyIdRef.current);
    }
    saveJourneyNavigationState(user.uid, { page: 'home' });
    setSelectedJourneyId(null);
  }, [homeRequest, user.uid]);

  if (selectedJourneyId) {
    return (
      <JourneyDetail
        user={user}
        journeyId={selectedJourneyId}
        initialEntryViewMode={selectedEntryViewMode}
        onEntryViewModeChange={(entryViewMode) => {
          setSelectedEntryViewMode(entryViewMode);
          saveJourneyNavigationState(user.uid, {
            page: 'journey',
            journeyId: selectedJourneyId,
            entryViewMode,
          });
        }}
        onEntryEditDirtyChange={(dirty) => {
          editingEntryDirtyRef.current = dirty;
        }}
        onBack={() => {
          clearJourneyScrollPosition(user.uid, selectedJourneyId);
          saveJourneyNavigationState(user.uid, { page: 'home' });
          setSelectedJourneyId(null);
          void loadJourneys();
        }}
      />
    );
  }

  return (
    <div className="journey-home journey-home--dashboard">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <TravelDashboard
        journeys={journeys}
        entries={entries}
        isLoading={isLoading}
        currentUserId={user.uid}
        onCreateJourney={() => setIsCreateJourneyOpen(true)}
        onOpenJourney={(journeyId) => {
          const savedNavigation = readJourneyNavigationState(user.uid);
          const nextViewMode =
            savedNavigation.page === 'journey' &&
            savedNavigation.journeyId === journeyId
              ? savedNavigation.entryViewMode
              : 'cards';

          setSelectedEntryViewMode(nextViewMode);
          saveJourneyNavigationState(user.uid, {
            page: 'journey',
            journeyId,
            entryViewMode: nextViewMode,
          });
          setSelectedJourneyId(journeyId);
        }}
      />

      {isCreateJourneyOpen && (
        <section
          ref={createJourneySectionRef}
          className="journey-home__create journey-home__create--dashboard"
          aria-labelledby="new-journey-title"
        >
          <div className="td-create-journey-heading">
            <p className="td-kicker">A NEW CHAPTER</p>
            <button
              className="td-create-journey-close"
              type="button"
              onClick={() => setIsCreateJourneyOpen(false)}
            >
              Close <span aria-hidden="true">×</span>
            </button>
          </div>
          <CreateJourneyForm
            user={user}
            onCreated={async () => {
              await loadJourneys();
              setIsCreateJourneyOpen(false);
            }}
          />
        </section>
      )}
    </div>
  );

}
