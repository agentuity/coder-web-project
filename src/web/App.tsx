import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from './lib/auth-client';
import { SignIn } from './components/auth/SignIn';
import { ProfilePage } from './components/auth/ProfilePage';
import { AppShell } from './components/shell/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NewSessionDialog } from './components/sessions/NewSessionDialog';
import { WorkspacePage } from './components/pages/WorkspacePage';
import { ChatPage } from './components/pages/ChatPage';
import { SkillsPage } from './components/pages/SkillsPage';
import { SourcesPage } from './components/pages/SourcesPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { SharedSessionPage } from './components/pages/SharedSessionPage';
import { useAnalytics, useAPI } from '@agentuity/react';
import { ToastProvider, useToast } from './components/ui/toast';
import { useUrlState } from './hooks/useUrlState';
import { useAnalyticsIdentify } from './hooks/useAnalyticsIdentify';

/**
 * Detect if the current URL is a shared session route.
 * Returns the stream URL if on /shared/:streamId, otherwise null.
 */
function getSharedStreamUrl(): string | null {
  const match = window.location.pathname.match(/^\/shared\/(.+)$/);
  if (match) {
    return `/api/shared/${match[1]}`;
  }
  return null;
}

interface Session {
  id: string;
  title: string | null;
  status: string;
  agent: string | null;
	model: string | null;
	sandboxId: string | null;
	sandboxUrl: string | null;
  createdAt: string;
  flagged: boolean | null;
  metadata?: Record<string, unknown> | null;
}

