export type EntryViewMode = 'cards' | 'album' | 'map';

export type JourneyNavigationState =
  | { page: 'home' }
  | {
      page: 'journey';
      journeyId: string;
      entryViewMode: EntryViewMode;
    };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> &
  Partial<Pick<Storage, 'removeItem'>>;

const STORAGE_KEY_PREFIX = 'travel-lore:navigation:v1:';
const SCROLL_KEY_PREFIX = 'travel-lore:scroll:v1:';

const homeState: JourneyNavigationState = { page: 'home' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEntryViewMode = (value: unknown): value is EntryViewMode =>
  value === 'cards' || value === 'album' || value === 'map';

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

const getScrollStorageKey = (userId: string, journeyId: string) =>
  `${SCROLL_KEY_PREFIX}${userId}:${journeyId}`;

export const readJourneyScrollPosition = (
  userId: string,
  journeyId: string,
  storage: StorageLike | null = getBrowserStorage(),
): number => {
  if (!userId || !journeyId || !storage) return 0;

  try {
    const raw = storage.getItem(getScrollStorageKey(userId, journeyId));
    if (raw === null) return 0;

    const position = Number(raw);
    return Number.isFinite(position) && position >= 0 ? position : 0;
  } catch {
    return 0;
  }
};

export const saveJourneyScrollPosition = (
  userId: string,
  journeyId: string,
  position: number,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  if (!userId || !journeyId || !storage || !Number.isFinite(position)) return;

  try {
    storage.setItem(
      getScrollStorageKey(userId, journeyId),
      String(Math.max(0, Math.round(position))),
    );
  } catch {
    // Scroll persistence is optional.
  }
};

export const clearJourneyScrollPosition = (
  userId: string,
  journeyId: string,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  if (!userId || !journeyId || !storage) return;

  try {
    storage.removeItem?.(getScrollStorageKey(userId, journeyId));
  } catch {
    // Scroll persistence is optional.
  }
};

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
      entryViewMode:
        parsed.entryViewMode === 'compact'
          ? 'cards'
          : isEntryViewMode(parsed.entryViewMode)
            ? parsed.entryViewMode
            : 'cards',
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
