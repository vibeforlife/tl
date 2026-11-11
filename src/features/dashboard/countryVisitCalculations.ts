import type { Entry } from '../../types/domain';

export interface CountryVisitSummary {
  code: string;
  name: string;
  memoryCount: number;
  journeyCount: number;
  photoCount: number;
  entries: Entry[];
  journeyIds: string[];
}

export const getEntryCountry = (entry: Entry): { code: string; name: string; source: 'mapbox' | 'manual' } | null => {
  const location = entry.location;
  const mapboxValid = Boolean(
    location?.countrySource === 'mapbox-search-box' &&
    typeof location.countryName === 'string' && location.countryName.trim() &&
    typeof location.countryCode === 'string' && /^[A-Z]{2}$/.test(location.countryCode),
  );
  if (mapboxValid) {
    return { code: location!.countryCode!.toUpperCase(), name: location!.countryName!.trim(), source: 'mapbox' };
  }
  const manual = entry.manualCountry;
  if (
    manual?.source === 'manual' &&
    typeof manual.countryName === 'string' && manual.countryName.trim() &&
    typeof manual.countryCode === 'string' && /^[A-Z]{2}$/.test(manual.countryCode)
  ) {
    return { code: manual.countryCode.toUpperCase(), name: manual.countryName.trim(), source: 'manual' };
  }
  return null;
};

export const isEntryCountryAssigned = (entry: Entry): boolean => getEntryCountry(entry) !== null;

/** Uses explicit Mapbox country context first, then user-confirmed manual assignments; never infers from text or coordinates. */
export const calculateCountryVisits = (entries: Entry[]): CountryVisitSummary[] => {
  const unique = new Map<string, Entry>();
  for (const entry of entries) unique.set(`${entry.journeyId}:${entry.id}`, entry);

  const countries = new Map<string, CountryVisitSummary>();
  for (const entry of unique.values()) {
    const country = getEntryCountry(entry);
    if (!country) continue;

    const current = countries.get(country.code) ?? {
      code: country.code, name: country.name, memoryCount: 0,
      journeyCount: 0, photoCount: 0, entries: [], journeyIds: [],
    };
    current.memoryCount += 1;
    if (entry.photo?.url) current.photoCount += 1;
    current.entries.push(entry);
    if (!current.journeyIds.includes(entry.journeyId)) {
      current.journeyIds.push(entry.journeyId);
      current.journeyCount += 1;
    }
    countries.set(country.code, current);
  }
  const mostRecentMemoryDate = (country: CountryVisitSummary): string =>
    country.entries.reduce((latest, entry) => entry.date > latest ? entry.date : latest, '');

  return [...countries.values()].sort((a, b) =>
    mostRecentMemoryDate(b).localeCompare(mostRecentMemoryDate(a)) ||
    a.name.localeCompare(b.name),
  );
};
