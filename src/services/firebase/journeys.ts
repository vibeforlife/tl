import {
  deleteField,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';
import type {
  Journey,
  JourneyMember,
  JourneyPhoto,
  JourneyRole,
} from '../../types/domain';

export type CreateJourneyInput = {
  name: string;
  place: string;
  startDate: string;
  endDate: string;
};

export const validateJourneyInput = (input: CreateJourneyInput): string | null => {
  if (!input.name.trim()) return 'Please enter a journey name.';
  if (!input.place.trim()) return 'Please enter a place.';
  if (!input.startDate) return 'Please choose a start date.';
  if (!input.endDate) return 'Please choose an end date.';
  if (input.endDate < input.startDate) return 'End date cannot be before the start date.';
  return null;
};

const journeysCollection = () => collection(db, 'journeys');

const mapJourney = (id: string, data: DocumentData): Journey => ({
  id,
  name: data.name as string,
  place: data.place as string,
  startDate: data.startDate as string,
  endDate: data.endDate as string,
  ...(data.anchorPhoto
    ? {
        anchorPhoto: {
          url: data.anchorPhoto.url as string,
          storagePath: data.anchorPhoto.storagePath as string,
        },
      }
    : {}),
  ...(data.googlePhotosUrl
    ? { googlePhotosUrl: data.googlePhotosUrl as string }
    : {}),
  createdBy: data.createdBy as string,
  createdAt: data.createdAt as Timestamp,
  updatedAt: data.updatedAt as Timestamp,
});

export const createJourney = async (
  user: { uid: string; email: string | null },
  input: CreateJourneyInput,
): Promise<string> => {
  const validationError = validateJourneyInput(input);
  if (validationError) throw new Error(validationError);
  if (!user.email) throw new Error('Your account does not have an email address.');

  const batch = writeBatch(db);
  const journeyRef = doc(journeysCollection());
  const memberRef = doc(db, 'journeys', journeyRef.id, 'members', user.uid);
  const userJourneyRef = doc(db, 'users', user.uid, 'journeys', journeyRef.id);

  batch.set(journeyRef, {
    name: input.name.trim(),
    place: input.place.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const member: JourneyMember = {
    uid: user.uid,
    email: user.email.toLowerCase(),
    role: 'owner',
    joinedAt: serverTimestamp() as unknown as Timestamp,
  };
  batch.set(memberRef, member);

  batch.set(userJourneyRef, {
    role: 'owner' satisfies JourneyRole,
    joinedAt: serverTimestamp(),
  });

  await batch.commit();
  return journeyRef.id;
};

export const updateJourneyAnchorPhoto = async (
  journeyId: string,
  anchorPhoto: JourneyPhoto,
): Promise<void> => {
  await updateDoc(doc(db, 'journeys', journeyId), {
    anchorPhoto,
    updatedAt: serverTimestamp(),
  });
};

export const clearJourneyAnchorPhoto = async (
  journeyId: string,
): Promise<void> => {
  await updateDoc(doc(db, 'journeys', journeyId), {
    anchorPhoto: deleteField(),
    updatedAt: serverTimestamp(),
  });
};

export const listMyJourneys = async (userId: string): Promise<Journey[]> => {
  const indexRef = collection(db, 'users', userId, 'journeys');
  const snapshot = await getDocs(query(indexRef, orderBy('joinedAt', 'desc')));

  const journeys = await Promise.all(
    snapshot.docs.map(async (membershipDoc) => {
      const journeySnapshot = await getDoc(doc(db, 'journeys', membershipDoc.id));
      return journeySnapshot.exists() ? mapJourney(journeySnapshot.id, journeySnapshot.data()) : null;
    }),
  );

  return journeys.filter((journey): journey is Journey => journey !== null);
};

export const getJourneyMember = async (
  journeyId: string,
  userId: string,
): Promise<JourneyMember | null> => {
  const memberSnapshot = await getDoc(
    doc(db, 'journeys', journeyId, 'members', userId),
  );

  if (!memberSnapshot.exists()) {
    return null;
  }

  const data = memberSnapshot.data();

  return {
    uid: data.uid as string,
    email: data.email as string,
    role: data.role as JourneyRole,
    joinedAt: data.joinedAt as Timestamp,
    ...(data.invitationId
      ? { invitationId: data.invitationId as string }
      : {}),
  };
};

export type UpdateJourneyInput = CreateJourneyInput;

export const updateJourney = async (
  journeyId: string,
  input: UpdateJourneyInput,
): Promise<void> => {
  const validationError = validateJourneyInput(input);

  if (validationError) {
    throw new Error(validationError);
  }

  await updateDoc(doc(db, 'journeys', journeyId), {
    name: input.name.trim(),
    place: input.place.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    updatedAt: serverTimestamp(),
  });
};

const commitDeleteChunks = async (
  refs: ReturnType<typeof doc>[],
): Promise<void> => {
  const chunkSize = 450;

  for (let index = 0; index < refs.length; index += chunkSize) {
    const batch = writeBatch(db);

    refs.slice(index, index + chunkSize).forEach((ref) => {
      batch.delete(ref);
    });

    await batch.commit();
  }
};

export const deleteJourney = async (
  journeyId: string,
): Promise<void> => {
  const membersSnapshot = await getDocs(
    collection(db, 'journeys', journeyId, 'members'),
  );

  const entriesSnapshot = await getDocs(
    collection(db, 'journeys', journeyId, 'entries'),
  );

  const memberIds = membersSnapshot.docs.map((memberDoc) => {
    const data = memberDoc.data();
    return (data.uid as string | undefined) || memberDoc.id;
  });

  /*
   * Delete the user-side journey indexes first.
   *
   * This is deliberately done before deleting the member documents because
   * the Firestore rule authorizes these deletes by checking Journey ownership
   * through the member document.
   */
  const userJourneyRefs = memberIds.map((userId) =>
    doc(db, 'users', userId, 'journeys', journeyId),
  );

  /*
   * Keep membership intact while deleting entries because the entry
   * security rule authorizes deletion through Journey membership.
   */
  await commitDeleteChunks(userJourneyRefs);

  const entryRefs = entriesSnapshot.docs.map((entryDoc) => entryDoc.ref);
  await commitDeleteChunks(entryRefs);

  const memberRefs = membersSnapshot.docs.map((memberDoc) => memberDoc.ref);
  await commitDeleteChunks(memberRefs);

  await deleteDoc(doc(db, 'journeys', journeyId));
};
