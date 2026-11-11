import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  serverTimestamp: vi.fn(() => ({
    __testType: 'serverTimestamp',
  })),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
}));

vi.mock('../src/services/firebase/firestore', () => ({
  db: { __testDb: true },
}));

import {
  createEntry,
  deleteEntry,
  updateEntry,
  type CreateEntryInput,
} from '../src/services/firebase/entries';

const validEntry = (): CreateEntryInput => ({
  title: 'Sunset in Oia',
  date: '2026-09-01',
  time: '19:30',
  story: 'The sunset was unforgettable.',
  highlight: 'The best sunset of the trip.',
  rating: 5,
  peopleRefs: [
    { personId: 'person-sarah', ownerId: 'user-123', displayName: 'Sarah' },
    { personId: 'person-ahmed', ownerId: 'user-123', displayName: 'Ahmed' },
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

describe('Entry mutation services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addDoc.mockResolvedValue({ id: 'entry-123' });
    updateDoc.mockResolvedValue(undefined);
    deleteDoc.mockResolvedValue(undefined);
  });

  describe('createEntry', () => {
    it('writes a valid entry and returns the Firestore document id', async () => {
      const result = await createEntry(
        'user-123',
        'journey-456',
        validEntry(),
      );

      expect(result).toBe('entry-123');

      expect(collection).toHaveBeenCalledWith(
        { __testDb: true },
        'journeys',
        'journey-456',
        'entries',
      );

      expect(addDoc).toHaveBeenCalledTimes(1);

      const [collectionRef, document] = addDoc.mock.calls[0];

      expect(collectionRef).toEqual({
        path: 'journeys/journey-456/entries',
      });

      expect(document).toMatchObject({
        title: 'Sunset in Oia',
        date: '2026-09-01',
        story: 'The sunset was unforgettable.',
        peopleRefs: [
          { personId: 'person-sarah', ownerId: 'user-123', displayName: 'Sarah' },
          { personId: 'person-ahmed', ownerId: 'user-123', displayName: 'Ahmed' },
        ],
        tags: ['sunset', 'family'],
        createdBy: 'user-123',
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
      expect(document).not.toHaveProperty('people');

      expect(serverTimestamp).toHaveBeenCalledTimes(2);
    });

    it('does not write when validation fails', async () => {
      await expect(
        createEntry('user-123', 'journey-456', {
          ...validEntry(),
          title: '',
        }),
      ).rejects.toThrow('Please enter an entry title.');

      expect(addDoc).not.toHaveBeenCalled();
    });

    it('propagates a Firestore write failure', async () => {
      const firestoreError = new Error('Firestore create failed');
      addDoc.mockRejectedValueOnce(firestoreError);

      await expect(
        createEntry('user-123', 'journey-456', validEntry()),
      ).rejects.toBe(firestoreError);
    });
  });

  describe('updateEntry', () => {
    it('updates the expected Firestore document', async () => {
      await updateEntry(
        'journey-456',
        'entry-789',
        validEntry(),
      );

      expect(doc).toHaveBeenCalledWith(
        { __testDb: true },
        'journeys',
        'journey-456',
        'entries',
        'entry-789',
      );

      expect(updateDoc).toHaveBeenCalledTimes(1);

      const [documentRef, update] = updateDoc.mock.calls[0];

      expect(documentRef).toEqual({
        path: 'journeys/journey-456/entries/entry-789',
      });

      expect(update).toMatchObject({
        title: 'Sunset in Oia',
        date: '2026-09-01',
        story: 'The sunset was unforgettable.',
        peopleRefs: [
          { personId: 'person-sarah', ownerId: 'user-123', displayName: 'Sarah' },
          { personId: 'person-ahmed', ownerId: 'user-123', displayName: 'Ahmed' },
        ],
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
        updatedAt: {
          __testType: 'serverTimestamp',
        },
      });
      expect(update).not.toHaveProperty('people');

      expect(serverTimestamp).toHaveBeenCalledTimes(1);
    });

    it('does not write when validation fails', async () => {
      await expect(
        updateEntry('journey-456', 'entry-789', {
          ...validEntry(),
          title: '',
        }),
      ).rejects.toThrow('Please enter an entry title.');

      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('propagates a Firestore write failure', async () => {
      const firestoreError = new Error('Firestore update failed');
      updateDoc.mockRejectedValueOnce(firestoreError);

      await expect(
        updateEntry('journey-456', 'entry-789', validEntry()),
      ).rejects.toBe(firestoreError);
    });
  });

  describe('deleteEntry', () => {
    it('deletes the expected Firestore document', async () => {
      await deleteEntry('journey-456', 'entry-789');

      expect(doc).toHaveBeenCalledWith(
        { __testDb: true },
        'journeys',
        'journey-456',
        'entries',
        'entry-789',
      );

      expect(deleteDoc).toHaveBeenCalledWith({
        path: 'journeys/journey-456/entries/entry-789',
      });
    });

    it('propagates a Firestore delete failure', async () => {
      const firestoreError = new Error('Firestore delete failed');
      deleteDoc.mockRejectedValueOnce(firestoreError);

      await expect(
        deleteEntry('journey-456', 'entry-789'),
      ).rejects.toBe(firestoreError);
    });
  });
});
