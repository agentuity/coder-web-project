export type ShortcutScope = 'global' | 'session' | 'ide';

export interface ShortcutDef {
  id: string;
  keys: string; // react-hotkeys-hook format: 'mod+k', 'mod+shift+e'
  label: string;
  description: string;
  scope: ShortcutScope;
  group: string; // For command palette grouping
  keywords?: string[]; // For palette search
}

export const SHORTCUTS: ShortcutDef[] = [
  // Command Palette
  {
    id: 'command-palette',
    keys: 'mod+k',
    label: 'Command Palette',
    description: 'Open command palette',
    scope: 'global',
    group: 'General',
  },
  {
    id: 'command-palette-alt',
    keys: 'mod+shift+p',
    label: 'Command Palette',
    description: 'Open command palette (alt)',
    scope: 'global',
    group: 'General',
  },

  // Navigation
  {
    id: 'new-session',
    keys: 'mod+shift+n',
    label: 'New Session',
    description: 'Start a new chat session',
    scope: 'global',
    group: 'Navigation',
    keywords: ['create', 'chat'],
  },
  {
    id: 'settings',
    keys: 'mod+shift+comma',
    label: 'Settings',
    description: 'Open settings',
    scope: 'global',
    group: 'Navigation',
  },
  {
    id: 'focus-chat',
    keys: 'mod+/',
    label: 'Focus Chat',
    description: 'Focus the chat input',
    scope: 'session',
    group: 'Chat',
    keywords: ['input', 'message', 'compose'],
  },

  // View
  {
    id: 'toggle-sidebar',
    keys: 'mod+b',
    label: 'Toggle Sidebar',
    description: 'Show/hide the sidebar',
    scope: 'global',
    group: 'View',
  },
  {
    id: 'toggle-view',
    keys: 'mod+shift+e',
    label: 'Toggle Code/Chat',
    description: 'Switch between code and chat view',
    scope: 'session',
    group: 'View',
    keywords: ['ide', 'editor'],
  },
  {
    id: 'toggle-theme',
    keys: 'mod+shift+l',
    label: 'Toggle Theme',
    description: 'Switch between light and dark theme',
    scope: 'global',
    group: 'View',
  },

  // IDE
  {
    id: 'close-tab',
    keys: 'mod+shift+w',
    label: 'Close Tab',
    description: 'Close the active editor tab',
    scope: 'ide',
    group: 'Editor',
  },
  {
    id: 'toggle-sidebar-tab',
    keys: 'mod+shift+f',
    label: 'Toggle Files/Git',
    description: 'Switch between files and git panel',
    scope: 'ide',
    group: 'Editor',
    keywords: ['sidebar', 'panel'],
  },

  // Shortcuts help
  {
    id: 'shortcuts-help',
    keys: 'mod+shift+slash',
    label: 'Keyboard Shortcuts',
    description: 'Show keyboard shortcuts reference',
    scope: 'global',
    group: 'General',
    keywords: ['help', 'keys', 'hotkeys'],
  },
];

export function getSessionIndexShortcuts(max = 9): ShortcutDef[] {
  return Array.from({ length: max }, (_, index) => ({
    id: `session-${index + 1}`,
    keys: `mod+${index + 1}`,
    label: `Go to Session ${index + 1}`,
    description: `Jump to session ${index + 1} in the list`,
    scope: 'global',
    group: 'Sessions',
    keywords: ['jump', 'switch'],
  }));
}

// Helper to format shortcut for display (Mod → ⌘ on Mac, Ctrl on others)
export function formatShortcut(keys: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const DISPLAY: Record<string, string> = {
    mod: isMac ? '⌘' : 'Ctrl',
    shift: isMac ? '⇧' : 'Shift',
    alt: isMac ? '⌥' : 'Alt',
    comma: ',',
    slash: '/',
    space: 'Space',
    plus: '+',
    minus: '-',
    period: '.',
    backspace: 'Backspace',
    enter: 'Enter',
    escape: 'Esc',
  };

  return keys
    .split('+')
    .map((part) => {
      const lower = part.trim().toLowerCase();
      if (DISPLAY[lower]) return DISPLAY[lower];
      return part.trim().toUpperCase();
    })
    .join(isMac ? ' ' : '+');
}

// Get shortcut by id
export function getShortcut(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.id === id);
}
