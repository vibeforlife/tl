#!/bin/bash
set -euo pipefail

if [ ! -f package.json ] || [ ! -f src/app/App.tsx ] || [ ! -f src/services/firebase/auth.ts ]; then
  echo "Error: run this script from the root of the clean Travel Lore V1 project."
  exit 1
fi

mkdir -p src/features/auth

cat > src/services/firebase/auth.ts <<'EOT'
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
EOT

cat > src/features/auth/authErrors.ts <<'EOT'
export const getAuthErrorMessage = (error: unknown): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Please choose a stronger password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a little while and try again.';
    default:
      return 'We could not complete that request. Please try again.';
  }
};
EOT

cat > src/app/App.tsx <<'EOT'
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import '../design/theme.css';
import { getAuthErrorMessage } from '../features/auth/authErrors';
import { signIn, signOut, signUp, subscribeToAuthState } from '../services/firebase/auth';

type AuthMode = 'sign-in' | 'sign-up';

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
};

function AuthForm({ mode, onModeChange, onSubmit, isSubmitting, error }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    await onSubmit(email, password);
  };

  const isSignIn = mode === 'sign-in';

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card__brand" aria-hidden="true">
        <div className="brand-glyph">TL</div>
      </div>

      <p className="eyebrow">TRAVEL LORE</p>
      <h1 id="auth-title">{isSignIn ? 'Welcome back.' : 'Begin your story.'}</h1>
      <p className="auth-intro">
        {isSignIn
          ? 'Your journeys and memories are waiting.'
          : 'Create a place for the journeys worth remembering.'}
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={isSubmitting}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={6}
          required
          disabled={isSubmitting}
        />

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isSignIn ? 'Signing in…' : 'Creating account…') : isSignIn ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div className="auth-switch">
        <span>{isSignIn ? "Don't have an account?" : 'Already have an account?'}</span>
        <button
          className="text-button"
          type="button"
          onClick={() => onModeChange(isSignIn ? 'sign-up' : 'sign-in')}
          disabled={isSubmitting}
        >
          {isSignIn ? 'Create one' : 'Sign in'}
        </button>
      </div>
    </section>
  );
}

function JourneyShell({ user }: { user: User }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <main className="journey-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="brand-glyph brand-glyph--small" aria-hidden="true">TL</div>
          <span>Travel Lore</span>
        </div>
        <button className="text-button text-button--quiet" type="button" onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <section className="journey-home" aria-labelledby="journey-home-title">
        <p className="eyebrow">YOUR JOURNEYS</p>
        <h1 id="journey-home-title">Every place has a story.</h1>
        <p className="journey-empty-copy">
          Your journey collection will live here. We’ll build Journey creation next.
        </p>
        <p className="signed-in-as">Signed in as {user.email}</p>
      </section>
    </main>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToAuthState((nextUser) => {
      setUser(nextUser);
      setIsAuthLoading(false);
    });
  }, []);

  const handleAuthSubmit = async (email: string, password: string) => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'sign-in') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return (
      <main className="app-shell app-shell--loading" aria-live="polite">
        <div className="loading-mark" aria-hidden="true">TL</div>
        <p>Opening Travel Lore…</p>
      </main>
    );
  }

  if (user) {
    return <JourneyShell user={user} />;
  }

  return (
    <main className="app-shell">
      <AuthForm
        mode={mode}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setError(null);
        }}
        onSubmit={handleAuthSubmit}
        isSubmitting={isSubmitting}
        error={error}
      />
    </main>
  );
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

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(circle at 50% 8%, rgba(27, 117, 117, 0.18), transparent 34%),
    radial-gradient(circle at 15% 75%, rgba(216, 182, 92, 0.05), transparent 28%),
    linear-gradient(180deg, #07131f 0%, #040a12 100%);
}

button, input, textarea, select { font: inherit; }
button { -webkit-tap-highlight-color: transparent; }

.app-shell,
.journey-shell {
  min-height: 100vh;
}

.app-shell {
  display: grid;
  place-items: center;
  padding: 32px 20px;
}

.app-shell--loading {
  color: rgba(243, 240, 232, 0.68);
  gap: 16px;
  align-content: center;
}

.app-shell--loading p { margin: 0; font-size: 0.9rem; }

.loading-mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(64, 199, 189, 0.42);
  border-radius: 16px;
  color: #d8b65c;
  font-weight: 700;
  letter-spacing: 0.08em;
  box-shadow: 0 0 34px rgba(33, 180, 174, 0.12);
}

