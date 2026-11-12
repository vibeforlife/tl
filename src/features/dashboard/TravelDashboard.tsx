import type { Entry, Journey } from '../../types/domain';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { calculateCountryVisits, isEntryCountryAssigned } from './countryVisitCalculations';
import { getGeoJsonContinentMap } from './countryCodeMapping';
import { calculateContinentsExplored, calculateLongestJourney, calculateMostVisitedCountries, calculateTravelMileage } from './travelInsightsCalculations';
import { CountryMemoryCollection } from './CountryMemoryCollection';
import { UnassignedMemoryCollection } from './UnassignedMemoryCollection';

const CountryVisitsMap = lazy(async () => {
  const module = await import('./CountryVisitsMap');
  return { default: module.CountryVisitsMap };
});
import {
  calculateDashboardCoreStats,
  calculatePeopleSummary,
} from './dashboardCalculations';
import './dashboard.css';

type TravelDashboardProps = {
  journeys: Journey[];
  entries: Entry[];
  isLoading: boolean;
  currentUserId: string;
  onOpenJourney: (journeyId: string) => void;
  onSelectPerson: (personKey: string) => void;
  onOpenMemory: (entry: Entry) => void;
  onCreateJourney: () => void;
  onEntriesUpdated: () => Promise<void>;
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
  onSelectPerson,
  onOpenMemory,
  onCreateJourney,
  onEntriesUpdated,
}: TravelDashboardProps) {
  const photoMemories = [...entries]
    .filter((entry) => entry.photo?.url)
    .sort((a, b) => b.date.localeCompare(a.date));
  const featuredMemory = photoMemories[0];
  const supportingMemories = photoMemories.slice(1, 5);
  const recentJourneys = [...journeys].sort((a, b) =>
    b.endDate.localeCompare(a.endDate),
  );

  const coreStats = calculateDashboardCoreStats(journeys, entries, currentUserId);
  const countryVisits = useMemo(() => calculateCountryVisits(entries), [entries]);
  const travelMileage = useMemo(() => calculateTravelMileage(journeys, entries), [journeys, entries]);
  const longestJourney = useMemo(() => calculateLongestJourney(journeys), [journeys]);
  const mostVisitedCountries = useMemo(() => calculateMostVisitedCountries(countryVisits), [countryVisits]);
  const [continentByCountryCode, setContinentByCountryCode] = useState<Record<string, string> | null>(null);
  const [continentDataStatus, setContinentDataStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const continentsExplored = useMemo(() => calculateContinentsExplored(countryVisits, continentByCountryCode ?? {}), [countryVisits, continentByCountryCode]);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [showAllJourneys, setShowAllJourneys] = useState(false);
  const visibleCountries = showAllCountries ? countryVisits : countryVisits.slice(0, 5);
  const visibleJourneys = showAllJourneys ? recentJourneys : recentJourneys.slice(0, 5);
  const selectedCountry = countryVisits.find((country) => country.code === selectedCountryCode) ?? null;
  const unassignedEntries = useMemo(() => entries.filter((entry) => !isEntryCountryAssigned(entry)), [entries]);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [selectedDashboardPersonKey, setSelectedDashboardPersonKey] = useState<string | null>(null);
  const { daysCovered, recordedPlaces, namedPeople, memories } = coreStats;
  const allPeople = calculatePeopleSummary(entries);
  const featuredPeople = [...allPeople]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 24);
  const selectedDashboardPerson = allPeople.find((person) => person.key === selectedDashboardPersonKey) ?? null;
  const selectedDashboardMemories = selectedDashboardPerson
    ? entries
      .filter((entry) => entry.peopleRefs.some((person) => `${person.ownerId}:${person.personId}` === selectedDashboardPerson.key))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
    : [];

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/ne_110m_admin_0_countries.geojson`)
      .then(response => { if (!response.ok) throw new Error('Country dataset unavailable.'); return response.json(); })
      .then((data: {features?: Array<{properties?: Record<string, unknown>}>}) => {
        if (!active) return;
        if (!Array.isArray(data.features)) throw new Error('Country dataset has no feature collection.');
        setContinentByCountryCode(getGeoJsonContinentMap(data.features)); setContinentDataStatus('ready');
      })
      .catch(() => { if (active) setContinentDataStatus('error'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedDashboardPersonKey) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedDashboardPersonKey(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedDashboardPersonKey]);

  return (
    <main className="travel-dashboard">
      <div className="td-dashboard-actions">
        <button className="td-create-journey-trigger" type="button" onClick={onCreateJourney}>
          <span aria-hidden="true">＋</span> Create a Journey
        </button>
      </div>


      <section className="td-insights" aria-labelledby="td-insights-title">
        <div className="td-insights__heading">
          <p className="td-kicker">THE BIGGER PICTURE</p>
          <h2 id="td-insights-title">Travel <em>insights.</em></h2>
        </div>
        <div className="td-insights__grid">
          <article className="td-insight">
            <span className="td-insight__label">Countries visited</span>
            <strong>{isLoading ? '—' : countryVisits.length}</strong>
            <small>Distinct countries represented by recorded Memories.</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Continents visited</span>
            <strong>{isLoading || continentDataStatus !== 'ready' ? '—' : continentsExplored.length}</strong>
            <small>{continentDataStatus === 'error' ? 'Local continent data could not be loaded.' : continentsExplored.length ? continentsExplored.join(' · ') : 'Based on recorded country assignments and Natural Earth classification.'}</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Estimated distance travelled</span>
            <strong>{isLoading || !travelMileage.journeysWithDistance ? '—' : `${Math.round(travelMileage.totalMiles).toLocaleString()} mi · ${Math.round(travelMileage.totalMiles * 1.609344).toLocaleString()} km`}</strong>
            <small>Straight-line great-circle estimate · {travelMileage.journeysWithDistance} Journeys with measurable legs.</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Most visited country</span>
            <strong className="td-insight__value--text">{isLoading || !mostVisitedCountries.length ? '—' : mostVisitedCountries.map(c => c.name).join(', ')}</strong>
            <small>{mostVisitedCountries.length ? `${mostVisitedCountries[0].journeyCount} distinct Journeys${mostVisitedCountries.length > 1 ? ' · tied leaders' : ''}` : 'Counted by distinct Journeys, not Memory volume.'}</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Longest Journey</span>
            <strong>{isLoading || !longestJourney ? '—' : `${longestJourney.days} ${longestJourney.days === 1 ? 'day' : 'days'}`}</strong>
            <small>{longestJourney ? longestJourney.journeys.map(j => j.name).join(', ') : 'Based on inclusive calendar dates in the Journey record.'}</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Number of Journeys</span>
            <strong>{isLoading ? '—' : coreStats.journeyCount}</strong>
            <small>Distinct Journey records available to you.</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Recorded places</span>
            <strong>{isLoading ? '—' : recordedPlaces}</strong>
            <small>Distinct places recorded in your Memories.</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Recorded people</span>
            <strong>{isLoading ? '—' : namedPeople}</strong>
            <small>Distinct people names linked to your Memories.</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Days covered by recorded Journeys</span>
            <strong>{isLoading ? '—' : daysCovered}</strong>
            <small>Inclusive calendar dates, with overlapping dates counted once.</small>
          </article>
          <article className="td-insight">
            <span className="td-insight__label">Memories across your Journeys</span>
            <strong>{isLoading ? '—' : memories.total}</strong>
            <small>{memories.authoredByCurrentUser} created by you · {memories.authoredByOthers} by other Journey members.</small>
          </article>
        </div>
        {!isLoading && <p className="td-insights__note">Mileage is an estimate, not actual flight or road distance. Historical Journeys use Toronto Pearson (YYZ) as the assumed start and return point; Journeys created now use their first and last recorded Memories. Missing coordinates and ambiguous same-day ordering are not guessed. Journey duration uses recorded calendar dates, not verified nights away.{travelMileage.journeysWithoutDistance > 0 ? ` ${travelMileage.journeysWithoutDistance} Journey(s) had no safely measurable route.` : ''} Continents use Natural Earth classification; transcontinental countries follow that dataset's single assigned continent.</p>}
      </section>

      <section className="td-journeys" id="td-journeys" aria-labelledby="td-journeys-title">
        <div className="td-heading-row td-heading-row--journeys">
          <div>
            <p className="td-kicker">THE COLLECTION</p>
            <h2 id="td-journeys-title">Journeys <em>worth remembering.</em></h2>
          </div>
          <span className="td-journey-count">{isLoading ? 'Loading…' : `${coreStats.journeyCount} ${coreStats.journeyCount === 1 ? 'journey' : 'journeys'}`}</span>
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
          <>
          <div className={`td-journey-grid${journeys.length === 2 ? ' td-journey-grid--two' : ''}`}>
            {visibleJourneys.map((journey, index) => (
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
          {recentJourneys.length > 5 && (
            <button
              className="td-list-toggle td-list-toggle--journeys"
              type="button"
              aria-expanded={showAllJourneys}
              onClick={() => setShowAllJourneys((current) => !current)}
            >
              {showAllJourneys ? 'Show less' : `Show all ${recentJourneys.length} Journeys`}
            </button>
          )}
          </>
        )}
      </section>

      {!isLoading && (
        <section className="td-countries" id="td-countries" aria-labelledby="td-countries-title">
          <div className="td-heading-row">
            <div>
              <p className="td-kicker">YOUR WORLD</p>
              <h2 id="td-countries-title">Countries <em>you have explored.</em></h2>
            </div>
            <span className="td-heading-aside">{countryVisits.length} {countryVisits.length === 1 ? 'COUNTRY' : 'COUNTRIES'} WITH RECORDED MEMORIES</span>
          </div>
          <div className="td-country-layout">
            <div className="td-country-map-panel">
              <Suspense fallback={<div className="td-country-map__fallback">Loading world map…</div>}>
                <CountryVisitsMap countries={countryVisits} selectedCountryCode={selectedCountryCode} onSelectCountry={setSelectedCountryCode} />
              </Suspense>
            </div>
            <div className="td-country-report">
              <div className="td-country-report__heading"><h3>Countries recorded</h3><span>{countryVisits.length} total</span></div>
              {countryVisits.length === 0 ? (
                <div className="td-country-empty td-country-empty--report">
                  <span aria-hidden="true">◎</span>
                  <h3>Your map is waiting to take shape.</h3>
                  <p>Countries appear when a Memory has saved Mapbox country information or a manual country assignment. Countries are never guessed from titles or Journey names.</p>
                </div>
              ) : (
                <div className="td-country-list">
                  {visibleCountries.map((country) => (
                    <button className={`td-country-row${selectedCountryCode === country.code ? ' is-selected' : ''}`} key={country.code} type="button" aria-pressed={selectedCountryCode === country.code} onClick={() => { setShowUnassigned(false); setSelectedCountryCode(selectedCountryCode === country.code ? null : country.code); }}>
                      <span className="td-country-row__name"><strong>{country.name}</strong><small>{country.code}</small></span>
                      <span className="td-country-row__metrics"><strong>{country.memoryCount}</strong><small>Memories</small></span>
                      <span className="td-country-row__metrics"><strong>{country.journeyCount}</strong><small>Journeys</small></span>
                      <span className="td-country-row__metrics"><strong>{country.photoCount}</strong><small>Photos</small></span>
                    </button>
                  ))}
                </div>
              )}
              {countryVisits.length > 5 && (
                <button
                  className="td-list-toggle"
                  type="button"
                  aria-expanded={showAllCountries}
                  onClick={() => setShowAllCountries((current) => !current)}
                >
                  {showAllCountries ? 'Show less' : `Show all ${countryVisits.length} countries`}
                </button>
              )}
              <div className="td-country-list">
                <button
                  className={`td-country-row td-country-row--unassigned${showUnassigned ? ' is-selected' : ''}`}
                  type="button"
                  aria-pressed={showUnassigned}
                  onClick={() => { setShowUnassigned((current) => !current); setSelectedCountryCode(null); }}
                >
                  <span className="td-country-row__name"><strong>Unassigned</strong><small>NEEDS A COUNTRY</small></span>
                  <span className="td-country-row__metrics"><strong>{unassignedEntries.length}</strong><small>Memories</small></span>
                  <span className="td-country-row__action">Review &amp; assign ↗</span>
                </button>
              </div>
            </div>
          </div>
          {showUnassigned && (
            <div className="td-country-detail" aria-live="polite">
              <div className="td-country-detail__heading">
                <div>
                  <p className="td-kicker">COUNTRY DETAILS · MANUAL REVIEW</p>
                  <h3>Unassigned Memories</h3>
                  <p>{unassignedEntries.length} Memories without a recorded country</p>
                </div>
                <button type="button" onClick={() => setShowUnassigned(false)}>Close ×</button>
              </div>
              <UnassignedMemoryCollection
                entries={unassignedEntries}
                journeys={journeys}
                userId={currentUserId}
                onOpenJourney={onOpenJourney}
                onUpdated={onEntriesUpdated}
              />
            </div>
          )}
          {selectedCountry && (
            <div className="td-country-detail" aria-live="polite">
              <div className="td-country-detail__heading">
                <div>
                  <p className="td-kicker">COUNTRY DETAILS · {selectedCountry.code}</p>
                  <h3>{selectedCountry.name}</h3>
                  <p>{selectedCountry.memoryCount} Memories · {selectedCountry.journeyCount} Journeys · {selectedCountry.photoCount} photos</p>
                </div>
                <button type="button" onClick={() => setSelectedCountryCode(null)}>Clear selection ×</button>
              </div>
              <CountryMemoryCollection country={selectedCountry} journeys={journeys} onOpenJourney={onOpenJourney} />
            </div>
          )}
        </section>
      )}

      {!isLoading && namedPeople > 0 && (
        <section className="td-connections" aria-label="People in your memories">
          <div>
            <p className="td-kicker">THE PEOPLE ALONG THE WAY</p>
            <h2>Places stay with us.<br /><em>So do the people.</em></h2>
          </div>
          <div className="td-connections__content">
            <div className="td-word-cloud" aria-label={`A word cloud of ${namedPeople} distinct people names`}>
              {featuredPeople.map((person, index) => (
                <button
                  className={`td-word-cloud__name td-word-cloud__name--${(index % 5) + 1}`}
                  key={person.key}
                  type="button"
                  style={{ fontSize: `${Math.min(1.85, 0.88 + person.count * 0.16)}rem` }}
                  onClick={() => setSelectedDashboardPersonKey(person.key)}
                  title={`${person.label}: ${person.count} ${person.count === 1 ? 'Memory' : 'Memories'}`}
                >
                  {person.label}
                </button>
              ))}
            </div>
            <span className="td-connections__total">{namedPeople} distinct names recorded</span>
            <details className="td-people-all">
              <summary>See all {namedPeople} names</summary>
              <ul>
                {allPeople.map((person) => (
                  <li key={person.key}>
                    <button type="button" onClick={() => setSelectedDashboardPersonKey(person.key)}>
                      <span>{person.label}</span>
                      <small>{person.count} {person.count === 1 ? 'Memory' : 'Memories'}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      )}

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

      {selectedDashboardPerson && createPortal((
        <div className="td-person-popup-backdrop" role="presentation" onClick={() => setSelectedDashboardPersonKey(null)}>
          <section
            className="td-person-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="td-person-popup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="td-person-popup__close" type="button" aria-label="Close person preview" onClick={() => setSelectedDashboardPersonKey(null)}>×</button>
            <p className="td-kicker">A PERSON IN YOUR STORIES</p>
            <h2 id="td-person-popup-title">{selectedDashboardPerson.label}</h2>
            <p className="td-person-popup__count">{selectedDashboardPerson.count} associated {selectedDashboardPerson.count === 1 ? 'Memory' : 'Memories'}</p>
            <div className="td-person-popup__memories">
              {selectedDashboardMemories.length === 0 ? <p>No linked Memories found.</p> : selectedDashboardMemories.map((entry) => (
                <button
                  type="button"
                  key={`${entry.journeyId}:${entry.id}`}
                  onClick={() => { setSelectedDashboardPersonKey(null); onOpenMemory(entry); }}
                >
                  <strong>{entry.title}</strong>
                  <span>{formatDate(entry.date)}{entry.location?.name ? ` · ${entry.location.name}` : ''}</span>
                </button>
              ))}
            </div>
            <button className="td-person-popup__profile" type="button" onClick={() => { const key = selectedDashboardPerson.key; setSelectedDashboardPersonKey(null); onSelectPerson(key); }}>
              View full profile <span aria-hidden="true">↗</span>
            </button>
          </section>
        </div>
      ), document.body)}

      <footer className="td-footer">
        <span>TRAVEL LORE</span>
        <span>EVERY PLACE HAS A STORY</span>
      </footer>
    </main>
  );
}
