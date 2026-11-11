import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from './firestore';
import { listMyJourneys } from './journeys';
import type { Person } from '../../types/domain';

/**
 * Loads the signed-in user's private People directory.
 * Profiles are returned alphabetically and ownership is checked.
 */
export const listMyPeople = async (userId: string): Promise<Person[]> => {
  if (!userId) throw new Error('A signed-in user is required.');

  const snapshot = await getDocs(collection(db, 'users', userId, 'people'));

  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<Person, 'id'>),
    }))
    .filter((person) => person.ownerId === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export interface PersonProfileInput { name: string; aliases: string[]; notes?: string; }

export const normalizeDirectoryPersonName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const cleanDirectoryAliases = (aliases: string[], normalizedName: string): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of aliases) {
    const alias = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeDirectoryPersonName(alias);
    if (!key || key === normalizedName || seen.has(key)) continue;
    seen.add(key);
    output.push(alias);
  }
  return output;
};

const assertNoDuplicatePersonName = (
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
  normalizedName: string,
  exceptId?: string,
): void => {
  const duplicate = docs.some((item) => {
    if (item.id === exceptId) return false;
    const data = item.data();
    if (typeof data.ownerId !== 'string') return false;
    const existingName = typeof data.normalizedName === 'string'
      ? data.normalizedName
      : typeof data.name === 'string' ? normalizeDirectoryPersonName(data.name) : '';
    return existingName === normalizedName;
  });
  if (duplicate) throw new Error('A person with this name already exists. Open the existing profile to edit it.');
};

export const createPersonProfile = async (userId: string, input: PersonProfileInput): Promise<string> => {
  if (!userId) throw new Error('A signed-in user is required.');
  const name = input.name.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeDirectoryPersonName(name);
  if (!normalizedName) throw new Error('Enter a name for this person.');

  const peopleRef = collection(db, 'users', userId, 'people');
  const existing = await getDocs(peopleRef);
  assertNoDuplicatePersonName(existing.docs, normalizedName);
  const profileRef = doc(peopleRef);
  await runTransaction(db, async (transaction) => {
    const target = await transaction.get(profileRef);
    if (target.exists()) {
      throw new Error('Could not create a unique profile ID. Please try again.');
    }
    transaction.set(profileRef, {
      ownerId: userId,
      name,
      normalizedName,
      aliases: cleanDirectoryAliases(input.aliases, normalizedName),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return profileRef.id;
};

export const updatePersonProfile = async (userId: string, personId: string, input: PersonProfileInput): Promise<void> => {
  if (!userId || !personId) throw new Error('A signed-in user and profile are required.');
  const name = input.name.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeDirectoryPersonName(name);
  if (!normalizedName) throw new Error('Enter a name for this person.');

  const peopleRef = collection(db, 'users', userId, 'people');
  const existing = await getDocs(peopleRef);
  assertNoDuplicatePersonName(existing.docs, normalizedName, personId);
  const profileRef = doc(db, 'users', userId, 'people', personId);
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(profileRef);
    if (!current.exists() || current.data().ownerId !== userId) {
      throw new Error('This person profile could not be found.');
    }
    transaction.update(profileRef, {
      name,
      normalizedName,
      aliases: cleanDirectoryAliases(input.aliases, normalizedName),
      notes: input.notes?.trim() || deleteField(),
      updatedAt: serverTimestamp(),
    });
  });

  // Memory references keep a displayName snapshot. Refresh those snapshots
  // after the profile update. Re-saving retries a partially completed sweep.
  await refreshPersonMemoryReferences(userId, personId, name);
};

const refreshPersonMemoryReferences = async (
  userId: string,
  personId: string,
  displayName: string,
): Promise<void> => {
  const journeys = await listMyJourneys(userId);

  for (const journey of journeys) {
    const entriesRef = collection(db, 'journeys', journey.id, 'entries');
    const entriesSnapshot = await getDocs(entriesRef);

    for (const entrySnapshot of entriesSnapshot.docs) {
      const data = entrySnapshot.data();
      const refs = Array.isArray(data.peopleRefs) ? data.peopleRefs : [];
      const hasTarget = refs.some(
        (ref) => ref && ref.personId === personId && ref.ownerId === userId,
      );
      if (!hasTarget) continue;

      const memoryRef = doc(db, 'journeys', journey.id, 'entries', entrySnapshot.id);
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(memoryRef);
        if (!current.exists()) return;

        const currentData = current.data();
        const currentRefs = Array.isArray(currentData.peopleRefs) ? currentData.peopleRefs : [];
        let changed = false;
        const nextRefs = currentRefs.map((ref) => {
          if (!ref || ref.personId !== personId || ref.ownerId !== userId || ref.displayName === displayName) {
            return ref;
          }
          changed = true;
          return { ...ref, displayName };
        });

        if (changed) {
          transaction.update(memoryRef, {
            peopleRefs: nextRefs,
            updatedAt: serverTimestamp(),
          });
        }
      });
    }
  }
};


/**
 * Deletes a Person profile and removes its references from all of the
 * signed-in user's Journeys. The profile is retained if any cleanup fails.
 *
 * Cleanup is retry-safe: already-removed references are simply skipped.
 */
export const deletePersonProfile = async (
  userId: string,
  personId: string,
): Promise<void> => {
  if (!userId || !personId) {
    throw new Error('A signed-in user and Person profile are required.');
  }

  const personRef = doc(db, 'users', userId, 'people', personId);
  const personSnapshot = await getDoc(personRef);

  if (!personSnapshot.exists() || personSnapshot.data().ownerId !== userId) {
    throw new Error('This Person profile could not be found.');
  }

  const journeys = await listMyJourneys(userId);

  for (const journey of journeys) {
    const entriesRef = collection(db, 'journeys', journey.id, 'entries');
    const entriesSnapshot = await getDocs(entriesRef);

    for (const entrySnapshot of entriesSnapshot.docs) {
      const data = entrySnapshot.data();
      const refs = Array.isArray(data.peopleRefs) ? data.peopleRefs : [];

      const hasTarget = refs.some(
        (ref) =>
          ref &&
          ref.personId === personId &&
          ref.ownerId === userId,
      );

      if (!hasTarget) continue;

      const memoryRef = doc(
        db,
        'journeys',
        journey.id,
        'entries',
        entrySnapshot.id,
      );

      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(memoryRef);
        if (!current.exists()) return;

        const currentData = current.data();
        const currentRefs = Array.isArray(currentData.peopleRefs)
          ? currentData.peopleRefs
          : [];

        const remainingRefs = currentRefs.filter(
          (ref) =>
            !(
              ref &&
              ref.personId === personId &&
              ref.ownerId === userId
            ),
        );

        if (remainingRefs.length === currentRefs.length) return;

        transaction.update(memoryRef, {
          peopleRefs: remainingRefs,
          updatedAt: serverTimestamp(),
        });
      });
    }
  }

  // Final ownership check protects against deleting a replaced or changed record.
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(personRef);

    if (!current.exists() || current.data().ownerId !== userId) {
      throw new Error('The Person profile changed or could not be found. Please refresh and retry.');
    }

    transaction.delete(personRef);
  });
};