.auth-card {
  width: min(440px, 100%);
  padding: 42px 40px 36px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(12, 30, 43, 0.88), rgba(5, 15, 24, 0.88));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34), 0 0 60px rgba(33, 180, 174, 0.06);
  backdrop-filter: blur(18px);
}

.auth-card__brand { margin-bottom: 24px; }

.brand-glyph {
  width: 70px;
  height: 70px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid rgba(64, 199, 189, 0.46);
  border-radius: 20px;
  color: #d8b65c;
  background: rgba(8, 27, 39, 0.82);
  box-shadow: 0 0 40px rgba(33, 180, 174, 0.12);
  letter-spacing: 0.08em;
  font-weight: 700;
}

.brand-glyph--small {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  font-size: 0.72rem;
}

.eyebrow {
  margin: 0 0 12px;
  color: #40c7bd;
  font-size: 0.72rem;
  letter-spacing: 0.28em;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2.4rem, 7vw, 4rem);
  font-weight: 400;
  line-height: 1.04;
}

.auth-intro,
.journey-empty-copy {
  max-width: 360px;
  margin: 18px auto 0;
  color: rgba(243, 240, 232, 0.62);
  font-size: 0.98rem;
  line-height: 1.65;
}

.auth-form {
  display: grid;
  gap: 10px;
  margin-top: 30px;
  text-align: left;
}

.auth-form label {
  margin-top: 6px;
  color: rgba(243, 240, 232, 0.82);
  font-size: 0.82rem;
  font-weight: 600;
}

.auth-form input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  outline: none;
  color: #f3f0e8;
  background: rgba(2, 10, 17, 0.62);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.auth-form input:focus {
  border-color: rgba(64, 199, 189, 0.75);
  box-shadow: 0 0 0 3px rgba(64, 199, 189, 0.1);
}

.auth-form input:disabled { opacity: 0.6; }

.primary-button {
  min-height: 50px;
  margin-top: 12px;
  border: 1px solid rgba(64, 199, 189, 0.5);
  border-radius: 13px;
  color: #061219;
  background: #40c7bd;
  font-weight: 700;
  cursor: pointer;
  transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
}

.primary-button:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
.primary-button:disabled { cursor: not-allowed; opacity: 0.58; }

.auth-error {
  margin: 8px 0 2px;
  padding: 10px 12px;
  border: 1px solid rgba(229, 116, 103, 0.28);
  border-radius: 10px;
  color: #f1b4ab;
  background: rgba(229, 116, 103, 0.07);
  font-size: 0.82rem;
  line-height: 1.45;
}

.auth-switch {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 22px;
  color: rgba(243, 240, 232, 0.5);
  font-size: 0.82rem;
}

.text-button {
  padding: 0;
  border: 0;
  color: #40c7bd;
  background: transparent;
  font-weight: 700;
  cursor: pointer;
}

.text-button:hover:not(:disabled) { text-decoration: underline; }
.text-button:disabled { cursor: not-allowed; opacity: 0.5; }
.text-button--quiet { color: rgba(243, 240, 232, 0.6); font-weight: 500; }

.journey-shell { padding: 0 28px; }

.topbar {
  width: min(1180px, 100%);
  min-height: 74px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.1rem;
}

.journey-home {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: clamp(72px, 12vh, 140px) 0;
}

.journey-home h1 { max-width: 720px; }
.journey-empty-copy { margin-left: 0; max-width: 520px; }
.signed-in-as { margin: 28px 0 0; color: rgba(243, 240, 232, 0.38); font-size: 0.78rem; }

@media (max-width: 520px) {
  .auth-card { padding: 34px 22px 30px; border-radius: 22px; }
  .journey-shell { padding: 0 18px; }
  .topbar { min-height: 66px; }
}
EOT

cat > tests/authErrors.test.ts <<'EOT'
import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from '../src/features/auth/authErrors';

describe('authentication error messages', () => {
  it('maps common Firebase sign-in errors to user-friendly messages', () => {
    expect(
      getAuthErrorMessage({ code: 'auth/invalid-credential' }),
    ).toBe('The email or password is incorrect.');
  });

  it('does not expose raw Firebase errors for unknown failures', () => {
    expect(getAuthErrorMessage({ code: 'auth/internal-error', message: 'some internal Firebase detail' })).toBe(
      'We could not complete that request. Please try again.',
    );
  });
});
EOT

# Remove the old auth module's direct getAuth export only after the replacement files are written.

npm run build
npm test
npm run lint

echo
printf '%s\n' 'Authentication slice applied and local verification passed.'
