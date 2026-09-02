import { initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';

const required = (name: string): string => {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const firebaseConfig: FirebaseOptions = {
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: required('VITE_FIREBASE_APP_ID'),
};

export const firebaseApp = initializeApp(firebaseConfig);
