import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Journey } from '../../types/domain';
import { listMyJourneys } from '../../services/firebase/journeys';
import { CreateJourneyForm } from './CreateJourneyForm';
import { JourneyDetail } from './JourneyDetail';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));

export function JourneyHome({
  user,
  homeRequest = 0,
}: {
  user: User;
  homeRequest?: number;
}) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJourneys = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setJourneys(await listMyJourneys(user.uid));
    } catch {
      setError('We could not load your journeys. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user.uid]);

  useEffect(() => {
    void loadJourneys();
  }, [loadJourneys]);

  useEffect(() => {
    setSelectedJourneyId(null);
  }, [homeRequest]);

  if (selectedJourneyId) {
    return (
      <JourneyDetail
        user={user}
        journeyId={selectedJourneyId}
        onBack={() => {
          setSelectedJourneyId(null);
          void loadJourneys();
        }}
      />
    );
  }

  return (
    <main className="journey-home">
      <div className="journey-home__atmosphere" aria-hidden="true" />

      <section className="journey-home__hero">
        <div
          className="journey-home__hero-image"
          aria-hidden="true"
        />

        <p className="eyebrow">YOUR JOURNEYS</p>
        <h1>Every place has a story.</h1>
        <p className="journey-empty-copy">
          Keep the places, moments, and memories worth remembering.
        </p>
      </section>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <section
        className="journey-home__existing"
        aria-labelledby="existing-journeys-title"
      >
        <div className="journey-section-heading">
          <p className="eyebrow" id="existing-journeys-title">
            EXISTING JOURNEYS
          </p>
          {!isLoading && journeys.length > 0 && (
            <span className="journey-count">
              {journeys.length} {journeys.length === 1 ? 'journey' : 'journeys'}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="journey-status" aria-live="polite">
            Loading your journeys…
          </p>
        ) : journeys.length === 0 ? (
          <div className="empty-journeys">
            <p className="empty-journeys__title">Your story starts here.</p>
            <p>Create your first journey below.</p>
          </div>
        ) : (
          <section className="journey-grid" aria-label="Your journeys">
            {journeys.map((journey) => (
              <button
                className={[
                  'journey-card',
                  'journey-card--button',
                  journey.anchorPhoto ? 'journey-card--has-photo' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={journey.id}
                type="button"
                onClick={() => setSelectedJourneyId(journey.id)}
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
                    className="journey-card__photo-overlay"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="journey-card__place">{journey.place}</span>
                <span className="journey-card__title">{journey.name}</span>
                <span className="journey-card__dates">
                  {formatDate(journey.startDate)} — {formatDate(journey.endDate)}
                </span>
                <span className="journey-card__open">Open journey →</span>
              </button>
            ))}
          </section>
        )}
      </section>

      <section
        className="journey-home__create"
        aria-labelledby="new-journey-title"
      >
        <CreateJourneyForm user={user} onCreated={loadJourneys} />
      </section>
    </main>
  );

}
