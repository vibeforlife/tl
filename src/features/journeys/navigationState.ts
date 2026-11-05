export type EntryViewMode = 'compact' | 'cards' | 'map';

export type JourneyNavigationState =
  | { page: 'home' }
  | {
      page: 'journey';
      journeyId: string;
      entryViewMode: EntryViewMode;
    };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY_PREFIX = 'travel-lore:navigation:v1:';

const homeState: JourneyNavigationState = { page: 'home' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEntryViewMode = (value: unknown): value is EntryViewMode =>
  value === 'compact' || value === 'cards' || value === 'map';

const getBrowserStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getStorageKey = (userId: string) =>
  `${STORAGE_KEY_PREFIX}${userId}`;

export const readJourneyNavigationState = (
  userId: string,
  storage: StorageLike | null = getBrowserStorage(),
): JourneyNavigationState => {
  if (!userId || !storage) return homeState;

  try {
    const raw = storage.getItem(getStorageKey(userId));
    if (!raw) return homeState;

    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || parsed.version !== 1) {
      return homeState;
    }

    if (parsed.page === 'home') {
      return homeState;
    }

    if (
      parsed.page !== 'journey' ||
      typeof parsed.journeyId !== 'string' ||
      !parsed.journeyId.trim()
    ) {
      return homeState;
    }

    return {
      page: 'journey',
      journeyId: parsed.journeyId,
      entryViewMode: isEntryViewMode(parsed.entryViewMode)
        ? parsed.entryViewMode
        : 'compact',
    };
  } catch {
    return homeState;
  }
};

export const saveJourneyNavigationState = (
  userId: string,
  state: JourneyNavigationState,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  if (!userId || !storage) return;

  try {
    storage.setItem(
      getStorageKey(userId),
      JSON.stringify({ version: 1, ...state }),
    );
  } catch {
    // Navigation persistence is optional; the app must remain usable
    // when browser storage is unavailable or full.
  }
};
