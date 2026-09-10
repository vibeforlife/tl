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
      <div className="auth-card__brand">
        <img
          className="auth-card__logo"
          src={`${import.meta.env.BASE_URL}travel-lore-icon-512.png`}
          alt="Travel Lore"
        />
        <div className="auth-card__wordmark">Travel Lore</div>
      </div>
      <p className="eyebrow">EVERY PLACE HAS A STORY</p>
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

function BrandSplash() {
  return (
    <main className="brand-splash" aria-label="Travel Lore">
      <img
        className="brand-splash__image"
        src={`${import.meta.env.BASE_URL}travel-lore-splash.jpg`}
        alt="Travel Lore — Every place has a story"
      />
    </main>
  );
}

function JourneyShell({ user }: { user: User }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [homeRequest, setHomeRequest] = useState(0);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleHome = () => {
    setHomeRequest((current) => current + 1);
  };

  return (
    <div className="journey-shell">
      <header className="topbar">
        <button
          className="topbar__brand"
          type="button"
          onClick={handleHome}
          aria-label="Go to Travel Lore home"
        >
          <img
            className="topbar__logo"
            src={`${import.meta.env.BASE_URL}travel-lore-icon-192.png`}
            alt=""
            aria-hidden="true"
          />
          <span className="topbar__wordmark">Travel Lore</span>
        </button>

        <button
          className="text-button text-button--quiet"
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <JourneyHome user={user} homeRequest={homeRequest} />
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBrandSplashVisible, setIsBrandSplashVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsBrandSplashVisible(false), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => subscribeToAuthState((nextUser) => { setUser(nextUser); setIsAuthLoading(false); }), []);

  const handleAuthSubmit = async (email: string, password: string) => {
    setError(null); setIsSubmitting(true);
    try { if (mode === 'sign-in') await signIn(email, password); else await signUp(email, password); }
    catch (authError) { setError(getAuthErrorMessage(authError)); }
    finally { setIsSubmitting(false); }
  };

  if (isBrandSplashVisible || isAuthLoading) return <BrandSplash />;
  if (user) return <JourneyShell user={user} />;
  return <main className="app-shell"><AuthForm mode={mode} onModeChange={(nextMode) => { setMode(nextMode); setError(null); }} onSubmit={handleAuthSubmit} isSubmitting={isSubmitting} error={error} /></main>;
}
