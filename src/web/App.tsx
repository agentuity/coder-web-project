import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
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
import { useAPI } from '@agentuity/react';
import { ToastProvider, useToast } from './components/ui/toast';
import { useUrlState } from './hooks/useUrlState';

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

  const [urlState, setUrlState] = useUrlState();
  const activeSessionId = urlState.s ?? undefined;
  const currentPage = urlState.p;
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
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
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

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

  // Auto-create workspace on first load
  useEffect(() => {
    if (!user) return;
    
    fetch('/api/workspaces')
      .then(r => r.json())
      .then((workspaces: any[]) => {
        if (workspaces.length > 0) {
          setWorkspaceId(workspaces[0].id);
        } else {
          // Create default workspace
          fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Default Workspace' }),
          })
            .then(r => r.json())
            .then(w => setWorkspaceId(w.id));
        }
      });
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

	const handleNewSession = useCallback(async (data: { repoUrl?: string; branch?: string; prompt?: string }) => {
		if (!workspaceId) return;
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
			setSessions(prev => [session, ...prev]);
			setUrlState({ s: session.id, p: 'chat' });
			setShowNewDialog(false);
		} catch (error) {
			console.error('Failed to create session:', error);
			toast({ type: 'error', message: 'Failed to create session' });
		} finally {
			setIsCreating(false);
		}
	}, [setUrlState, toast, workspaceId]);

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
    } catch (err) {
      console.error('Failed to flag session:', err);
    }
  }, []);

  const handleRetrySession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/retry`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to retry session');
      }
      const session = await res.json();
      setSessions(prev => prev.map(s => (s.id === id ? session : s)));
    } catch (error) {
      console.error('Failed to retry session:', error);
      toast({ type: 'error', message: 'Failed to retry session' });
    }
  }, [toast]);

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
		} catch (error) {
			console.error('Failed to delete session:', error);
			toast({ type: 'error', message: 'Failed to delete session' });
		}
	}, [activeSessionId, setUrlState, toast]);

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
		content = <SettingsPage workspaceId={workspaceId} />;
	} else if (currentPage === 'profile') {
		content = <ProfilePage />;
	} else {
    content = (
      <WorkspacePage
        workspaceId={workspaceId ?? undefined}
        sessions={sessions}
        onNewSession={() => setShowNewDialog(true)}
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
