import type {
  Entry,
  Journey,
  ReliveConfiguration,
  ReliveDurationMode,
} from '../types/domain';


export const DEFAULT_RELIVE_SOUNDTRACK_ID = 'cinematic-piano';

const RELIVE_SOUNDTRACK_IDS = new Set([
  'cinematic-piano',
  'upbeat-music',
  'happy-upbeat',
  'catchy-indie-pop',
  'upbeat-corporate',
  'uplifting-80s',
]);

export const isReliveSoundtrackId = (value: unknown): value is string =>
  typeof value === 'string' && RELIVE_SOUNDTRACK_IDS.has(value);

export type ReliveScene =
  | {
      id: 'opening';
      type: 'opening';
      title: string;
      subtitle: string;
      durationSeconds: number;
    }
  | {
      id: string;
      type: 'memory';
      entryId: string;
      title: string;
      date: string;
      highlight: string;
      photoUrl?: string;
      photoCaption?: string;
      locationName?: string;
      coordinates?: { latitude: number; longitude: number };
      durationSeconds: number;
    }
  | {
      id: 'closing';
      type: 'closing';
      title: string;
      subtitle: string;
      durationSeconds: number;
    };

export interface RelivePresentation {
  journeyId: string;
  title: string;
  durationMode: ReliveDurationMode;
  scenes: ReliveScene[];
  memoryCount: number;
  estimatedDurationSeconds: number;
}

const memoryDurationSeconds: Record<ReliveDurationMode, number> = {
  highlights: 5,
  journey: 8,
  complete: 12,
};

const openingDurationSeconds: Record<ReliveDurationMode, number> = {
  highlights: 5,
  journey: 7,
  complete: 9,
};

const closingDurationSeconds: Record<ReliveDurationMode, number> = {
  highlights: 4,
  journey: 6,
  complete: 8,
};

/**
 * Returns Memories in chronological order, independent of the order in which
 * the caller loaded them. Equal date/time values have stable tie-breakers.
 */
export const sortReliveEntries = (entries: Entry[]): Entry[] =>
  [...entries].sort((a, b) => {
    const dateTimeA = `${a.date}T${a.time || '00:00'}`;
    const dateTimeB = `${b.date}T${b.time || '00:00'}`;
    return (
      dateTimeA.localeCompare(dateTimeB) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
    );
  });

/** Resolves automatic or curated selection without mutating source Memories. */
export const selectReliveEntries = (
  entries: Entry[],
  configuration: Pick<ReliveConfiguration, 'selectionMode' | 'selectedEntryIds'>,
): Entry[] => {
  if (configuration.selectionMode === 'automatic') {
    return sortReliveEntries(entries);
  }

  const selectedIds = new Set(configuration.selectedEntryIds);
  return sortReliveEntries(entries.filter((entry) => selectedIds.has(entry.id)));
};

export const getReliveDurationLabel = (
  mode: ReliveDurationMode,
): string => {
  switch (mode) {
    case 'highlights':
      return 'Highlights';
    case 'journey':
      return 'The Journey';
    case 'complete':
      return 'The Complete Story';
  }
};

/**
 * Builds a presentation sequence from existing Journey and Memory fields.
 * It deliberately does not infer routes, missing coordinates, or story details.
 */
export const buildRelivePresentation = (
  journey: Journey,
  entries: Entry[],
  configuration: Pick<
    ReliveConfiguration,
    'title' | 'selectionMode' | 'selectedEntryIds' | 'durationMode'
  >,
): RelivePresentation => {
  const selectedEntries = selectReliveEntries(entries, configuration);
  const mode = configuration.durationMode;
  const scenes: ReliveScene[] = [
    {
      id: 'opening',
      type: 'opening',
      title: configuration.title.trim() || journey.name,
      subtitle: journey.place,
      durationSeconds: openingDurationSeconds[mode],
    },
  ];

  for (const entry of selectedEntries) {
    scenes.push({
      id: `memory-${entry.id}`,
      type: 'memory',
      entryId: entry.id,
      title: entry.title,
      date: entry.date,
      highlight: entry.highlight?.trim() || '',
      ...(entry.photo?.url ? { photoUrl: entry.photo.url } : {}),
      ...(entry.photo?.caption ? { photoCaption: entry.photo.caption } : {}),
      ...(entry.location?.name
        ? { locationName: entry.location.name }
        : {}),
      ...(entry.location &&
      Number.isFinite(entry.location.latitude) &&
      entry.location.latitude >= -90 &&
      entry.location.latitude <= 90 &&
      Number.isFinite(entry.location.longitude) &&
      entry.location.longitude >= -180 &&
      entry.location.longitude <= 180
        ? {
            coordinates: {
              latitude: entry.location.latitude,
              longitude: entry.location.longitude,
            },
          }
        : {}),
      durationSeconds: memoryDurationSeconds[mode],
    });
  }

  scenes.push({
    id: 'closing',
    type: 'closing',
    title: 'Every place has a story.',
    subtitle: journey.name,
    durationSeconds: closingDurationSeconds[mode],
  });

  return {
    journeyId: journey.id,
    title: configuration.title.trim() || journey.name,
    durationMode: mode,
    scenes,
    memoryCount: selectedEntries.length,
    estimatedDurationSeconds: scenes.reduce(
      (total, scene) => total + scene.durationSeconds,
      0,
    ),
  };
};

export const formatReliveDuration = (durationSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return minutes > 0 ? `${minutes} min ${seconds} sec` : `${seconds} sec`;
};
