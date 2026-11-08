import type { Entry } from '../../types/domain';

export type EntrySortField = 'date' | 'rating' | 'title' | 'location' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface EntryFilters {
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  minRating?: string | number;
  memoryType?: string;
  person?: string;
  tag?: string;
}

export function filterEntries(entries: Entry[], filters: EntryFilters): Entry[] {
  const query = (filters.searchQuery ?? '').trim().toLocaleLowerCase();
  const rating = filters.minRating ? Number(filters.minRating) : 0;

  return entries.filter((entry) => {
    if (filters.dateFrom && entry.date < filters.dateFrom) return false;
    if (filters.dateTo && entry.date > filters.dateTo) return false;
    if (rating && (entry.rating ?? 0) < rating) return false;
    if (filters.memoryType && entry.memoryType !== filters.memoryType) return false;
    if (filters.person && !entry.people.includes(filters.person)) return false;
    if (filters.tag && !entry.tags.includes(filters.tag)) return false;

    if (query) {
      const searchableText = [
        entry.title,
        entry.story,
        entry.highlight,
        entry.location?.name,
        entry.location?.address,
        ...entry.people,
        ...entry.tags,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      if (!searchableText.includes(query)) return false;
    }
    return true;
  });
}

export function sortEntries(
  entries: Entry[],
  field: EntrySortField,
  direction: SortDirection,
): Entry[] {
  const result = [...entries];
  result.sort((a, b) => {
    let comparison = 0;
    switch (field) {
      case 'rating': comparison = (a.rating ?? 0) - (b.rating ?? 0); break;
      case 'title': comparison = a.title.localeCompare(b.title); break;
      case 'location': comparison = (a.location?.name ?? '').localeCompare(b.location?.name ?? ''); break;
      case 'type': comparison = (a.memoryType ?? '').localeCompare(b.memoryType ?? ''); break;
      case 'date':
      default:
        comparison = `${a.date}T${a.time ?? '00:00'}`.localeCompare(`${b.date}T${b.time ?? '00:00'}`);
        break;
    }
    return direction === 'asc' ? comparison : -comparison;
  });
  return result;
}
