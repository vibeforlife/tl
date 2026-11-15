import {
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';

import type {
  ReliveConfiguration,
  ReliveDurationMode,
  ReliveSelectionMode,
} from '../../types/domain';
import { db } from './firestore';

const DEFAULT_RELIVE_ID = 'default';
const SCHEMA_VERSION = 1 as const;

const reliveRef = (journeyId: string) =>
  doc(db, 'journeys', journeyId, 'relives', DEFAULT_RELIVE_ID);

const isDurationMode = (value: unknown): value is ReliveDurationMode =>
  value === 'highlights' || value === 'journey' || value === 'complete';

const isSelectionMode = (value: unknown): value is ReliveSelectionMode =>
  value === 'automatic' || value === 'curated';

const mapRelive = (
  journeyId: string,
  data: DocumentData,
): ReliveConfiguration => ({
  id: DEFAULT_RELIVE_ID,
  journeyId,
  ownerId: data.ownerId as string,
  title: typeof data.title === 'string' ? data.title : '',
  schemaVersion: SCHEMA_VERSION,
  selectionMode: isSelectionMode(data.selectionMode)
    ? data.selectionMode
    : 'automatic',
  selectedEntryIds: Array.isArray(data.selectedEntryIds)
    ? data.selectedEntryIds.filter((id: unknown): id is string => typeof id === 'string')
    : [],
  durationMode: isDurationMode(data.durationMode)
    ? data.durationMode
    : 'journey',
  musicEnabled: data.musicEnabled === true,
  ...(typeof data.soundtrackId === 'string'
    ? { soundtrackId: data.soundtrackId }
    : {}),
  chapterMode: 'automatic',
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

export const getOrCreateJourneyRelive = async (
  journeyId: string,
  ownerId: string,
  journeyName: string,
): Promise<ReliveConfiguration> => {
  const reference = reliveRef(journeyId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (snapshot.exists()) {
      const configuration = mapRelive(journeyId, snapshot.data());
      if (configuration.ownerId !== ownerId) {
        throw new Error('Only the Journey owner can manage this Relive.');
      }
      return configuration;
    }

    const initialData = {
      ownerId,
      title: journeyName,
      schemaVersion: SCHEMA_VERSION,
      selectionMode: 'automatic' satisfies ReliveSelectionMode,
      selectedEntryIds: [],
      durationMode: 'journey' satisfies ReliveDurationMode,
      musicEnabled: false,
      chapterMode: 'automatic',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    transaction.set(reference, initialData);

    return {
      id: DEFAULT_RELIVE_ID,
      journeyId,
      ownerId,
      title: journeyName,
      schemaVersion: SCHEMA_VERSION,
      selectionMode: 'automatic',
      selectedEntryIds: [],
      durationMode: 'journey',
      musicEnabled: false,
      chapterMode: 'automatic',
    };
  });
};

export const saveJourneyRelive = async (
  configuration: ReliveConfiguration,
): Promise<void> => {
  if (!configuration.journeyId.trim() || !configuration.ownerId.trim()) {
    throw new Error('The Relive is missing its Journey or owner.');
  }

  if (!configuration.title.trim()) {
    throw new Error('Please enter a title for this Relive.');
  }

  if (configuration.title.trim().length > 100) {
    throw new Error('The Relive title must be 100 characters or fewer.');
  }

  if (!isDurationMode(configuration.durationMode)) {
    throw new Error('Choose a valid Relive duration.');
  }

  if (!isSelectionMode(configuration.selectionMode)) {
    throw new Error('Choose a valid Memory selection mode.');
  }

  const selectedEntryIds = Array.from(
    new Set(configuration.selectedEntryIds.map((id) => id.trim()).filter(Boolean)),
  );

  if (configuration.selectionMode === 'curated' && selectedEntryIds.length === 0) {
    throw new Error('Select at least one Memory for your curated Relive.');
  }

  await updateDoc(reliveRef(configuration.journeyId), {
    title: configuration.title.trim(),
    schemaVersion: SCHEMA_VERSION,
    selectionMode: configuration.selectionMode,
    selectedEntryIds:
      configuration.selectionMode === 'curated' ? selectedEntryIds : [],
    durationMode: configuration.durationMode,
    musicEnabled: configuration.musicEnabled,
    chapterMode: 'automatic',
    updatedAt: serverTimestamp(),
  });
};
