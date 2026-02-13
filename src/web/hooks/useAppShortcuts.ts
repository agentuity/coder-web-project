import { useHotkeys } from 'react-hotkeys-hook';
import { useKeybindings } from './useKeybindings';

export interface AppShortcutActions {
  toggleCommandPalette: () => void;
  newSession: () => void;
  toggleSidebar: () => void;
  openSettings: () => void;
  toggleTheme: () => void;
  showShortcutsHelp: () => void;
  openSessionAtIndex?: (index: number) => void;
}

export function useAppShortcuts(actions: AppShortcutActions) {
  const { getKeys } = useKeybindings();

  // Command palette (works from inputs and contenteditable)
  useHotkeys(
    [getKeys('command-palette'), getKeys('command-palette-alt')].filter(Boolean).join(', '),
    (event) => {
      event.preventDefault();
      actions.toggleCommandPalette();
    },
    {
      enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'],
      enableOnContentEditable: true,
    },
    [getKeys('command-palette'), getKeys('command-palette-alt')]
  );

  // New session
  useHotkeys(
    getKeys('new-session'),
    (event) => {
      event.preventDefault();
      actions.newSession();
    },
    { enableOnFormTags: false, enableOnContentEditable: false },
    [getKeys('new-session')]
  );

  // Toggle sidebar
  useHotkeys(
    getKeys('toggle-sidebar'),
    (event) => {
      event.preventDefault();
      actions.toggleSidebar();
    },
    { enableOnFormTags: false, enableOnContentEditable: false },
    [getKeys('toggle-sidebar')]
  );

  // Settings
  useHotkeys(
    getKeys('settings'),
    (event) => {
      event.preventDefault();
      actions.openSettings();
    },
    { enableOnFormTags: false, enableOnContentEditable: false },
    [getKeys('settings')]
  );

  // Theme toggle
  useHotkeys(
    getKeys('toggle-theme'),
    (event) => {
      event.preventDefault();
      actions.toggleTheme();
    },
    { enableOnFormTags: false, enableOnContentEditable: false },
    [getKeys('toggle-theme')]
  );

  // Shortcuts help
  useHotkeys(
    getKeys('shortcuts-help'),
    (event) => {
      event.preventDefault();
      actions.showShortcutsHelp();
    },
    { enableOnFormTags: false, enableOnContentEditable: false },
    [getKeys('shortcuts-help')]
  );

  // Session jump (mod+1 through mod+9)
  // These use default keys since they're dynamic and rarely customized
  useHotkeys(
    'mod+1, mod+2, mod+3, mod+4, mod+5, mod+6, mod+7, mod+8, mod+9',
    (event) => {
      if (!actions.openSessionAtIndex) return;
      const index = Number(event.key) - 1;
      if (!Number.isFinite(index) || index < 0 || index > 8) return;
      event.preventDefault();
      actions.openSessionAtIndex(index);
    },
    { enableOnFormTags: false, enableOnContentEditable: false }
  );
}
