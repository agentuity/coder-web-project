import type { ReactNode } from 'react';
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
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
      <TopBar userEmail={userEmail} userName={userName} theme={theme} onToggleTheme={onToggleTheme} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewSession={onNewSession}
          onSelectSession={onSelectSession}
          onNavigate={onNavigate}
          onFlagSession={onFlagSession}
          currentPage={currentPage}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
