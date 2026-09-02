#!/bin/bash
set -euo pipefail

if [ ! -f package.json ] || [ ! -f src/app/App.tsx ] || [ ! -f src/services/firebase/auth.ts ]; then
  echo "Error: run this script from the root of the clean Travel Lore V1 project."
  exit 1
fi

if ! grep -q "export const subscribeToAuthState" src/services/firebase/auth.ts; then
  echo "Error: the authentication slice is not present in src/services/firebase/auth.ts."
  echo "Run the authentication patch first."
  exit 1
fi

mkdir -p src/features/journeys

cat > src/services/firebase/journeys.ts <<'EOT'
import {
  collection,
  doc,
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
      const journeySnapshot = await getDocs(
        query(collection(db, 'journeys'), orderBy('updatedAt', 'desc')),
      );
      const journeyDoc = journeySnapshot.docs.find((candidate) => candidate.id === membershipDoc.id);
      return journeyDoc ? mapJourney(journeyDoc.id, journeyDoc.data()) : null;
    }),
  );

  return journeys.filter((journey): journey is Journey => journey !== null);
};
EOT

# Replace the temporary placeholder Firestore module with the actual initialized database export.
cat > src/services/firebase/firestore.ts <<'EOT'
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './config';

export const db = getFirestore(firebaseApp);
EOT

# Replace the inefficient first-pass journey listing with direct document reads.
python3 - <<'PY'
from pathlib import Path
p = Path('src/services/firebase/journeys.ts')
s = p.read_text()
s = s.replace("  getDocs,\n  orderBy,\n  query,\n", "  getDoc,\n  getDocs,\n  orderBy,\n  query,\n")
s = s.replace("  const journeys = await Promise.all(\n    snapshot.docs.map(async (membershipDoc) => {\n      const journeySnapshot = await getDocs(\n        query(collection(db, 'journeys'), orderBy('updatedAt', 'desc')),\n      );\n      const journeyDoc = journeySnapshot.docs.find((candidate) => candidate.id === membershipDoc.id);\n      return journeyDoc ? mapJourney(journeyDoc.id, journeyDoc.data()) : null;\n    }),\n  );", "  const journeys = await Promise.all(\n    snapshot.docs.map(async (membershipDoc) => {\n      const journeySnapshot = await getDoc(doc(db, 'journeys', membershipDoc.id));\n      return journeySnapshot.exists() ? mapJourney(journeySnapshot.id, journeySnapshot.data()) : null;\n    }),\n  );")
p.write_text(s)
PY

cat > src/features/journeys/CreateJourneyForm.tsx <<'EOT'
import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { createJourney, validateJourneyInput, type CreateJourneyInput } from '../../services/firebase/journeys';

export function CreateJourneyForm({ user, onCreated }: { user: User; onCreated: () => Promise<void> | void }) {
  const [form, setForm] = useState<CreateJourneyInput>({ name: '', place: '', startDate: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof CreateJourneyInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validationError = validateJourneyInput(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createJourney(user, form);
      setForm({ name: '', place: '', startDate: '', endDate: '' });
      await onCreated();
    } catch (journeyError) {
      setError(journeyError instanceof Error ? journeyError.message : 'We could not create that journey. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="journey-form" onSubmit={handleSubmit} noValidate>
      <div className="journey-form__heading">
        <p className="eyebrow">NEW JOURNEY</p>
        <h2>Create a journey.</h2>
      </div>

      <label htmlFor="journey-name">Journey name</label>
      <input id="journey-name" value={form.name} onChange={(e) => update('name', e.target.value)} required disabled={isSubmitting} placeholder="Japan 2026" />

      <label htmlFor="journey-place">Place</label>
      <input id="journey-place" value={form.place} onChange={(e) => update('place', e.target.value)} required disabled={isSubmitting} placeholder="Japan" />

      <div className="date-grid">
        <div>
          <label htmlFor="journey-start">Start date</label>
          <input id="journey-start" type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required disabled={isSubmitting} />
        </div>
        <div>
          <label htmlFor="journey-end">End date</label>
          <input id="journey-end" type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} min={form.startDate || undefined} required disabled={isSubmitting} />
        </div>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating journey…' : 'Create Journey'}
      </button>
    </form>
  );
}
EOT

cat > src/features/journeys/JourneyHome.tsx <<'EOT'
import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Journey } from '../../types/domain';
import { listMyJourneys } from '../../services/firebase/journeys';
import { CreateJourneyForm } from './CreateJourneyForm';

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));

