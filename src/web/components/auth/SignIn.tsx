import { AlertCircle, Loader2, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAnalytics } from '@agentuity/react';
import { authClient } from '../../lib/auth-client';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" role="img" aria-label="Google">
    <title>Google</title>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export function SignIn() {
  const { data: session } = authClient.useSession();
  const { track } = useAnalytics();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [mode, setMode] = useState<'choose' | 'email'>('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [methods, setMethods] = useState<{ google: boolean; email: boolean } | null>(null);

  useEffect(() => {
    if (session?.user) {
      window.location.href = '/';
    }
  }, [session]);

  useEffect(() => {
    fetch('/api/auth-methods')
      .then((res) => res.json())
      .then((data: { google: boolean; email: boolean }) => {
        setMethods(data);
        // If only email is available, skip the choose screen and go straight to email form
        if (data.email && !data.google) {
          setMode('email');
        }
      })
      .catch(() => {
        // Fallback: show both if endpoint fails
        setMethods({ google: true, email: true });
      });
  }, []);

  const handleGoogleSignIn = async () => {
    setServerError(null);
    setIsLoading(true);
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
      track('user_signed_in', { method: 'google' });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsLoading(true);
    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0] || email,
        });
        if ((result as any)?.error) {
          setServerError((result as any).error.message || 'Sign up failed');
        } else {
          track('user_signed_up', { method: 'email' });
        }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if ((result as any)?.error) {
          setServerError((result as any).error.message || 'Sign in failed');
        } else {
          track('user_signed_in', { method: 'email' });
        }
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading spinner while fetching auth methods
  if (!methods) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] px-4">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  const showGoogle = methods.google;
  const showEmail = methods.email;
  const showBoth = showGoogle && showEmail;

  // Google-only: render just the Google button (no mode switching)
  const renderGoogleOnly = () => (
    <div className="space-y-3">
      <button
        onClick={handleGoogleSignIn}
        type="button"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 rounded-lg border-2 border-[var(--input)] bg-[var(--background)] px-6 py-3 font-medium text-[var(--foreground)] transition-all hover:bg-[var(--muted)] disabled:opacity-50 cursor-pointer"
      >
        <GoogleIcon />
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in...
          </span>
        ) : (
          'Sign in with Google'
        )}
      </button>
    </div>
  );

  // Email-only: render the email form directly (no "Back to all sign-in options")
  const renderEmailOnly = () => (
    <form onSubmit={handleEmailAuth} className="space-y-4">
      {isSignUp && (
        <div>
          <label htmlFor="auth-name" className="block text-sm font-medium text-[var(--foreground)] mb-1">Name</label>
          <input
            id="auth-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
      )}
      <div>
        <label htmlFor="auth-email" className="block text-sm font-medium text-[var(--foreground)] mb-1">Email</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
      </div>
      <div>
        <label htmlFor="auth-password" className="block text-sm font-medium text-[var(--foreground)] mb-1">Password</label>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-[var(--primary)] px-6 py-3 font-medium text-[var(--primary-foreground)] transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {isSignUp ? 'Creating account...' : 'Signing in...'}
          </span>
        ) : (
          isSignUp ? 'Create Account' : 'Sign In'
        )}
      </button>

      <div className="text-center text-sm text-[var(--muted-foreground)]">
        {isSignUp ? (
          <span>Already have an account?{' '}
            <button type="button" onClick={() => { setIsSignUp(false); setServerError(null); }} className="text-[var(--primary)] hover:underline cursor-pointer">Sign in</button>
          </span>
        ) : (
          <span>No account?{' '}
            <button type="button" onClick={() => { setIsSignUp(true); setServerError(null); }} className="text-[var(--primary)] hover:underline cursor-pointer">Create one</button>
          </span>
        )}
      </div>
    </form>
  );

  // Both methods: keep current choose/email mode switching behavior
  const renderBoth = () => (
    <>
      {mode === 'choose' ? (
        <div className="space-y-3">
          <button
            onClick={handleGoogleSignIn}
            type="button"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border-2 border-[var(--input)] bg-[var(--background)] px-6 py-3 font-medium text-[var(--foreground)] transition-all hover:bg-[var(--muted)] disabled:opacity-50 cursor-pointer"
          >
            <GoogleIcon />
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign in with Google'
            )}
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">or</span>
            </div>
          </div>

          <button
            onClick={() => setMode('email')}
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-lg border-2 border-[var(--input)] bg-[var(--background)] px-6 py-3 font-medium text-[var(--foreground)] transition-all hover:bg-[var(--muted)] cursor-pointer"
          >
            <Mail className="h-5 w-5" />
            Sign in with Email
          </button>
        </div>
      ) : (
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="auth-name" className="block text-sm font-medium text-[var(--foreground)] mb-1">Name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-[var(--foreground)] mb-1">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-[var(--foreground)] mb-1">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-[var(--primary)] px-6 py-3 font-medium text-[var(--primary-foreground)] transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </span>
            ) : (
              isSignUp ? 'Create Account' : 'Sign In'
            )}
          </button>

          <div className="text-center text-sm text-[var(--muted-foreground)]">
            {isSignUp ? (
              <span>Already have an account?{' '}
                <button type="button" onClick={() => { setIsSignUp(false); setServerError(null); }} className="text-[var(--primary)] hover:underline cursor-pointer">Sign in</button>
              </span>
            ) : (
              <span>No account?{' '}
                <button type="button" onClick={() => { setIsSignUp(true); setServerError(null); }} className="text-[var(--primary)] hover:underline cursor-pointer">Create one</button>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setMode('choose'); setServerError(null); }}
            className="w-full text-center text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
          >
            Back to all sign-in options
          </button>
        </form>
      )}
    </>
  );

  // Determine which content to render
  const renderContent = () => {
    if (showBoth) return renderBoth();
    if (showGoogle) return renderGoogleOnly();
    if (showEmail) return renderEmailOnly();
    // Fallback (shouldn't happen): show both
    return renderBoth();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] px-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-8 shadow-lg">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Agentuity Coder</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Sign in to get started
            </p>
          </div>

          {serverError && (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-600/50 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {renderContent()}
        </div>
      </div>
    </div>
  );
}