function AppContent() {
  const { data: authSession, isPending: authLoading } = authClient.useSession();
  const user = authSession?.user;
  const { toast } = useToast();
  // Coerce proxy values to plain strings to prevent React 19 dev mode
  // from triggering .toString()/.valueOf() on BetterAuth Proxy objects,
  // which would cause 404 requests to /api/auth/display-name/value-of.
  const userName = user?.name ? String(user.name) : undefined;
  const userEmail = user?.email ? String(user.email) : undefined;
  const hasUser = Boolean(userName || userEmail);
  const { track } = useAnalytics();

  useAnalyticsIdentify({ name: userName, email: userEmail });

  const [urlState, setUrlState] = useUrlState();
  const activeSessionId = urlState.s ?? undefined;
  const currentPage = urlState.p;
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [githubAvailable, setGithubAvailable] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('agentuity-theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Apply theme class to <html> and persist
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('agentuity-theme', theme);
  }, [theme]);

  useEffect(() => {
    track('page_viewed', { page: currentPage });
  }, [currentPage, track]);

  // Check if current user has a GitHub PAT configured
  const fetchGithubStatus = useCallback(() => {
    if (!user) return;
    fetch('/api/user/github')
      .then(r => r.json())
      .then((data: { configured?: boolean }) => setGithubAvailable(data.configured ?? false))
      .catch(() => setGithubAvailable(false));
  }, [user]);

  useEffect(() => {
    fetchGithubStatus();
  }, [fetchGithubStatus]);

  // Re-fetch GitHub status when token is connected/disconnected in settings
  useEffect(() => {
    const handler = () => fetchGithubStatus();
    window.addEventListener('github-status-changed', handler);
    return () => window.removeEventListener('github-status-changed', handler);
  }, [fetchGithubStatus]);

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      track('theme_toggled', { theme: newTheme });
      return newTheme;
    });
  }, [track]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+N or Ctrl+N — new session
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowNewDialog(true);
      }
      // Escape — close dialog
      if (e.key === 'Escape') {
        if (showNewDialog) {
          setShowNewDialog(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showNewDialog]);

  // Auto-create workspace on first load; restore selection from localStorage
  useEffect(() => {
    if (!user) return;
    let aborted = false;
    
    fetch('/api/workspaces')
      .then(r => r.json())
      .then((workspaces: any[]) => {
        if (aborted) return;
        if (workspaces.length > 0) {
          const savedId = localStorage.getItem('selectedWorkspaceId');
          const match = savedId ? workspaces.find((w: any) => w.id === savedId) : null;
          const selected = match ? match.id : workspaces[0].id;
          setWorkspaceId(selected);
          localStorage.setItem('selectedWorkspaceId', selected);
        } else {
          // Create default workspace
          fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Default Workspace' }),
          })
            .then(r => r.json())
            .then(w => {
              if (aborted) return;
              setWorkspaceId(w.id);
              localStorage.setItem('selectedWorkspaceId', w.id);
            });
        }
      });
    
    return () => { aborted = true; };
  }, [user]);

  // Fetch sessions
  useEffect(() => {
    if (!workspaceId) return;
    
    const fetchSessions = () => {
      fetch(`/api/workspaces/${workspaceId}/sessions`)
        .then(r => r.json())
        .then(s => setSessions(s))
        .catch(() => {});
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [workspaceId]);

	const handleNewSession = useCallback(async (data: { repoUrl?: string; branch?: string; prompt?: string; snapshotId?: string }) => {
		if (!workspaceId) return;
		// Ref-based guard prevents double submission (state updates are async)
		if (isCreatingRef.current) return;
		isCreatingRef.current = true;
		setIsCreating(true);
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Failed to create session');
			}
			const session = await res.json();
			setSessions(prev => prev.some(s => s.id === session.id) ? prev : [session, ...prev]);
			setUrlState({ s: session.id, p: 'chat' });
			setShowNewDialog(false);
			track('session_created', {
				hasRepo: !!data.repoUrl,
				hasBranch: !!data.branch,
				hasPrompt: !!data.prompt,
			});
		} catch (error) {
			console.error('Failed to create session:', error);
			toast({ type: 'error', message: 'Failed to create session' });
		} finally {
			isCreatingRef.current = false;
			setIsCreating(false);
		}
	}, [setUrlState, toast, track, workspaceId]);

	const handleSelectSession = useCallback((id: string) => {
		setUrlState({ s: id, p: 'chat' });
	}, [setUrlState]);

	const handleNavigate = useCallback((page: 'skills' | 'sources' | 'settings' | 'profile') => {
		// Preserve active session for pages that need sandbox access
		const keepSession = page === 'sources';
		setUrlState({ s: keepSession ? (activeSessionId ?? null) : null, p: page });
	}, [setUrlState, activeSessionId]);

  const handleFlagSession = useCallback(async (id: string, flagged: boolean) => {
    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged }),
      });
      setSessions(prev => prev.map(s => (s.id === id ? { ...s, flagged } : s)));
      track('session_flagged', { flagged });
    } catch (err) {
      console.error('Failed to flag session:', err);
    }
  }, [track]);

  const handleRetrySession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/retry`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to retry session');
      }
      const session = await res.json();
      setSessions(prev => prev.map(s => (s.id === id ? session : s)));
      track('session_retried');
    } catch (error) {
      console.error('Failed to retry session:', error);
      toast({ type: 'error', message: 'Failed to retry session' });
    }
  }, [toast, track]);

	const handleDeleteSession = useCallback(async (id: string) => {
		try {
			const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				throw new Error('Failed to delete session');
			}
			setSessions((prev) => {
				const updated = prev.filter((session) => session.id !== id);
				if (activeSessionId === id) {
					const nextSession = updated[0];
					setUrlState({ s: nextSession?.id ?? null, p: 'chat' });
				}
				return updated;
			});
			track('session_deleted');
		} catch (error) {
			console.error('Failed to delete session:', error);
			toast({ type: 'error', message: 'Failed to delete session' });
		}
	}, [activeSessionId, setUrlState, toast, track]);

	const handleWorkspaceChange = useCallback((id: string) => {
		setWorkspaceId(id);
		localStorage.setItem('selectedWorkspaceId', id);
		track('workspace_switched', { workspaceId: id });
	}, [track]);

	const handleQuickSession = useCallback((prompt: string) => {
		handleNewSession({ prompt });
	}, [handleNewSession]);

	const handleForkedSession = useCallback((session: Session) => {
		setSessions(prev => [session, ...prev]);
		setUrlState({ s: session.id, p: 'chat' });
	}, [setUrlState]);

  // Auth loading state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="text-[var(--muted-foreground)]">Loading...</div>
      </div>
    );
  }

  // Not authenticated
  if (!hasUser) {
    return <SignIn />;
  }

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Render current page content
  let content: React.ReactNode;
  if (currentPage === 'chat' && activeSession) {
    content = (
      <ChatPage
        sessionId={activeSession.id}
        session={activeSession}
        onForkedSession={handleForkedSession}
        githubAvailable={githubAvailable}
      />
    );
	} else if (currentPage === 'skills' && workspaceId) {
		content = <SkillsPage workspaceId={workspaceId} />;
	} else if (currentPage === 'sources' && workspaceId) {
		content = <SourcesPage workspaceId={workspaceId} />;
	} else if (currentPage === 'settings' && workspaceId) {
		content = <SettingsPage workspaceId={workspaceId} onWorkspaceChange={handleWorkspaceChange} />;
	} else if (currentPage === 'profile') {
		content = <ProfilePage />;
	} else {
    content = (
      <WorkspacePage
        workspaceId={workspaceId ?? undefined}
        sessions={sessions}
        onNewSession={() => setShowNewDialog(true)}
        onQuickSession={handleQuickSession}
        onSelectSession={handleSelectSession}
        onNavigate={handleNavigate}
      />
    );
  }

  return (
    <>
      <AppShell
        userEmail={userEmail}
        userName={userName}
        sessions={sessions}
        activeSessionId={activeSessionId}
        currentPage={currentPage}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNewSession={() => setShowNewDialog(true)}
        onSelectSession={handleSelectSession}
        onNavigate={handleNavigate}
        onFlagSession={handleFlagSession}
        onRetrySession={handleRetrySession}
        onDeleteSession={handleDeleteSession}
      >
        <ErrorBoundary>{content}</ErrorBoundary>
      </AppShell>

      <NewSessionDialog
        isOpen={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleNewSession}
        isCreating={isCreating}
        githubAvailable={githubAvailable}
        workspaceId={workspaceId ?? undefined}
      />
    </>
  );
}

export function App() {
  const sharedStreamUrl = getSharedStreamUrl();

  // Shared session pages are public and don't need the full app shell
  if (sharedStreamUrl) {
    return (
      <ToastProvider>
        <ErrorBoundary>
          <SharedSessionPage streamUrl={sharedStreamUrl} />
        </ErrorBoundary>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
