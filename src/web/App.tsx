import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { CommandPaletteAction } from './components/CommandPalette';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { AppShell } from './components/shell/AppShell';
import { useAppContext } from './context/AppContext';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useKeybindings } from './hooks/useKeybindings';

export function AppLayout() {
  const {
    sessions,
    activeSessionId,
    commandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette,
    openShortcutsHelp,
    closeShortcutsHelp,
    shortcutsHelpOpen,
    handleToggleTheme,
    toggleSidebar,
  } = useAppContext();

  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const viewMode = (searchParams.get('v') as 'chat' | 'ide' | null) ?? 'chat';
  const sidebarTab = (searchParams.get('tab') as 'files' | 'git' | 'env' | null) ?? 'files';

  const focusChatInput = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-prompt-input="true"]');
    if (!textarea) return false;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    return true;
  }, []);

  const handleCommandPaletteOpenChange = useCallback((open: boolean) => {
    setCommandPaletteOpen(open);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      lastActiveElementRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    if (restoreFocusRef.current) {
      lastActiveElementRef.current?.focus?.();
    }
    restoreFocusRef.current = true;
  }, [commandPaletteOpen]);

  const handleFocusChat = useCallback(() => {
    restoreFocusRef.current = false;
    if (focusChatInput()) return;
    if (!activeSessionId) return;
    if (viewMode !== 'chat') {
      navigate({
        to: '/session/$sessionId',
        params: { sessionId: activeSessionId },
        search: (prev) => ({ ...prev, v: 'chat' }),
      });
      setTimeout(() => {
        focusChatInput();
      }, 50);
    }
  }, [activeSessionId, focusChatInput, navigate, viewMode]);

  const handleToggleView = useCallback(() => {
    if (!activeSessionId) return;
    const next = viewMode === 'ide' ? 'chat' : 'ide';
    navigate({
      to: '/session/$sessionId',
      params: { sessionId: activeSessionId },
      search: (prev) => ({ ...prev, v: next }),
    });
  }, [activeSessionId, navigate, viewMode]);

  const handleToggleSidebarTab = useCallback(() => {
    if (!activeSessionId) return;
    const nextTab = sidebarTab === 'files' ? 'git' : 'files';
    navigate({
      to: '/session/$sessionId',
      params: { sessionId: activeSessionId },
      search: (prev) => ({ ...prev, tab: nextTab }),
    });
  }, [activeSessionId, navigate, sidebarTab]);

  const handleCloseActiveTab = useCallback(() => {
    if (!activeSessionId) return;
    window.dispatchEvent(new Event('app-close-active-tab'));
  }, [activeSessionId]);

  const handleOpenSettings = useCallback(() => {
    restoreFocusRef.current = false;
    navigate({ to: '/settings' });
  }, [navigate]);

  const handleNewSessionShortcut = useCallback(() => {
    restoreFocusRef.current = false;
    navigate({ to: '/' });
  }, [navigate]);

  const handleOpenShortcutsHelp = useCallback(() => {
    restoreFocusRef.current = false;
    openShortcutsHelp();
  }, [openShortcutsHelp]);

  const { getKeys } = useKeybindings();

  useAppShortcuts({
    toggleCommandPalette,
    newSession: handleNewSessionShortcut,
    toggleSidebar,
    openSettings: handleOpenSettings,
    toggleTheme: handleToggleTheme,
    showShortcutsHelp: handleOpenShortcutsHelp,
    openSessionAtIndex: (index) => {
      const session = sessions[index];
      if (!session) return;
      restoreFocusRef.current = false;
      navigate({ to: '/session/$sessionId', params: { sessionId: session.id } });
    },
  });

  const paletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      {
        id: 'new-session',
        label: 'New Session',
        description: 'Start a new chat session',
        group: 'Navigation',
        onSelect: handleNewSessionShortcut,
      },
      {
        id: 'settings',
        label: 'Settings',
        description: 'Open settings',
        group: 'Navigation',
        onSelect: handleOpenSettings,
      },
      {
        id: 'shortcuts-help',
        label: 'Keyboard Shortcuts',
        description: 'Show keyboard shortcuts reference',
        group: 'Actions',
        onSelect: handleOpenShortcutsHelp,
      },
      {
        id: 'focus-chat',
        label: 'Focus Chat',
        description: 'Focus the chat input',
        group: 'Actions',
        onSelect: handleFocusChat,
        disabled: !activeSessionId,
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        description: 'Show/hide the sidebar',
        group: 'View',
        onSelect: toggleSidebar,
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        description: 'Switch between light and dark theme',
        group: 'View',
        onSelect: handleToggleTheme,
      },
      {
        id: 'toggle-view',
        label: 'Toggle Code/Chat',
        description: 'Switch between code and chat view',
        group: 'View',
        onSelect: handleToggleView,
        disabled: !activeSessionId,
      },
      {
        id: 'toggle-sidebar-tab',
        label: 'Toggle Files/Git',
        description: 'Switch between files and git panel',
        group: 'Editor',
        onSelect: handleToggleSidebarTab,
        disabled: !activeSessionId || viewMode !== 'ide',
      },
      {
        id: 'close-tab',
        label: 'Close Tab',
        description: 'Close the active editor tab',
        group: 'Editor',
        onSelect: handleCloseActiveTab,
        disabled: !activeSessionId || viewMode !== 'ide',
      },
    ];

    const sessionActions: CommandPaletteAction[] = sessions.map((session, index) => ({
      id: `session-${session.id}`,
      label: session.title || 'Untitled Session',
      description: session.status === 'active' ? 'Active session' : 'Open session',
      group: 'Sessions',
      onSelect: () => {
        restoreFocusRef.current = false;
        navigate({ to: '/session/$sessionId', params: { sessionId: session.id } });
      },
      shortcutKeys: index < 9 ? `mod+${index + 1}` : undefined,
      keywords: ['session', 'chat'],
    }));

    return [...actions, ...sessionActions].map((action) => ({
      ...action,
      shortcutKeys: action.shortcutKeys ?? (getKeys(action.id) || undefined),
    }));
  }, [
    activeSessionId,
    getKeys,
    handleCloseActiveTab,
    handleFocusChat,
    handleNewSessionShortcut,
    handleOpenSettings,
    handleOpenShortcutsHelp,
    handleToggleSidebarTab,
    handleToggleView,
    handleToggleTheme,
    navigate,
    sessions,
    toggleSidebar,
    viewMode,
  ]);

  return (
    <>
      <AppShell />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={handleCommandPaletteOpenChange}
        actions={paletteActions}
      />
      <ShortcutsHelp open={shortcutsHelpOpen} onOpenChange={(open) => (open ? openShortcutsHelp() : closeShortcutsHelp())} />
    </>
  );
}
