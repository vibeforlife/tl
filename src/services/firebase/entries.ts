import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';

import { db } from './firestore';
import type {
  Entry,
  EntryCost,
  EntryLocation,
  EntryPhoto,
  MemoryType,
} from '../../types/domain';

export type CreateEntryInput = {
  title: string;
  date: string;
  time: string;
  story: string;
  highlight: string;
  rating: number | undefined;
  people: string[];
  memoryType: MemoryType | '';
  tags: string[];
  location: EntryLocation | undefined;
  photo?: EntryPhoto;
  costs: EntryCost[];
};

export const validateEntryInput = (input: CreateEntryInput): string | null => {
  if (!input.title.trim()) return 'Please enter an entry title.';
  if (!input.date) return 'Please choose an entry date.';
  if (!input.story.trim()) return 'Please write the story you want to remember.';

  if (
    input.rating !== undefined &&
    (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
  ) {
    return 'Rating must be between 1 and 5 stars.';
  }

  if (input.location) {
    const { latitude, longitude } = input.location;

    if (!input.location.name.trim()) {
      return 'Please enter a location name.';
    }

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return 'Latitude must be between -90 and 90.';
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return 'Longitude must be between -180 and 180.';
    }
  }

  for (const cost of input.costs) {
    if (!Number.isFinite(cost.amount) || cost.amount <= 0) {
      return 'Each cost must have an amount greater than zero.';
    }

    if (!/^[A-Z]{3}$/.test(cost.currency)) {
      return 'Currency must be a three-letter code such as CAD, USD, or EUR.';
    }
  }

  if (input.photo) {
    if (!input.photo.url.trim()) {
      return 'Photo URL cannot be empty.';
    }
    if (!input.photo.storagePath.trim()) {
      return 'Photo storage path cannot be empty.';
    }
    try {
      new URL(input.photo.url);
    } catch {
      return 'Each photo URL must be valid.';
    }
  }

  return null;
};

export const buildEntryDocument = (
  userId: string,
  input: CreateEntryInput,
) => {
  const location = input.location
    ? {
        name: input.location.name.trim(),
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        ...(input.location.address?.trim()
          ? { address: input.location.address.trim() }
          : {}),
        ...(input.location.mapboxPlaceId?.trim()
          ? { mapboxPlaceId: input.location.mapboxPlaceId.trim() }
          : {}),
      }
    : undefined;

  const photo = input.photo?.url.trim()
    ? {
        url: input.photo.url.trim(),
        storagePath: input.photo.storagePath.trim(),
        ...(input.photo.caption?.trim()
          ? { caption: input.photo.caption.trim() }
          : {}),
      }
    : undefined;

  const costs = input.costs.map((cost) => ({
    category: cost.category,
    amount: cost.amount,
    currency: cost.currency.toUpperCase(),
  }));

  return {
    title: input.title.trim(),
    date: input.date,
    ...(input.time ? { time: input.time } : {}),
    story: input.story.trim(),
    ...(input.highlight.trim() ? { highlight: input.highlight.trim() } : {}),
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    people: input.people.map((person) => person.trim()).filter(Boolean),
    ...(input.memoryType ? { memoryType: input.memoryType } : {}),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    ...(location ? { location } : {}),
    ...(photo ? { photo } : {}),
    costs,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
};

const mapEntry = (id: string, journeyId: string, data: DocumentData): Entry => ({
  id,
  journeyId,
  title: data.title as string,
  date: data.date as string,
  time: data.time as string | undefined,
  story: data.story as string,
  highlight: data.highlight as string | undefined,
  rating:
    typeof data.rating === 'number' ? data.rating : undefined,
  people: Array.isArray(data.people) ? data.people as string[] : [],
  memoryType: data.memoryType as MemoryType | undefined,
  tags: Array.isArray(data.tags) ? data.tags as string[] : [],
  location: data.location as EntryLocation | undefined,
  photo: data.photo as EntryPhoto | undefined,
  costs: Array.isArray(data.costs) ? data.costs as EntryCost[] : [],
  createdBy: data.createdBy as string,
  createdAt: data.createdAt as Timestamp,
  updatedAt: data.updatedAt as Timestamp,
});

export const createEntry = async (
  userId: string,
  journeyId: string,
  input: CreateEntryInput,
): Promise<string> => {
  const validationError = validateEntryInput(input);

  if (validationError) {
    throw new Error(validationError);
  }

  const entryRef = await addDoc(
    collection(db, 'journeys', journeyId, 'entries'),
    buildEntryDocument(userId, input),
  );

  return entryRef.id;
};

export const listJourneyEntries = async (journeyId: string): Promise<Entry[]> => {
  const entriesRef = collection(db, 'journeys', journeyId, 'entries');

  const snapshot = await getDocs(
    query(entriesRef, orderBy('date', 'desc')),
  );

  return snapshot.docs.map((entryDoc) =>
    mapEntry(entryDoc.id, journeyId, entryDoc.data()),
  );
};


export type UpdateEntryInput = CreateEntryInput;

const buildEntryUpdate = (input: UpdateEntryInput) => {
  const location = input.location
    ? {
        name: input.location.name.trim(),
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        ...(input.location.address?.trim()
          ? { address: input.location.address.trim() }
          : {}),
        ...(input.location.mapboxPlaceId?.trim()
          ? { mapboxPlaceId: input.location.mapboxPlaceId.trim() }
          : {}),
      }
    : undefined;

  const photo = input.photo?.url.trim()
    ? {
        url: input.photo.url.trim(),
        storagePath: input.photo.storagePath.trim(),
        ...(input.photo.caption?.trim()
          ? { caption: input.photo.caption.trim() }
          : {}),
      }
    : undefined;

  const costs = input.costs.map((cost) => ({
    category: cost.category,
    amount: cost.amount,
    currency: cost.currency.toUpperCase(),
  }));

  return {
    title: input.title.trim(),
    date: input.date,
    time: input.time || '',
    story: input.story.trim(),
    highlight: input.highlight.trim(),
    rating: input.rating ?? null,
    people: input.people.map((person) => person.trim()).filter(Boolean),
    memoryType: input.memoryType || null,
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    location: location ?? null,
    photo: photo ?? null,
    costs,
    updatedAt: serverTimestamp(),
  };
};

export const updateEntry = async (
  journeyId: string,
  entryId: string,
  input: UpdateEntryInput,
): Promise<void> => {
  const validationError = validateEntryInput(input);

  if (validationError) {
    throw new Error(validationError);
  }

  await updateDoc(
    doc(db, 'journeys', journeyId, 'entries', entryId),
    buildEntryUpdate(input),
  );
};

export const deleteEntry = async (
  journeyId: string,
  entryId: string,
): Promise<void> => {
  await deleteDoc(
    doc(db, 'journeys', journeyId, 'entries', entryId),
  );
};
