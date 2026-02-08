import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';

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
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onNavigate: (page: 'skills' | 'sources' | 'settings') => void;
  onFlagSession?: (id: string, flagged: boolean) => void;
  onRetrySession?: (id: string) => void;
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
  children,
}: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleSelectSession = useCallback((id: string) => {
    onSelectSession(id);
    setIsSidebarOpen(false);
  }, [onSelectSession]);

  const handleNavigate = useCallback((page: 'skills' | 'sources' | 'settings') => {
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
    <div className="flex h-screen flex-col bg-[var(--background)]">
      <TopBar
        userEmail={userEmail}
        userName={userName}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onToggleSidebar={handleToggleSidebar}
        isSidebarOpen={isSidebarOpen}
      />
      <div className="relative flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 z-30 bg-black/40 md:hidden"
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
          currentPage={currentPage}
          isMobileOpen={isSidebarOpen}
        />
        <main className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
