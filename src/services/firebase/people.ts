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
import type { MemoryPerson, Person } from '../../types/domain';
import {
  buildLegacyPeopleMigrationPlan,
  type LegacyPeopleMemoryRow,
} from './peopleMigration';

export interface PeopleMigrationResult {
  profilesCreated: number;
  profilesUpdated: number;
  associationsAdded: number;
  memoriesUpdated: number;
  memoriesAlreadyMigrated: number;
}

export interface PeopleMigrationPreview {
  memoriesScanned: number;
  legacyMemoriesFound: number;
  profilesToCreate: number;
  profilesToUpdate: number;
  associationsToAdd: number;
  memoriesAlreadyMigrated: number;
  people: Array<{
    name: string;
    normalizedName: string;
    memoryCount: number;
    action: 'create' | 'reuse';
    existingProfileName?: string;
  }>;
}

/** Loads only the selected Journeys' Memory records. This function performs reads only. */
const loadMigrationInputs = async (
  userId: string,
  journeyIds: string[],
): Promise<{ memories: LegacyPeopleMemoryRow[]; existingProfiles: Person[] }> => {
  if (!userId) throw new Error('A signed-in user is required to migrate People.');

  const memories: LegacyPeopleMemoryRow[] = [];
  for (const journeyId of [...new Set(journeyIds.filter(Boolean))]) {
    const snapshot = await getDocs(collection(db, 'journeys', journeyId, 'entries'));
    for (const item of snapshot.docs) {
      const data = item.data();
      memories.push({
        journeyId,
        entryId: item.id,
        people: data.people,
        peopleRefs: data.peopleRefs,
      });
    }
  }

  const profilesSnapshot = await getDocs(collection(db, 'users', userId, 'people'));
  const existingProfiles = profilesSnapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<Person, 'id'>),
  }));

  return { memories, existingProfiles };
};

/**
 * Read-only preview. It reads the selected Journeys and the user's People collection,
 * builds the exact migration plan, and returns counts. It does not write to Firestore.
 */
