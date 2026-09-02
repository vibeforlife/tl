import { describe, expect, it } from 'vitest';

import {
  buildEntryDocument,
  validateEntryInput,
  type CreateEntryInput,
} from '../src/services/firebase/entries';

const validEntry = (): CreateEntryInput => ({
  title: 'Sunset in Oia',
  date: '2026-09-01',
  time: '19:30',
  story: 'The sunset was unforgettable.',
  highlight: 'The best sunset of the trip.',
  rating: 5,
  people: ['Sarah', 'Ahmed'],
  memoryType: 'moment',
  tags: ['sunset', 'family'],
  location: {
    name: 'Oia, Santorini',
    address: 'Oia, Greece',
    latitude: 36.4618,
    longitude: 25.3753,
    mapboxPlaceId: 'test-mapbox-id',
  },
  photos: [
    {
      url: 'https://photos.google.com/example',
      caption: 'Sunset',
    },
  ],
  costs: [
    {
      category: 'ride',
      amount: 25,
      currency: 'EUR',
    },
  ],
});

describe('Entry validation', () => {
  it('requires title, date, and story', () => {
    expect(validateEntryInput({ ...validEntry(), title: '' })).toBe(
      'Please enter an entry title.',
    );

    expect(validateEntryInput({ ...validEntry(), date: '' })).toBe(
      'Please choose an entry date.',
    );

    expect(validateEntryInput({ ...validEntry(), story: '' })).toBe(
      'Please write the story you want to remember.',
    );
  });

  it('accepts a valid Entry', () => {
    expect(validateEntryInput(validEntry())).toBeNull();
  });

  it('validates ratings', () => {
    expect(validateEntryInput({ ...validEntry(), rating: 6 })).toBe(
      'Rating must be between 1 and 5 stars.',
    );
  });

  it('validates coordinates', () => {
    expect(
      validateEntryInput({
        ...validEntry(),
        location: {
          ...validEntry().location!,
          latitude: 100,
        },
      }),
    ).toBe('Latitude must be between -90 and 90.');
  });

  it('validates cost currency and amount', () => {
    expect(
      validateEntryInput({
        ...validEntry(),
        costs: [{ category: 'food', amount: 0, currency: 'EUR' }],
      }),
    ).toBe('Each cost must have an amount greater than zero.');

    expect(
      validateEntryInput({
        ...validEntry(),
        costs: [{ category: 'food', amount: 20, currency: 'EU' }],
      }),
    ).toBe(
      'Currency must be a three-letter code such as CAD, USD, or EUR.',
    );
  });

  it('validates photo URLs', () => {
    expect(
      validateEntryInput({
        ...validEntry(),
        photos: [{ url: 'not-a-url' }],
      }),
    ).toBe('Each photo link must be a valid URL.');
  });
});

describe('Entry Firestore serialization', () => {
  it('omits undefined optional nested fields before writing to Firestore', () => {
    const input: CreateEntryInput = {
      ...validEntry(),
      location: {
        name: 'Eiffel Tower',
        address: undefined,
        latitude: 48.8584,
        longitude: 2.2945,
        mapboxPlaceId: undefined,
      },
      photos: [
        {
          url: 'https://photos.google.com/example',
          caption: undefined,
        },
      ],
    };

    const document = buildEntryDocument('user-123', input);

    expect(document.location).toEqual({
      name: 'Eiffel Tower',
      latitude: 48.8584,
      longitude: 2.2945,
    });

    expect(document.photos).toEqual([
      {
        url: 'https://photos.google.com/example',
      },
    ]);
  });

  it('preserves legitimate zero values', () => {
    const input: CreateEntryInput = {
      ...validEntry(),
      location: {
        name: 'Equator',
        latitude: 0,
        longitude: 0,
      },
      costs: [
        {
          category: 'ride',
          amount: 0.01,
          currency: 'USD',
        },
      ],
    };

    const document = buildEntryDocument('user-123', input);

    expect(document.location).toEqual({
      name: 'Equator',
      latitude: 0,
      longitude: 0,
    });

    expect(document.costs).toEqual([
      {
        category: 'ride',
        amount: 0.01,
        currency: 'USD',
      },
    ]);
  });
});
