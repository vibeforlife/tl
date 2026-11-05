import { describe, expect, it } from 'vitest';
import {
  readJourneyNavigationState,
  saveJourneyNavigationState,
} from '../src/features/journeys/navigationState';

const createStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe('Journey navigation persistence', () => {
  it('defaults to the home page when no state exists', () => {
    expect(readJourneyNavigationState('user-1', createStorage())).toEqual({
      page: 'home',
    });
  });

  it('saves and restores a Journey and its selected view', () => {
    const storage = createStorage();

    saveJourneyNavigationState(
      'user-1',
      {
        page: 'journey',
        journeyId: 'journey-123',
        entryViewMode: 'map',
      },
      storage,
    );

    expect(readJourneyNavigationState('user-1', storage)).toEqual({
      page: 'journey',
      journeyId: 'journey-123',
      entryViewMode: 'map',
    });
  });

  it('keeps navigation state separate for different users', () => {
    const storage = createStorage();

    saveJourneyNavigationState(
      'user-1',
      {
        page: 'journey',
        journeyId: 'journey-1',
        entryViewMode: 'cards',
      },
      storage,
    );

    saveJourneyNavigationState(
      'user-2',
      {
        page: 'journey',
        journeyId: 'journey-2',
        entryViewMode: 'map',
      },
      storage,
    );

    expect(readJourneyNavigationState('user-1', storage)).toMatchObject({
      journeyId: 'journey-1',
      entryViewMode: 'cards',
    });

    expect(readJourneyNavigationState('user-2', storage)).toMatchObject({
      journeyId: 'journey-2',
      entryViewMode: 'map',
    });
  });

  it('restores the home page when stored JSON is invalid', () => {
    const storage = createStorage();
    storage.setItem('travel-lore:navigation:v1:user-1', '{invalid');

    expect(readJourneyNavigationState('user-1', storage)).toEqual({
      page: 'home',
    });
  });

  it('ignores unsupported stored versions', () => {
    const storage = createStorage();
    storage.setItem(
      'travel-lore:navigation:v1:user-1',
      JSON.stringify({
        version: 2,
        page: 'journey',
        journeyId: 'journey-1',
        entryViewMode: 'map',
      }),
    );

    expect(readJourneyNavigationState('user-1', storage)).toEqual({
      page: 'home',
    });
  });

  it('uses Compact when the stored view is unrecognised', () => {
    const storage = createStorage();
    storage.setItem(
      'travel-lore:navigation:v1:user-1',
      JSON.stringify({
        version: 1,
        page: 'journey',
        journeyId: 'journey-1',
        entryViewMode: 'unknown',
      }),
    );

    expect(readJourneyNavigationState('user-1', storage)).toEqual({
      page: 'journey',
      journeyId: 'journey-1',
      entryViewMode: 'compact',
    });
  });

  it('continues safely when browser storage throws', () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    };

    expect(
      readJourneyNavigationState('user-1', brokenStorage),
    ).toEqual({ page: 'home' });

    expect(() =>
      saveJourneyNavigationState(
        'user-1',
        { page: 'home' },
        brokenStorage,
      ),
    ).not.toThrow();
  });
});
