import { Plus, Sparkles, Plug, Settings, Star, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

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
  onNavigate: (page: 'skills' | 'sources' | 'settings') => void;
  onFlagSession?: (id: string, flagged: boolean) => void;
  onRetrySession?: (id: string) => void;
  currentPage: string;
  isMobileOpen?: boolean;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500';
    case 'creating': return 'bg-yellow-500 animate-pulse';
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
  currentPage,
  isMobileOpen,
}: SidebarProps) {
  return (
    <div
      className={cn(
        'flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--card)]',
        isMobileOpen
          ? 'absolute inset-y-0 left-0 z-40 flex md:static md:flex'
          : 'hidden md:flex',
      )}
    >
      <div className="p-3">
        <Button onClick={onNewSession} className="w-full" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Session
        </Button>
      </div>
      
      <Separator />
      
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] ${
                activeSessionId === session.id ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'text-[var(--foreground)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="flex flex-1 items-center gap-2 truncate text-left"
              >
                <div className={`h-2 w-2 rounded-full ${getStatusColor(session.status)}`} />
                <div className="flex-1 truncate">
                  {session.title || 'Untitled Session'}
                </div>
              </button>
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
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
              No sessions yet. Create one to get started.
            </p>
          )}
        </div>
      </ScrollArea>
      
      <Separator />
      
      <div className="p-2 space-y-1">
        <button
          type="button"
          onClick={() => onNavigate('skills')}
          className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] ${currentPage === 'skills' ? 'bg-[var(--accent)]' : ''}`}
        >
          <Sparkles className="h-4 w-4" />
          Skills
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sources')}
          className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] ${currentPage === 'sources' ? 'bg-[var(--accent)]' : ''}`}
        >
          <Plug className="h-4 w-4" />
          Sources
        </button>
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] ${currentPage === 'settings' ? 'bg-[var(--accent)]' : ''}`}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
