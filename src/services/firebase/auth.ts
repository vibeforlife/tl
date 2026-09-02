import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { firebaseApp } from './config';

export const auth = getAuth(firebaseApp);

export const signUp = async (email: string, password: string): Promise<User> => {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
};

export const signIn = async (email: string, password: string): Promise<User> => {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

export const subscribeToAuthState = (callback: (user: User | null) => void): (() => void) =>
  onAuthStateChanged(auth, callback);
