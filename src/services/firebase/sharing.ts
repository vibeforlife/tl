import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth } from './auth';
import { db } from './firestore';
import type { InvitationRole } from '../../types/domain';

export const createJourneyShareLink = async (
  journeyId: string,
  role: InvitationRole,
): Promise<string> => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('You must be signed in to create a sharing link.');
  }

  const token = crypto.randomUUID();

  await setDoc(doc(db, 'invitations', token), {
    journeyId,
    inviterId: user.uid,
    role,
    createdAt: serverTimestamp(),
  });

  return `${window.location.origin}${import.meta.env.BASE_URL}?share=${encodeURIComponent(token)}`;
};
