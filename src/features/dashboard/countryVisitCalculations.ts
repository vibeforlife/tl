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

const validCountry = (entry: Entry): { code: string; name: string } | null => {
  const location = entry.location;
  if (
    !location ||
    location.countrySource !== 'mapbox-search-box' ||
    typeof location.countryName !== 'string' ||
    !location.countryName.trim() ||
    typeof location.countryCode !== 'string' ||
    !/^[A-Z]{2}$/.test(location.countryCode)
  ) return null;

  // The user chose saved Mapbox country metadata as authoritative when sources conflict.
  // Cached EntryGeography is therefore not used to override this assignment.
  return { code: location.countryCode.toUpperCase(), name: location.countryName.trim() };
};

/** Uses only explicitly saved Mapbox country context; never infers from text or coordinates. */
export const calculateCountryVisits = (entries: Entry[]): CountryVisitSummary[] => {
  const unique = new Map<string, Entry>();
  for (const entry of entries) unique.set(`${entry.journeyId}:${entry.id}`, entry);

  const countries = new Map<string, CountryVisitSummary>();
  for (const entry of unique.values()) {
    const country = validCountry(entry);
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
  return [...countries.values()].sort((a, b) => a.name.localeCompare(b.name));
};
