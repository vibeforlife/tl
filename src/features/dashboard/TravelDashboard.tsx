import type { Entry, Journey } from '../../types/domain';
import {
  calculateDaysCovered,
  calculateNamedPeopleCount,
  calculateRecordedPlaceCount,
} from './dashboardCalculations';
import './dashboard.css';

type TravelDashboardProps = {
  journeys: Journey[];
  entries: Entry[];
  isLoading: boolean;
  currentUserId: string;
  onOpenJourney: (journeyId: string) => void;
  onCreateJourney: () => void;
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const formatDateRange = (journey: Journey) =>
  `${formatDate(journey.startDate)} — ${formatDate(journey.endDate)}`;

export function TravelDashboard({
  journeys,
  entries,
  isLoading,
  currentUserId,
  onOpenJourney,
  onCreateJourney,
}: TravelDashboardProps) {
  const photoMemories = [...entries]
    .filter((entry) => entry.photo?.url)
    .sort((a, b) => b.date.localeCompare(a.date));
  const featuredMemory = photoMemories[0];
  const supportingMemories = photoMemories.slice(1, 5);
  const recentJourneys = [...journeys].sort((a, b) =>
    b.endDate.localeCompare(a.endDate),
  );

  const daysCovered = calculateDaysCovered(journeys);
  const recordedPlaces = calculateRecordedPlaceCount(entries);
  const namedPeople = calculateNamedPeopleCount(entries);
  const peopleCloud = new Map<string, { label: string; count: number }>();
  for (const entry of entries) {
    for (const person of entry.people) {
      const key = person.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (!key) continue;
      const existing = peopleCloud.get(key);
      peopleCloud.set(key, {
        label: existing?.label ?? person.trim().replace(/\s+/g, ' '),
        count: (existing?.count ?? 0) + 1,
      });
    }
  }
  const allPeople = [...peopleCloud.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const featuredPeople = [...allPeople]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 24);

  return (
    <main className="travel-dashboard">
      <section className="td-hero" aria-labelledby="td-title">
        <div className="td-hero__copy">
          <p className="td-kicker"><span /> YOUR TRAVEL STORY</p>
          <h1 id="td-title">The world,<br /><em>as you lived it.</em></h1>
          <p className="td-hero__intro">
            Every journey leaves a mark. Every memory brings a place back to life.
          </p>
          <a className="td-hero__link" href="#td-journeys">
            Explore your journeys <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="td-hero__visual">
          <div className="td-hero__photo-wrap">
            <img
              className="td-hero__photo"
              src={featuredMemory?.photo?.url ?? `${import.meta.env.BASE_URL}travel-lore-hero.jpg`}
              alt={featuredMemory ? featuredMemory.photo?.caption || featuredMemory.title : 'A glimpse of the world through Travel Lore'}
            />
            <div className="td-hero__photo-shade" />
            <div className="td-hero__photo-caption">
              <span>{featuredMemory ? (featuredMemory.createdBy === currentUserId ? 'YOUR MEMORY' : 'SHARED MEMORY') : 'EVERY PLACE HAS A STORY'}</span>
              <strong>{featuredMemory?.photo?.caption || featuredMemory?.title || 'Your next story is waiting.'}</strong>
              {featuredMemory && <small>{formatDate(featuredMemory.date)}</small>}
            </div>
          </div>
          <span className="td-hero__sunburst" aria-hidden="true">✳</span>
          <span className="td-hero__side-note" aria-hidden="true">COLLECT MOMENTS · NOT MILES</span>
        </div>
      </section>

      <section className="td-stats" aria-label="Your travel at a glance">
        <div className="td-section-heading">
          <div className="td-section-label">
            <span>AT A GLANCE</span>
            <span className="td-section-label__line" />
            <span>THE NUMBERS BEHIND YOUR STORIES</span>
          </div>
          <button className="td-create-journey-trigger" type="button" onClick={onCreateJourney}>
            <span aria-hidden="true">＋</span> Create a Journey
          </button>
        </div>
        <div className="td-stats__grid">
          <article className="td-stat td-stat--coral">
            <span className="td-stat__symbol" aria-hidden="true">✳</span>
            <strong>{isLoading ? '—' : journeys.length}</strong>
            <span>Journeys</span>
          </article>
          <article className="td-stat td-stat--gold">
            <span className="td-stat__symbol" aria-hidden="true">◷</span>
            <strong>{isLoading ? '—' : daysCovered}</strong>
            <span>Days covered by recorded Journeys</span>
          </article>
          <article className="td-stat td-stat--teal">
            <span className="td-stat__symbol" aria-hidden="true">▧</span>
            <strong>{isLoading ? '—' : entries.length}</strong>
            <span>Memories across your Journeys</span>
          </article>
          <article className="td-stat td-stat--lilac">
            <span className="td-stat__symbol" aria-hidden="true">⌖</span>
            <strong>{isLoading ? '—' : recordedPlaces}</strong>
            <span>Recorded places</span>
          </article>
        </div>
        {!isLoading && journeys.length > 0 && (
          <p className="td-stats__note">
            Days are calendar dates covered by your Journey records, with overlapping dates counted once. They are not verified days physically travelling.
          </p>
        )}
      </section>

      {photoMemories.length > 1 && (
        <section className="td-moments" aria-labelledby="td-moments-title">
          <div className="td-heading-row">
            <div>
              <p className="td-kicker">POSTCARDS FROM YOUR PAST</p>
              <h2 id="td-moments-title">Little moments. <em>Big memories.</em></h2>
            </div>
            <span className="td-heading-aside">A FEW FRAMES FROM YOUR STORY</span>
          </div>
          <div className="td-memory-strip">
            {supportingMemories.length > 0 ? supportingMemories.map((entry, index) => (
              <article className={`td-memory-card td-memory-card--${index + 1}`} key={`${entry.journeyId}-${entry.id}`}>
                <img src={entry.photo!.url} alt={entry.photo!.caption || entry.title} loading="lazy" />
                <div className="td-memory-card__caption">
                  <strong>{entry.photo!.caption || entry.title}</strong>
                  <span>{entry.createdBy === currentUserId ? 'Your memory' : 'Shared memory'} · {formatDate(entry.date)}</span>
                </div>
              </article>
            )) : (
              <article className="td-memory-card td-memory-card--single">
                <img src={featuredMemory!.photo!.url} alt={featuredMemory!.photo!.caption || featuredMemory!.title} loading="lazy" />
                <div className="td-memory-card__caption">
                  <strong>{featuredMemory!.photo!.caption || featuredMemory!.title}</strong>
                  <span>{formatDate(featuredMemory!.date)}</span>
                </div>
              </article>
            )}
          </div>
        </section>
      )}

      <section className="td-journeys" id="td-journeys" aria-labelledby="td-journeys-title">
        <div className="td-heading-row td-heading-row--journeys">
          <div>
            <p className="td-kicker">THE COLLECTION</p>
            <h2 id="td-journeys-title">Journeys <em>worth remembering.</em></h2>
          </div>
          <span className="td-journey-count">{isLoading ? 'Loading…' : `${journeys.length} ${journeys.length === 1 ? 'journey' : 'journeys'}`}</span>
        </div>

        {isLoading ? (
          <p className="td-status" aria-live="polite">Gathering your stories…</p>
        ) : journeys.length === 0 ? (
          <div className="td-empty">
            <span className="td-empty__ornament" aria-hidden="true">✳</span>
            <h3>Your story starts somewhere.</h3>
            <p>Create your first Journey and give those memories a home.</p>
            <button className="td-empty__action" type="button" onClick={onCreateJourney}>Create your first Journey <span aria-hidden="true">↗</span></button>
          </div>
        ) : (
          <div className={`td-journey-grid${journeys.length === 2 ? ' td-journey-grid--two' : ''}`}>
            {recentJourneys.map((journey, index) => (
              <button
                className={`td-journey-card td-journey-card--${(index % 3) + 1}`}
                key={journey.id}
                type="button"
                onClick={() => onOpenJourney(journey.id)}
              >
                {journey.anchorPhoto?.url ? (
                  <img className="td-journey-card__image" src={journey.anchorPhoto.url} alt="" loading="lazy" />
                ) : (
                  <span className="td-journey-card__pattern" aria-hidden="true">✳</span>
                )}
                <span className="td-journey-card__overlay" />
                <span className="td-journey-card__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="td-journey-card__content">
                  <span>{journey.place}</span>
                  <strong>{journey.name}</strong>
                  <small>{formatDateRange(journey)}</small>
                </span>
                <span className="td-journey-card__arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {!isLoading && namedPeople > 0 && (
        <section className="td-connections" aria-label="People in your memories">
          <div>
            <p className="td-kicker">THE PEOPLE ALONG THE WAY</p>
            <h2>Places stay with us.<br /><em>So do the people.</em></h2>
          </div>
          <div className="td-connections__content">
            <div className="td-word-cloud" aria-label={`A word cloud of ${namedPeople} distinct people names`}>
              {featuredPeople.map((person, index) => (
                <span
                  className={`td-word-cloud__name td-word-cloud__name--${(index % 5) + 1}`}
                  key={person.label.toLocaleLowerCase()}
                  style={{ fontSize: `${Math.min(1.85, 0.88 + person.count * 0.16)}rem` }}
                  title={`${person.label}: ${person.count} ${person.count === 1 ? 'Memory' : 'Memories'}`}
                >
                  {person.label}
                </span>
              ))}
            </div>
            <span className="td-connections__total">{namedPeople} distinct names recorded</span>
            <details className="td-people-all">
              <summary>See all {namedPeople} names</summary>
              <ul>
                {allPeople.map((person) => (
                  <li key={person.label.toLocaleLowerCase()}>
                    <span>{person.label}</span>
                    <small>{person.count} {person.count === 1 ? 'Memory' : 'Memories'}</small>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      )}

      <footer className="td-footer">
        <span>TRAVEL LORE</span>
        <span>EVERY PLACE HAS A STORY</span>
      </footer>
    </main>
  );
}
