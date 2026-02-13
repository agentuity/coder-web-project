import { Outlet } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ErrorBoundary } from '../ErrorBoundary';
import { Button } from '../ui/button';
import { Sidebar } from './Sidebar';
import { authClient } from '../../lib/auth-client';

export function AppShell() {
  const {
    userEmail,
    userName,
    sessions,
    sessionsLoading,
    activeSessionId,
    theme,
    handleToggleTheme,
    openNewSessionDialog,
    handleFlagSession,
    handleRetrySession,
    handleDeleteSession,
  } = useAppContext();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleNewSession = useCallback(() => {
    openNewSessionDialog();
    setIsSidebarOpen(false);
  }, [openNewSessionDialog]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-[100dvh] bg-[var(--background)]">
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <Sidebar
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        activeSessionId={activeSessionId}
        onNewSession={handleNewSession}
        onFlagSession={handleFlagSession}
        onRetrySession={handleRetrySession}
        onDeleteSession={handleDeleteSession}
        isMobileOpen={isSidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        userEmail={userEmail}
        userName={userName}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSignOut={() => { authClient.signOut(); }}
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
