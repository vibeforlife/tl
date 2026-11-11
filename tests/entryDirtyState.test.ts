import { describe, expect, it } from 'vitest';

import { isEntryDraftDirty } from '../src/features/entries/entryDirtyState';
import type { Entry } from '../src/types/domain';
import type { CreateEntryInput } from '../src/services/firebase/entries';

const entry = (): Entry => ({
  id: 'entry-1',
  journeyId: 'journey-1',
  title: 'Sunset in Oia',
  date: '2026-09-01',
  time: '19:30',
  story: 'The sunset was unforgettable.',
  highlight: 'The best sunset of the trip.',
  rating: 5,
  peopleRefs: [
    { personId: 'sarah', ownerId: 'user-1', displayName: 'Sarah' },
    { personId: 'ahmed', ownerId: 'user-1', displayName: 'Ahmed' },
  ],
  memoryType: 'moment',
  tags: ['sunset', 'family'],
  location: {
    name: 'Oia, Santorini',
    address: 'Oia, Greece',
    latitude: 36.4618,
    longitude: 25.3753,
    mapboxPlaceId: 'test-mapbox-id',
  },
  photo: {
    url: 'https://example.com/photo.jpg',
    storagePath: 'journeys/journey-1/entries/entry-1/photo.jpg',
    caption: 'Sunset',
  },
  costs: [
    {
      category: 'ride',
      amount: 25,
      currency: 'EUR',
    },
  ],
  createdBy: 'user-1',
  createdAt: {} as Entry['createdAt'],
  updatedAt: {} as Entry['updatedAt'],
});

const draft = (): CreateEntryInput => ({
  title: 'Sunset in Oia',
  date: '2026-09-01',
  time: '19:30',
  story: 'The sunset was unforgettable.',
  highlight: 'The best sunset of the trip.',
  rating: 5,
  peopleRefs: [
    { personId: 'sarah', ownerId: 'user-1', displayName: 'Sarah' },
    { personId: 'ahmed', ownerId: 'user-1', displayName: 'Ahmed' },
  ],
  memoryType: 'moment',
  tags: ['sunset', 'family'],
  location: {
    name: 'Oia, Santorini',
    address: 'Oia, Greece',
    latitude: 36.4618,
    longitude: 25.3753,
    mapboxPlaceId: 'test-mapbox-id',
  },
  photo: {
    url: 'https://example.com/photo.jpg',
    storagePath: 'journeys/journey-1/entries/entry-1/photo.jpg',
    caption: 'Sunset',
  },
  costs: [
    {
      category: 'ride',
      amount: 25,
      currency: 'EUR',
    },
  ],
});

const tagsText = 'sunset, family';
const manualLocation = {
  name: 'Oia, Santorini',
  address: 'Oia, Greece',
  latitude: '36.4618',
  longitude: '25.3753',
};

const isDirty = (
  nextDraft: CreateEntryInput,
  options?: {
    tags?: string;
    location?: typeof manualLocation;
    caption?: string;
    pendingPhotoFile?: File | null;
    removePhoto?: boolean;
  },
) =>
  isEntryDraftDirty(
    entry(),
    nextDraft,
    options?.tags ?? tagsText,
    options?.location ?? manualLocation,
    options?.caption ?? 'Sunset',
    options?.pendingPhotoFile ?? null,
    options?.removePhoto ?? false,
  );

describe('Entry dirty-state detection', () => {
  it('starts clean when the draft matches the saved entry', () => {
    expect(isDirty(draft())).toBe(false);
  });

  it('detects changes to primary fields', () => {
    expect(isDirty({ ...draft(), title: 'Different title' })).toBe(true);
    expect(isDirty({ ...draft(), date: '2026-09-02' })).toBe(true);
    expect(isDirty({ ...draft(), story: 'A different story.' })).toBe(true);
    expect(isDirty({ ...draft(), highlight: 'Different highlight' })).toBe(true);
  });

  it('detects changes to structured fields', () => {
    expect(isDirty({ ...draft(), rating: 4 })).toBe(true);
    expect(isDirty({ ...draft(), memoryType: 'place' })).toBe(true);
    expect(isDirty({
      ...draft(),
      peopleRefs: [{ personId: 'sarah', ownerId: 'user-1', displayName: 'Sarah' }],
    })).toBe(true);
    expect(isDirty(draft(), { tags: 'sunset, beach' })).toBe(true);
  });

  it('detects location changes', () => {
    expect(
      isDirty(draft(), {
        location: {
          ...manualLocation,
          name: 'Fira, Santorini',
        },
      }),
    ).toBe(true);
  });

  it('detects cost changes', () => {
    expect(
      isDirty({
        ...draft(),
        costs: [
          {
            category: 'ride',
            amount: 30,
            currency: 'EUR',
          },
        ],
      }),
    ).toBe(true);
  });

  it('detects photo caption changes', () => {
    expect(isDirty(draft(), { caption: 'A different caption' })).toBe(true);
  });

  it('detects a newly selected photo', () => {
    const file = new File(['photo'], 'replacement.jpg', {
      type: 'image/jpeg',
    });

    expect(
      isDirty(draft(), {
        pendingPhotoFile: file,
      }),
    ).toBe(true);
  });

  it('detects removing the existing photo', () => {
    expect(
      isDirty(draft(), {
        removePhoto: true,
      }),
    ).toBe(true);
  });

  it('returns clean again when a changed field is restored', () => {
    const changed = {
      ...draft(),
      title: 'Different title',
    };

    expect(isDirty(changed)).toBe(true);
    expect(isDirty({ ...changed, title: entry().title })).toBe(false);
  });
});

describe('Entry dirty-state normalization', () => {

  it('treats a different existing photo as dirty', () => {
    expect(
      isDirty({
        ...draft(),
        photo: {
          url: 'https://example.com/different-photo.jpg',
          storagePath: 'journeys/journey-1/entries/entry-1/different-photo.jpg',
          caption: 'Sunset',
        },
      }),
    ).toBe(true);
  });
});
