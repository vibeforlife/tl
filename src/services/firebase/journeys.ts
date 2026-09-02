import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';
import type { Journey, JourneyMember, JourneyRole } from '../../types/domain';

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
