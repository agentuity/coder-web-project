import { Code2, LogOut, Menu, Moon, Sun, User } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { Button } from '../ui/button';

interface TopBarProps {
  userEmail?: string;
  userName?: string;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function TopBar({ userEmail, userName, theme, onToggleTheme, onToggleSidebar, isSidebarOpen }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4">
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="md:hidden"
            title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}
        <Code2 className="h-6 w-6 text-[var(--primary)]" />
        <h1 className="text-lg font-bold text-[var(--foreground)]">Agentuity Coder</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <User className="h-4 w-4" />
          <span>{userName || userEmail}</span>
        </div>
        {onToggleTheme && (
          <Button variant="ghost" size="icon" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => authClient.signOut()} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
