import { useMemo, useState } from 'react';
import type { Entry, Journey } from '../../types/domain';
import { assignEntryCountryManually } from '../../services/firebase/entries';
import { filterEntries, sortEntries, type EntrySortField } from '../entries/entryFiltering';
import { EntryCard } from '../entries/EntryCard';
import { countryOptions } from './countryOptions';

type Props = {
  entries: Entry[];
  journeys: Journey[];
  userId: string;
  onOpenJourney: (journeyId: string) => void;
  onUpdated: () => Promise<void>;
};

const memoryTypeLabels: Record<NonNullable<Entry['memoryType']>, string> = {
  place: 'Place', food: 'Food', sight: 'Sight', event: 'Event',
  moment: 'Moment', experience: 'Experience', people: 'People', other: 'Other',
};

const entryKey = (entry: Entry) => `${entry.journeyId}:${entry.id}`;

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
};

export function UnassignedMemoryCollection({ entries, journeys, userId, onOpenJourney, onUpdated }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [memoryType, setMemoryType] = useState('');
  const [person, setPerson] = useState('');
  const [tag, setTag] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<EntrySortField>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedCountries, setSelectedCountries] = useState<Record<string, string>>({});
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [errorByEntry, setErrorByEntry] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const availablePeople = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.people))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const availableTags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const filteredEntries = useMemo(() => filterEntries(entries, {
    searchQuery, dateFrom, dateTo, minRating: '', memoryType, person, tag,
  }), [entries, searchQuery, dateFrom, dateTo, memoryType, person, tag]);
  const groups = useMemo(() => {
    const journeyById = new Map(journeys.map((journey) => [journey.id, journey]));
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
    }).map(([journeyId, groupEntries]) => ({
      journeyId,
      journey: journeyById.get(journeyId),
      entries: sortEntries(groupEntries, sortField, sortDirection),
    }));
  }, [filteredEntries, journeys, sortField, sortDirection]);

  const clearFilters = () => {
    setSearchQuery(''); setDateFrom(''); setDateTo('');
    setMemoryType(''); setPerson(''); setTag('');
  };

  const assignCountry = async (entry: Entry) => {
    const key = entryKey(entry);
    const code = selectedCountries[key] ?? '';
    const country = countryOptions.find((option) => option.code === code);
    if (!country) {
      setErrorByEntry((current) => ({ ...current, [key]: 'Choose a country first.' }));
      return;
    }
    setSavingEntryId(key);
    setErrorByEntry((current) => ({ ...current, [key]: '' }));
    setNotice('');
    try {
      await assignEntryCountryManually(entry.journeyId, entry.id, userId, {
        countryCode: country.code,
        countryName: country.name,
      });
      setNotice(`${entry.title} assigned to ${country.name}.`);
      await onUpdated();
    } catch (cause) {
      setErrorByEntry((current) => ({
        ...current,
        [key]: cause instanceof Error ? cause.message : 'Could not assign this country.',
      }));
    } finally {
      setSavingEntryId(null);
    }
  };

  return (
    <section className="tl-country-collection" aria-labelledby="tl-unassigned-title">
      <div className="tl-country-collection__heading">
        <div>
          <p className="td-kicker">COUNTRY COLLECTION · NEEDS ATTENTION</p>
          <h3 id="tl-unassigned-title">Unassigned Memories</h3>
          <p>{entries.length} Memories without a recorded country. Assign a country manually; no location or coordinates are required.</p>
        </div>
      </div>

      <div className="tl-country-controls">
        <label className="tl-country-search">
          <span className="sr-only">Search unassigned Memories</span>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search titles, stories, places, people and tags" />
        </label>
        <button type="button" className="tl-country-filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}>
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
        <label><span>Sort by</span><select value={sortField} onChange={(event) => setSortField(event.target.value as EntrySortField)}>
          <option value="date">Date & time</option><option value="rating">Rating</option><option value="title">Title</option><option value="location">Location</option><option value="type">Type</option>
        </select></label>
        <label><span>Order</span><select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}>
          <option value="desc">Descending</option><option value="asc">Ascending</option>
        </select></label>
      </div>

      {showFilters && <div className="tl-country-filters">
        <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label><span>Memory type</span><select value={memoryType} onChange={(event) => setMemoryType(event.target.value)}><option value="">All types</option>{Object.entries(memoryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Person</span><select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Anyone</option>{availablePeople.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Tag</span><select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Any tag</option>{availableTags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" onClick={clearFilters}>Clear filters</button>
      </div>}

      {notice && <p className="tl-unassigned-notice" role="status">{notice}</p>}
      <p className="tl-country-results" aria-live="polite">Showing {filteredEntries.length} of {entries.length} unassigned Memories</p>

      {filteredEntries.length === 0 ? (
        <div className="td-country-empty tl-country-no-results">
          <h4>{entries.length === 0 ? 'Everything has a country.' : 'No Memories match these filters.'}</h4>
          <p>{entries.length === 0 ? 'There are no Memories waiting for a country assignment.' : 'Try changing your search or clearing some filters.'}</p>
          {entries.length > 0 && <button type="button" onClick={clearFilters}>Clear filters</button>}
        </div>
      ) : (
        <div className="tl-country-groups">
          {groups.map((group) => <section className="tl-country-journey" key={group.journeyId}>
            <div className="tl-country-journey__heading">
              <div><p>{group.journey?.place ?? 'Journey'}</p><h4>{group.journey?.name ?? 'Journey unavailable'}</h4><span>{group.entries.length} {group.entries.length === 1 ? 'Memory' : 'Memories'}{group.journey ? ` · ${formatDate(group.journey.startDate)} – ${formatDate(group.journey.endDate)}` : ''}</span></div>
              {group.journey && <button type="button" onClick={() => onOpenJourney(group.journeyId)}>Open Journey ↗</button>}
            </div>
            <div className="tl-country-unassigned-list">
              {group.entries.map((entry) => (
                <article className="tl-country-unassigned-item" key={`${entry.journeyId}:${entry.id}`}>
                  <EntryCard entry={entry} />
                  <div className="tl-country-assign">
                    <label>
                      <span>Assign country</span>
                      <select
                        value={selectedCountries[entryKey(entry)] ?? ''}
                        onChange={(event) => setSelectedCountries((current) => ({ ...current, [entryKey(entry)]: event.target.value }))}
                        disabled={savingEntryId === entryKey(entry)}
                      >
                        <option value="">Choose a country…</option>
                        {countryOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
                      </select>
                    </label>
                    <button type="button" onClick={() => void assignCountry(entry)} disabled={savingEntryId === entryKey(entry) || !selectedCountries[entryKey(entry)]}>
                      {savingEntryId === entryKey(entry) ? 'Saving…' : 'Save country'}
                    </button>
                    {errorByEntry[entryKey(entry)] && <p role="alert">{errorByEntry[entryKey(entry)]}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>)}
        </div>
      )}
    </section>
  );
}
