import { Plus, Sparkles, Plug, Settings, Star, RefreshCw, Trash2, ChevronRight, ChevronDown, ChevronLeft, LogOut, Moon, Sun, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { AgentuityLogo } from '../ui/AgentuityLogo';

interface Session {
  id: string;
  title: string | null;
  status: string;
  agent: string | null;
  createdAt: string;
  flagged: boolean | null;
}

interface SidebarProps {
  sessions: Session[];
  activeSessionId?: string;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onNavigate: (page: 'skills' | 'sources' | 'settings' | 'profile') => void;
  onFlagSession?: (id: string, flagged: boolean) => void;
  onRetrySession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  currentPage: string;
  isMobileOpen?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  userEmail?: string;
  userName?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignOut: () => void;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500';
    case 'creating': return 'bg-yellow-500 animate-pulse';
    case 'terminated': return 'bg-gray-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
}

export function Sidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  onNavigate,
  onFlagSession,
  onRetrySession,
  onDeleteSession,
  currentPage,
  isMobileOpen,
  collapsed,
  onToggleCollapse,
  userEmail,
  userName,
  theme,
  onToggleTheme,
  onSignOut,
}: SidebarProps) {
  const [showTerminated, setShowTerminated] = useState(false);
  const isCollapsed = Boolean(collapsed) && !isMobileOpen;
  const displayName = userName || userEmail || 'User';
  const showEmail = Boolean(userName && userEmail);

  const { activeSessions, terminatedSessions } = useMemo(() => {
    const isTerminated = (session: Session) => session.status === 'terminated' || session.status === 'error';
    return {
      activeSessions: sessions.filter((session) => !isTerminated(session)),
      terminatedSessions: sessions.filter(isTerminated),
    };
  }, [sessions]);

  const renderSessionRow = (session: Session) => (
    <div
      key={session.id}
      className={cn(
        'group w-full flex items-center gap-2 rounded-md py-2 text-sm transition-colors hover:bg-[var(--accent)]',
        isCollapsed ? 'justify-center px-2' : 'px-3',
        activeSessionId === session.id
          ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
          : 'text-[var(--foreground)]'
      )}
    >
      <button
        type="button"
        onClick={() => onSelectSession(session.id)}
        className={cn(
          'flex flex-1 items-center gap-2 truncate text-left',
          isCollapsed && 'justify-center'
        )}
        title={session.title || 'Untitled Session'}
      >
        <div className={`h-2 w-2 rounded-full ${getStatusColor(session.status)}`} />
        {!isCollapsed && (
          <div className="flex-1 truncate">
            {session.title || 'Untitled Session'}
          </div>
        )}
      </button>
      {!isCollapsed && (
        <div className="ml-auto flex items-center gap-1">
          {session.status === 'error' && (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
              Error
            </Badge>
          )}
          {session.status === 'error' && onRetrySession && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRetrySession(session.id);
              }}
              title="Retry session"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          {onFlagSession ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFlagSession(session.id, !session.flagged);
              }}
              className="shrink-0 p-0.5 rounded hover:bg-[var(--muted)] transition-colors"
              title={session.flagged ? 'Remove flag' : 'Flag session'}
            >
              <Star className={`h-3 w-3 ${session.flagged ? 'text-yellow-500 fill-yellow-500' : 'text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100'}`} />
            </button>
          ) : (
            session.flagged && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          )}
          {onDeleteSession && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const isActive = activeSessionId === session.id;
                const message = isActive
                  ? 'Delete this session? You will be redirected to another session.'
                  : 'Delete this session?';
                if (window.confirm(message)) {
                  onDeleteSession(session.id);
                }
              }}
              className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              title="Delete session"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-[var(--border)] bg-[var(--card)] transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-64',
        isMobileOpen
          ? 'absolute inset-y-0 left-0 z-40 flex md:static md:flex'
          : 'hidden md:flex',
      )}
    >
      <div className={cn('flex items-center gap-2 px-4 py-3', isCollapsed && 'justify-center px-2')}>
        <AgentuityLogo size={20} className="text-cyan-400" />
        {!isCollapsed && <span id="logo" className="text-xl font-semibold tracking-tight">Coder</span>}
      </div>
      <div className={cn('p-3', isCollapsed && 'px-2')}>
        {isCollapsed ? (
          <Button
            onClick={onNewSession}
            className="w-full"
            size="icon"
            title="New Session"
            aria-label="New Session"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={onNewSession} className="w-full" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        )}
      </div>

      <Separator />

      <ScrollArea className={cn('flex-1 p-2', isCollapsed && 'px-1')}>
        <div className="space-y-3">
          {isCollapsed ? (
            <div className="space-y-1">
              {activeSessions.map(renderSessionRow)}
            </div>
          ) : (
            <>
              {activeSessions.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                    Active
                  </div>
                  <div className="space-y-1">
                    {activeSessions.map(renderSessionRow)}
                  </div>
                </div>
              )}
              {terminatedSessions.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTerminated((prev) => !prev)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                  >
                    {showTerminated ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Terminated
                    <Badge variant="secondary" className="ml-auto text-[9px]">
                      {terminatedSessions.length}
                    </Badge>
                  </button>
                  {showTerminated && (
                    <div className="mt-1 space-y-1">
                      {terminatedSessions.map(renderSessionRow)}
                    </div>
                  )}
                </div>
              )}
              {sessions.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                  No sessions yet. Create one to get started.
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className={cn('p-2 space-y-1', isCollapsed && 'px-1')}>
        <button
          type="button"
          onClick={() => onNavigate('skills')}
          className={cn(
            'w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]',
            currentPage === 'skills' ? 'bg-[var(--accent)]' : '',
            isCollapsed && 'justify-center px-2'
          )}
          title="Skills"
          aria-label={isCollapsed ? 'Skills' : undefined}
        >
          <Sparkles className="h-4 w-4" />
          {!isCollapsed && 'Skills'}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sources')}
          className={cn(
            'w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]',
            currentPage === 'sources' ? 'bg-[var(--accent)]' : '',
            isCollapsed && 'justify-center px-2'
          )}
          title="Sources"
          aria-label={isCollapsed ? 'Sources' : undefined}
        >
          <Plug className="h-4 w-4" />
          {!isCollapsed && 'Sources'}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={cn(
            'w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]',
            currentPage === 'settings' ? 'bg-[var(--accent)]' : '',
            isCollapsed && 'justify-center px-2'
          )}
          title="Settings"
          aria-label={isCollapsed ? 'Settings' : undefined}
        >
          <Settings className="h-4 w-4" />
          {!isCollapsed && 'Settings'}
        </button>
      </div>
      <div className="mt-auto border-t border-[var(--border)]">
        <div className={cn('flex items-center gap-2 p-3', isCollapsed && 'flex-col p-2')}>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{displayName}</p>
              {showEmail && <p className="text-[10px] text-[var(--muted-foreground)] truncate">{userEmail}</p>}
            </div>
          )}
          <button
            onClick={() => onNavigate('profile')}
            className={cn(
              'shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]',
              currentPage === 'profile' && 'text-[var(--foreground)]'
            )}
            title="Profile"
            aria-label="Profile"
            type="button"
          >
            <User className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleTheme}
            className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            type="button"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onSignOut}
            className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-[var(--accent)]"
            title="Sign out"
            type="button"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-2">
          <button
            onClick={onToggleCollapse}
            className={cn(
              'flex w-full items-center p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
              isCollapsed ? 'justify-center' : 'justify-end'
            )}
            type="button"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
