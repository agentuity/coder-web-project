import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '../ui/button';
import { authClient } from '../../lib/auth-client';

interface Session {
  id: string;
  title: string | null;
  status: string;
  agent: string | null;
  createdAt: string;
  flagged: boolean | null;
}

interface AppShellProps {
  userEmail?: string;
  userName?: string;
  sessions: Session[];
  activeSessionId?: string;
  currentPage: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
	onNavigate: (page: 'skills' | 'sources' | 'settings' | 'profile') => void;
  onFlagSession?: (id: string, flagged: boolean) => void;
  onRetrySession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  children: ReactNode;
}

export function AppShell({
  userEmail,
  userName,
  sessions,
  activeSessionId,
  currentPage,
  theme,
  onToggleTheme,
  onNewSession,
  onSelectSession,
  onNavigate,
  onFlagSession,
  onRetrySession,
  onDeleteSession,
  children,
}: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSelectSession = useCallback((id: string) => {
    onSelectSession(id);
    setIsSidebarOpen(false);
  }, [onSelectSession]);

	const handleNavigate = useCallback((page: 'skills' | 'sources' | 'settings' | 'profile') => {
		onNavigate(page);
		setIsSidebarOpen(false);
	}, [onNavigate]);

  const handleNewSession = useCallback(() => {
    onNewSession();
    setIsSidebarOpen(false);
  }, [onNewSession]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-screen bg-[var(--background)]">
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onNavigate={handleNavigate}
        onFlagSession={onFlagSession}
        onRetrySession={onRetrySession}
        onDeleteSession={onDeleteSession}
        currentPage={currentPage}
        isMobileOpen={isSidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        userEmail={userEmail}
        userName={userName}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onSignOut={() => authClient.signOut()}
      />

      <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 p-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleSidebar}
            title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