export function JourneyHome({ user }: { user: User }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJourneys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setJourneys(await listMyJourneys(user.uid));
    } catch {
      setError('We could not load your journeys. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user.uid]);

  useEffect(() => { void loadJourneys(); }, [loadJourneys]);

  return (
    <main className="journey-home">
      <div className="journey-home__intro">
        <div>
          <p className="eyebrow">YOUR JOURNEYS</p>
          <h1>Every place has a story.</h1>
          <p className="journey-empty-copy">Keep the places, moments, and memories worth remembering.</p>
        </div>
        <CreateJourneyForm user={user} onCreated={loadJourneys} />
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      {isLoading ? (
        <p className="journey-status" aria-live="polite">Loading your journeys…</p>
      ) : journeys.length === 0 ? (
        <div className="empty-journeys">
          <p className="empty-journeys__title">Your story starts here.</p>
          <p>Create your first journey above.</p>
        </div>
      ) : (
        <section className="journey-grid" aria-label="Your journeys">
          {journeys.map((journey) => (
            <article className="journey-card" key={journey.id}>
              <p className="journey-card__place">{journey.place}</p>
              <h2>{journey.name}</h2>
              <p className="journey-card__dates">{formatDate(journey.startDate)} — {formatDate(journey.endDate)}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
EOT

cat > src/app/App.tsx <<'EOT'
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import '../design/theme.css';
import { getAuthErrorMessage } from '../features/auth/authErrors';
import { JourneyHome } from '../features/journeys/JourneyHome';
import { signIn, signOut, signUp, subscribeToAuthState } from '../services/firebase/auth';

type AuthMode = 'sign-in' | 'sign-up';

function AuthForm({ mode, onModeChange, onSubmit, isSubmitting, error }: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isSignIn = mode === 'sign-in';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    await onSubmit(email, password);
  };

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card__brand" aria-hidden="true"><div className="brand-glyph">TL</div></div>
      <p className="eyebrow">TRAVEL LORE</p>
      <h1 id="auth-title">{isSignIn ? 'Welcome back.' : 'Begin your story.'}</h1>
      <p className="auth-intro">{isSignIn ? 'Your journeys and memories are waiting.' : 'Create a place for the journeys worth remembering.'}</p>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isSubmitting} />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={isSignIn ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required disabled={isSubmitting} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? (isSignIn ? 'Signing in…' : 'Creating account…') : isSignIn ? 'Sign In' : 'Create Account'}</button>
      </form>
      <div className="auth-switch">
        <span>{isSignIn ? "Don't have an account?" : 'Already have an account?'}</span>
        <button className="text-button" type="button" onClick={() => onModeChange(isSignIn ? 'sign-up' : 'sign-in')} disabled={isSubmitting}>{isSignIn ? 'Create one' : 'Sign in'}</button>
      </div>
    </section>
  );
}

function JourneyShell({ user }: { user: User }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try { await signOut(); } finally { setIsSigningOut(false); }
  };

  return (
    <div className="journey-shell">
      <header className="topbar">
        <div className="topbar__brand"><div className="brand-glyph brand-glyph--small" aria-hidden="true">TL</div><span>Travel Lore</span></div>
        <button className="text-button text-button--quiet" type="button" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut ? 'Signing out…' : 'Sign out'}</button>
      </header>
      <JourneyHome user={user} />
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToAuthState((nextUser) => { setUser(nextUser); setIsAuthLoading(false); }), []);

  const handleAuthSubmit = async (email: string, password: string) => {
    setError(null); setIsSubmitting(true);
    try { if (mode === 'sign-in') await signIn(email, password); else await signUp(email, password); }
    catch (authError) { setError(getAuthErrorMessage(authError)); }
    finally { setIsSubmitting(false); }
  };

  if (isAuthLoading) return <main className="app-shell app-shell--loading" aria-live="polite"><div className="loading-mark" aria-hidden="true">TL</div><p>Opening Travel Lore…</p></main>;
  if (user) return <JourneyShell user={user} />;
  return <main className="app-shell"><AuthForm mode={mode} onModeChange={(nextMode) => { setMode(nextMode); setError(null); }} onSubmit={handleAuthSubmit} isSubmitting={isSubmitting} error={error} /></main>;
}
EOT

cat > src/design/theme.css <<'EOT'
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f3f0e8;
  background: #050c14;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: radial-gradient(circle at 50% 8%, rgba(27,117,117,.18), transparent 34%), radial-gradient(circle at 15% 75%, rgba(216,182,92,.05), transparent 28%), linear-gradient(180deg,#07131f 0%,#040a12 100%); }
button,input,textarea,select { font: inherit; }
button { -webkit-tap-highlight-color: transparent; }
.app-shell,.journey-shell { min-height: 100vh; }
.app-shell { display:grid; place-items:center; padding:32px 20px; }
.app-shell--loading { color:rgba(243,240,232,.68); gap:16px; align-content:center; }
.app-shell--loading p { margin:0; font-size:.9rem; }
.loading-mark,.brand-glyph { display:grid; place-items:center; border:1px solid rgba(64,199,189,.46); color:#d8b65c; background:rgba(8,27,39,.82); box-shadow:0 0 40px rgba(33,180,174,.12); letter-spacing:.08em; font-weight:700; }
.loading-mark { width:52px;height:52px;border-radius:16px; }
.auth-card { width:min(440px,100%); padding:42px 40px 36px; text-align:center; border:1px solid rgba(255,255,255,.09); border-radius:28px; background:linear-gradient(145deg,rgba(12,30,43,.88),rgba(5,15,24,.88)); box-shadow:0 28px 80px rgba(0,0,0,.34),0 0 60px rgba(33,180,174,.06); backdrop-filter:blur(18px); }
.auth-card__brand { margin-bottom:24px; }
.brand-glyph { width:70px;height:70px;margin:0 auto;border-radius:20px; }
.brand-glyph--small { width:38px;height:38px;border-radius:12px;font-size:.72rem; }
.eyebrow { margin:0 0 12px;color:#40c7bd;font-size:.72rem;letter-spacing:.28em;font-weight:700; }
h1,h2 { font-family:Georgia,"Times New Roman",serif;font-weight:400;line-height:1.04; }
h1 { margin:0;font-size:clamp(2.4rem,7vw,4rem); }
h2 { margin:0;font-size:2rem; }
.auth-intro,.journey-empty-copy { max-width:360px;margin:18px auto 0;color:rgba(243,240,232,.62);font-size:.98rem;line-height:1.65; }
.auth-form,.journey-form { display:grid;gap:10px;text-align:left; }
.auth-form { margin-top:30px; }
.auth-form label,.journey-form label { margin-top:6px;color:rgba(243,240,232,.82);font-size:.82rem;font-weight:600; }
.auth-form input,.journey-form input { width:100%;min-height:48px;padding:0 14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;outline:none;color:#f3f0e8;background:rgba(2,10,17,.62);transition:border-color 160ms ease,box-shadow 160ms ease; }
.auth-form input:focus,.journey-form input:focus { border-color:rgba(64,199,189,.75);box-shadow:0 0 0 3px rgba(64,199,189,.1); }
.auth-form input:disabled,.journey-form input:disabled { opacity:.6; }
.primary-button { min-height:50px;margin-top:12px;border:1px solid rgba(64,199,189,.5);border-radius:13px;color:#061219;background:#40c7bd;font-weight:700;cursor:pointer;transition:transform 140ms ease,filter 140ms ease,opacity 140ms ease; }
.primary-button:hover:not(:disabled) { filter:brightness(1.06);transform:translateY(-1px); }
.primary-button:disabled { cursor:not-allowed;opacity:.58; }
.auth-error { margin:8px 0 2px;padding:10px 12px;border:1px solid rgba(229,116,103,.28);border-radius:10px;color:#f1b4ab;background:rgba(229,116,103,.07);font-size:.82rem;line-height:1.45; }
.auth-switch { display:flex;justify-content:center;gap:6px;margin-top:22px;color:rgba(243,240,232,.5);font-size:.82rem; }
.text-button { padding:0;border:0;color:#40c7bd;background:transparent;font-weight:700;cursor:pointer; }
.text-button:hover:not(:disabled) { text-decoration:underline; }
.text-button:disabled { cursor:not-allowed;opacity:.5; }
.text-button--quiet { color:rgba(243,240,232,.6);font-weight:500; }
.journey-shell { padding:0 28px; }
.topbar { width:min(1180px,100%);min-height:74px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07); }
.topbar__brand { display:flex;align-items:center;gap:10px;font-family:Georgia,"Times New Roman",serif;font-size:1.1rem; }
.journey-home { width:min(1180px,100%);margin:0 auto;padding:clamp(56px,9vh,100px) 0; }
.journey-home__intro { display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,400px);gap:56px;align-items:start; }
.journey-home h1 { max-width:720px; }
.journey-empty-copy { margin-left:0;max-width:520px; }
.journey-form { padding:28px;border:1px solid rgba(255,255,255,.09);border-radius:22px;background:rgba(7,20,30,.72);box-shadow:0 20px 60px rgba(0,0,0,.22); }
.journey-form__heading { margin-bottom:4px; }
.journey-form__heading .eyebrow { margin-bottom:8px; }
.date-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
.date-grid > div { display:grid;gap:10px; }
.journey-status { color:rgba(243,240,232,.58); }
.empty-journeys { margin-top:42px;padding:44px 24px;text-align:center;border:1px dashed rgba(255,255,255,.12);border-radius:20px;color:rgba(243,240,232,.52); }
.empty-journeys p { margin:6px 0; }
.empty-journeys__title { color:#d8b65c;font-family:Georgia,"Times New Roman",serif;font-size:1.4rem; }
.journey-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;margin-top:44px; }
.journey-card { min-height:190px;padding:26px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(145deg,rgba(12,30,43,.78),rgba(5,15,24,.78));transition:transform 160ms ease,border-color 160ms ease; }
.journey-card:hover { transform:translateY(-2px);border-color:rgba(64,199,189,.28); }
.journey-card__place { margin:0 0 14px;color:#40c7bd;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;font-weight:700; }
.journey-card h2 { margin:0; }
.journey-card__dates { margin:22px 0 0;color:rgba(243,240,232,.48);font-size:.78rem; }
@media (max-width:760px) { .journey-home__intro { grid-template-columns:1fr;gap:38px; } }
@media (max-width:520px) { .auth-card{padding:34px 22px 30px;border-radius:22px;} .journey-shell{padding:0 18px;} .topbar{min-height:66px;} .journey-form{padding:22px;} .date-grid{grid-template-columns:1fr;} }
EOT

cat > firestore.rules <<'EOT'
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function journeyMember(journeyId) {
      return signedIn()
        && exists(/databases/$(database)/documents/journeys/$(journeyId)/members/$(request.auth.uid));
    }

    function journeyRole(journeyId) {
      return get(/databases/$(database)/documents/journeys/$(journeyId)/members/$(request.auth.uid)).data.role;
    }

    function canReadJourney(journeyId) {
      return journeyMember(journeyId);
    }

    function canEditJourney(journeyId) {
      return journeyMember(journeyId)
        && journeyRole(journeyId) in ['owner', 'editor'];
    }

    function isJourneyOwner(journeyId) {
      return journeyMember(journeyId)
        && journeyRole(journeyId) == 'owner';
    }

    match /users/{userId} {
      allow read, create, update: if signedIn() && request.auth.uid == userId;

      match /journeys/{journeyId} {
        allow read: if signedIn() && request.auth.uid == userId;
        allow create: if signedIn()
          && request.auth.uid == userId
          && request.resource.data.role == 'owner'
          && getAfter(/databases/$(database)/documents/journeys/$(journeyId)/members/$(userId)).data.role == 'owner';
        allow update, delete: if signedIn() && request.auth.uid == userId;
      }
    }

    match /journeys/{journeyId} {
      allow create: if signedIn()
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.name is string
        && request.resource.data.place is string
        && request.resource.data.startDate is string
        && request.resource.data.endDate is string;

      allow read: if canReadJourney(journeyId);
      allow update: if canEditJourney(journeyId)
        && request.resource.data.createdBy == resource.data.createdBy;
      allow delete: if isJourneyOwner(journeyId);

      match /members/{userId} {
        allow read: if canReadJourney(journeyId);

        allow create: if signedIn()
          && request.auth.uid == userId
          && request.resource.data.uid == userId
          && request.resource.data.email is string
          && request.resource.data.role == 'owner'
          && getAfter(/databases/$(database)/documents/journeys/$(journeyId)).data.createdBy == request.auth.uid;

        allow update: if isJourneyOwner(journeyId)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['role']);

        allow delete: if isJourneyOwner(journeyId);
      }

      match /entries/{entryId} {
        allow read: if canReadJourney(journeyId);
        allow create, update, delete: if canEditJourney(journeyId);
      }
    }

    match /invitations/{invitationId} {
      allow read, create, update, delete: if false;
    }
  }
}
EOT

cat > tests/journeys.test.ts <<'EOT'
import { describe, expect, it } from 'vitest';
import { validateJourneyInput } from '../src/services/firebase/journeys';

describe('Journey validation', () => {
  it('requires the four Journey fields', () => {
    expect(validateJourneyInput({ name: '', place: 'Japan', startDate: '2026-04-01', endDate: '2026-04-10' })).toBe('Please enter a journey name.');
    expect(validateJourneyInput({ name: 'Japan', place: '', startDate: '2026-04-01', endDate: '2026-04-10' })).toBe('Please enter a place.');
    expect(validateJourneyInput({ name: 'Japan', place: 'Japan', startDate: '', endDate: '2026-04-10' })).toBe('Please choose a start date.');
    expect(validateJourneyInput({ name: 'Japan', place: 'Japan', startDate: '2026-04-01', endDate: '' })).toBe('Please choose an end date.');
  });

  it('rejects an end date before the start date', () => {
    expect(validateJourneyInput({ name: 'Japan', place: 'Japan', startDate: '2026-04-10', endDate: '2026-04-01' })).toBe('End date cannot be before the start date.');
  });

  it('accepts a valid Journey', () => {
    expect(validateJourneyInput({ name: 'Japan 2026', place: 'Japan', startDate: '2026-04-01', endDate: '2026-04-10' })).toBeNull();
  });
});
EOT

npm run build
npm test
npm run lint

echo "Travel Lore Journey slice applied and local verification passed."
