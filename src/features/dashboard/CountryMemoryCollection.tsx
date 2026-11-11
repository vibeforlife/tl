import { useMemo, useState } from 'react';
import type { Entry, Journey } from '../../types/domain';
import type { CountryVisitSummary } from './countryVisitCalculations';
import { filterEntries, getEntryPeopleOptions, sortEntries, type EntrySortField } from '../entries/entryFiltering';
import { EntryCard } from '../entries/EntryCard';

type Props = {
  country: CountryVisitSummary;
  journeys: Journey[];
  onOpenJourney: (journeyId: string) => void;
};

const memoryTypeLabels: Record<NonNullable<Entry['memoryType']>, string> = {
  place: 'Place', food: 'Food', sight: 'Sight', event: 'Event',
  moment: 'Moment', experience: 'Experience', people: 'People', other: 'Other',
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
};

export function CountryMemoryCollection({ country, journeys, onOpenJourney }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minRating, setMinRating] = useState('');
  const [memoryType, setMemoryType] = useState('');
  const [person, setPerson] = useState('');
  const [tag, setTag] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<EntrySortField>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [albumSortDirection, setAlbumSortDirection] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'cards' | 'album'>('cards');

  const availablePeople = useMemo(
    () => getEntryPeopleOptions(country.entries),
    [country.entries],
  );
  const availableTags = useMemo(
    () => [...new Set(country.entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b)),
    [country.entries],
  );

  const filteredEntries = useMemo(() => filterEntries(country.entries, {
    searchQuery, dateFrom, dateTo, minRating, memoryType, person, tag,
  }), [country.entries, searchQuery, dateFrom, dateTo, minRating, memoryType, person, tag]);
  const albumEntries = useMemo(
    () => sortEntries(filteredEntries.filter((entry) => Boolean(entry.photo?.url)), 'date', albumSortDirection),
    [filteredEntries, albumSortDirection],
  );

  const journeyById = useMemo(() => new Map(journeys.map((journey) => [journey.id, journey])), [journeys]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Entry[]>();
    filteredEntries.forEach((entry) => {
      const current = grouped.get(entry.journeyId) ?? [];
      current.push(entry);
      grouped.set(entry.journeyId, current);
    });
    return [...grouped.entries()].sort(([a], [b]) => {
      const journeyA = journeyById.get(a);
      const journeyB = journeyById.get(b);
      return (journeyB?.endDate ?? '').localeCompare(journeyA?.endDate ?? '') ||
        (journeyA?.name ?? a).localeCompare(journeyB?.name ?? b);
    }).map(([journeyId, entries]) => ({
      journeyId,
      journey: journeyById.get(journeyId),
      entries: sortEntries(entries, sortField, sortDirection),
    }));
  }, [filteredEntries, journeyById, sortField, sortDirection]);

  const clearFilters = () => {
    setSearchQuery(''); setDateFrom(''); setDateTo(''); setMinRating('');
    setMemoryType(''); setPerson(''); setTag('');
  };

  return (
    <section className="tl-country-collection" aria-labelledby="tl-country-collection-title">
      <div className="tl-country-collection__heading">
        <div>
          <p className="td-kicker">COUNTRY COLLECTION · {country.code}</p>
          <h3 id="tl-country-collection-title">Memories in {country.name}</h3>
          <p>{country.memoryCount} Memories across {country.journeyCount} Journeys · {country.photoCount} anchor photos</p>
        </div>
        <div className="tl-country-collection__view-toggle" role="group" aria-label="Memory view">
          <button type="button" aria-pressed={viewMode === 'cards'} className={viewMode === 'cards' ? 'is-active' : ''} onClick={() => setViewMode('cards')}>Cards</button>
          <button type="button" aria-pressed={viewMode === 'album'} className={viewMode === 'album' ? 'is-active' : ''} onClick={() => setViewMode('album')}>Album</button>
        </div>
      </div>

      <div className="tl-country-controls">
        <label className="tl-country-search">
          <span className="sr-only">Search country Memories</span>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search titles, stories, places, people and tags" />
        </label>
        <button type="button" className="tl-country-filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}>
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
        <label><span>Sort by</span><select value={sortField} onChange={(event) => setSortField(event.target.value as EntrySortField)}>
          <option value="date">Date & time</option><option value="rating">Rating</option><option value="title">Title</option><option value="location">Location</option><option value="type">Type</option>
        </select></label>
        {viewMode === 'cards' ? (
          <label><span>Order</span><select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}>
            <option value="desc">Descending</option><option value="asc">Ascending</option>
          </select></label>
        ) : (
          <label><span>Album chronology</span><select value={albumSortDirection} onChange={(event) => setAlbumSortDirection(event.target.value as 'asc' | 'desc')}>
            <option value="asc">Oldest first</option><option value="desc">Newest first</option>
          </select></label>
        )}
      </div>

      {showFilters && <div className="tl-country-filters">
        <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label><span>Minimum rating</span><select value={minRating} onChange={(event) => setMinRating(event.target.value)}><option value="">Any rating</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}+ stars</option>)}</select></label>
        <label><span>Memory type</span><select value={memoryType} onChange={(event) => setMemoryType(event.target.value)}><option value="">All types</option>{Object.entries(memoryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Person</span><select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Anyone</option>{availablePeople.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
        <label><span>Tag</span><select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Any tag</option>{availableTags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" onClick={clearFilters}>Clear filters</button>
      </div>}

      <p className="tl-country-results" aria-live="polite">Showing {filteredEntries.length} of {country.memoryCount} Memories{viewMode === 'album' ? ` · ${albumEntries.length} with photos` : ''}</p>

      {filteredEntries.length === 0 ? <div className="td-country-empty tl-country-no-results"><h4>No Memories match these filters.</h4><p>Try changing your search or clearing some filters.</p><button type="button" onClick={clearFilters}>Clear filters</button></div> : (
        <div className="tl-country-groups">
          {groups.map((group) => <section className="tl-country-journey" key={group.journeyId}>
            <div className="tl-country-journey__heading">
              <div><p>{group.journey?.place ?? 'Journey'}</p><h4>{group.journey?.name ?? 'Journey unavailable'}</h4><span>{group.entries.length} {group.entries.length === 1 ? 'Memory' : 'Memories'}{group.journey ? ` · ${formatDate(group.journey.startDate)} – ${formatDate(group.journey.endDate)}` : ''}</span></div>
              {group.journey && <button type="button" onClick={() => onOpenJourney(group.journeyId)}>Open Journey ↗</button>}
            </div>
            {viewMode === 'album' ? (
              <div className="tl-country-album">
                {group.entries.filter((entry) => entry.photo?.url).sort((a, b) => albumSortDirection === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)).map((entry) => <a className="tl-country-album__item" key={entry.id} href={entry.photo!.url} target="_blank" rel="noreferrer"><img src={entry.photo!.url} alt={entry.photo!.caption || entry.title} loading="lazy" /><span>{entry.photo!.caption || entry.title}</span></a>)}
                {group.entries.every((entry) => !entry.photo?.url) && <p className="tl-country-no-photos">No anchor photos in this Journey for {country.name}.</p>}
              </div>
            ) : (
              <div className="entry-grid tl-country-entry-grid">
                {group.entries.map((entry) => <EntryCard key={`${entry.journeyId}:${entry.id}`} entry={entry} />)}
              </div>
            )}
          </section>)}
        </div>
      )}
    </section>
  );
}