export const previewLegacyPeopleMigrationForJourneys = async (
  userId: string,
  journeyIds: string[],
): Promise<PeopleMigrationPreview> => {
  const { memories, existingProfiles } = await loadMigrationInputs(userId, journeyIds);
  const plan = buildLegacyPeopleMigrationPlan(userId, memories, existingProfiles);

  const legacyMemoriesFound = memories.filter((memory) =>
    Array.isArray(memory.people)
    && memory.people.some((name) => typeof name === 'string' && name.trim().length > 0),
  ).length;

  const peopleByName = new Map<string, { name: string; normalizedName: string; memoryIds: Set<string> }>();
  for (const memory of memories) {
    if (!Array.isArray(memory.people)) continue;
    for (const rawName of memory.people) {
      if (typeof rawName !== 'string') continue;
      const name = rawName.trim().replace(/\s+/g, ' ');
      const normalizedName = name.toLowerCase();
      if (!normalizedName) continue;
      const current = peopleByName.get(normalizedName) ?? {
        name,
        normalizedName,
        memoryIds: new Set<string>(),
      };
      current.memoryIds.add(`${memory.journeyId}/${memory.entryId}`);
      peopleByName.set(normalizedName, current);
    }
  }

  const existingByName = new Map<string, Person[]>();
  for (const profile of existingProfiles) {
    const normalizedName = (profile.normalizedName || profile.name)
      .trim().replace(/\s+/g, ' ').toLowerCase();
    const matches = existingByName.get(normalizedName) ?? [];
    matches.push(profile);
    existingByName.set(normalizedName, matches);
  }

  const people = [...peopleByName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((person) => {
      const matches = existingByName.get(person.normalizedName) ?? [];
      if (matches.length > 1) {
        throw new Error(`More than one existing Person profile matches "${person.name}". Resolve the duplicate profiles before migration.`);
      }
      return {
        name: person.name,
        normalizedName: person.normalizedName,
        memoryCount: person.memoryIds.size,
        action: matches.length === 1 ? 'reuse' as const : 'create' as const,
        ...(matches.length === 1 ? { existingProfileName: matches[0].name } : {}),
      };
    });

  return {
    memoriesScanned: memories.length,
    legacyMemoriesFound,
    profilesToCreate: plan.profilesToCreate.length,
    profilesToUpdate: plan.profilesToUpdate.length,
    associationsToAdd: plan.memoryUpdates.reduce((total, update) => {
      const source = memories.find(
        (memory) => memory.journeyId === update.journeyId && memory.entryId === update.entryId,
      );
      const existingCount = Array.isArray(source?.peopleRefs) ? source.peopleRefs.length : 0;
      return total + Math.max(0, update.peopleRefs.length - existingCount);
    }, 0),
    memoriesAlreadyMigrated: plan.memoriesAlreadyMigrated,
    people,
  };
};

/**
 * Explicit migration. Never called automatically during app startup.
 * Profile writes are transactional and create-only where possible. Memory references
 * are merged transactionally, preserving references added since the initial read.
 */
export const migrateLegacyPeopleForJourneys = async (
  userId: string,
  journeyIds: string[],
): Promise<PeopleMigrationResult> => {
  const { memories, existingProfiles } = await loadMigrationInputs(userId, journeyIds);
  const plan = buildLegacyPeopleMigrationPlan(userId, memories, existingProfiles);

  const result: PeopleMigrationResult = {
    profilesCreated: 0,
    profilesUpdated: 0,
    associationsAdded: 0,
    memoriesUpdated: 0,
    memoriesAlreadyMigrated: plan.memoriesAlreadyMigrated,
  };

  for (const profile of plan.profilesToCreate) {
    const profileRef = doc(db, 'users', userId, 'people', profile.id);
    const created = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(profileRef);
      if (!snapshot.exists()) {
        transaction.set(profileRef, {
          ownerId: userId,
          name: profile.name,
          normalizedName: profile.normalizedName,
          aliases: profile.aliases,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return true;
      }

      const current = snapshot.data();
      if (current.ownerId !== userId || current.normalizedName !== profile.normalizedName) {
        throw new Error(
          `Person profile conflict for "${profile.name}". No data was overwritten.`,
        );
      }

      const aliases = new Set<string>(
        Array.isArray(current.aliases) ? current.aliases.filter(
          (alias): alias is string => typeof alias === 'string',
        ) : [],
      );
      profile.aliases.forEach((alias) => aliases.add(alias));
      aliases.delete(typeof current.name === 'string' ? current.name : profile.name);
      const mergedAliases = [...aliases].sort((a, b) => a.localeCompare(b));

      if (JSON.stringify(mergedAliases) !== JSON.stringify(current.aliases ?? [])) {
        transaction.update(profileRef, {
          aliases: mergedAliases,
          updatedAt: serverTimestamp(),
        });
      }
      return false;
    });
    if (created) result.profilesCreated += 1;
    else result.profilesUpdated += 1;
  }

  for (const profile of plan.profilesToUpdate) {
    const profileRef = doc(db, 'users', userId, 'people', profile.id);
    const updated = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(profileRef);
      if (!snapshot.exists()) {
        throw new Error(`Person profile "${profile.name}" disappeared during migration. Rerun after reviewing.`);
      }

      const current = snapshot.data();
      if (current.ownerId !== userId || current.normalizedName !== profile.normalizedName) {
        throw new Error(
          `Person profile conflict for "${profile.name}". No data was overwritten.`,
        );
      }

      const aliases = new Set<string>(
        Array.isArray(current.aliases) ? current.aliases.filter(
          (alias): alias is string => typeof alias === 'string',
        ) : [],
      );
      profile.aliases.forEach((alias) => aliases.add(alias));
      aliases.delete(typeof current.name === 'string' ? current.name : profile.name);
      const mergedAliases = [...aliases].sort((a, b) => a.localeCompare(b));

      if (JSON.stringify(mergedAliases) === JSON.stringify(current.aliases ?? [])) return false;
      transaction.update(profileRef, {
        aliases: mergedAliases,
        updatedAt: serverTimestamp(),
      });
      return true;
    });
    if (updated) result.profilesUpdated += 1;
  }

  for (const memory of plan.memoryUpdates) {
    const memoryRef = doc(db, 'journeys', memory.journeyId, 'entries', memory.entryId);
    const added = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(memoryRef);
      if (!snapshot.exists()) return 0;

      const data = snapshot.data();
      const current = Array.isArray(data.peopleRefs)
        ? data.peopleRefs as MemoryPerson[]
        : [];
      const present = new Set(current.map((item) => `${item.ownerId}:${item.personId}`));
      const additions = memory.peopleRefs.filter(
        (item) => !present.has(`${item.ownerId}:${item.personId}`),
      );

      if (additions.length === 0) return 0;
      if (current.length + additions.length > 100) {
        throw new Error(
          `Memory "${memory.entryId}" would exceed the 100-person association limit. No references were written to that Memory.`,
        );
      }

      transaction.update(memoryRef, {
        peopleRefs: [...current, ...additions],
        updatedAt: serverTimestamp(),
      });
      return additions.length;
    });

    if (added > 0) {
      result.associationsAdded += added;
      result.memoriesUpdated += 1;
    } else {
      result.memoriesAlreadyMigrated += 1;
    }
  }

  return result;
};


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
