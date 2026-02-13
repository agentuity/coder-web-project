import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { SHORTCUTS, getSessionIndexShortcuts, type ShortcutDef } from '../lib/shortcuts';

const STORAGE_KEY = 'agentuity-keybindings';

// Store custom overrides only (shortcutId -> keys string)
type KeybindingOverrides = Record<string, string>;

// Module-level state so all hook instances share the same data
let overrides: KeybindingOverrides = loadOverrides();
const listeners: Set<() => void> = new Set();

function loadOverrides(): KeybindingOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveOverrides(next: KeybindingOverrides) {
  overrides = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): KeybindingOverrides {
  return overrides;
}

/** Get all shortcuts with custom overrides applied */
export function useKeybindings() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Merge defaults with overrides
  const shortcuts = useMemo(() => {
    const all = [...SHORTCUTS, ...getSessionIndexShortcuts()];
    return all.map((s) => ({
      ...s,
      keys: current[s.id] ?? s.keys,
      isCustom: s.id in current,
      defaultKeys: s.keys,
    }));
  }, [current]);

  // Get the effective keys for a specific shortcut id
  const getKeys = useCallback(
    (id: string): string => {
      const def = SHORTCUTS.find((s) => s.id === id)
        ?? getSessionIndexShortcuts().find((s) => s.id === id);
      if (!def) return '';
      return current[id] ?? def.keys;
    },
    [current]
  );

  // Set a custom binding
  const setBinding = useCallback((id: string, keys: string) => {
    saveOverrides({ ...overrides, [id]: keys });
  }, []);

  // Reset a single binding to default
  const resetBinding = useCallback((id: string) => {
    const next = { ...overrides };
    delete next[id];
    saveOverrides(next);
  }, []);

  // Reset all bindings to defaults
  const resetAll = useCallback(() => {
    saveOverrides({});
  }, []);

  return { shortcuts, getKeys, setBinding, resetBinding, resetAll };
}
