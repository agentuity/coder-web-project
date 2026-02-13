import { useMemo } from 'react';
import { Command } from 'cmdk';
import { cn } from '../lib/utils';
import { formatShortcut } from '../lib/shortcuts';

export interface CommandPaletteAction {
  id: string;
  label: string;
  description?: string;
  group: string;
  keywords?: string[];
  shortcutKeys?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandPaletteAction[];
  placeholder?: string;
}

const GROUP_ORDER = ['Navigation', 'Actions', 'View', 'Editor', 'Sessions', 'General', 'Chat'];

export function CommandPalette({ open, onOpenChange, actions, placeholder }: CommandPaletteProps) {
  const groupedActions = useMemo(() => {
    const groups = new Map<string, CommandPaletteAction[]>();
    for (const action of actions) {
      if (!groups.has(action.group)) {
        groups.set(action.group, []);
      }
      groups.get(action.group)?.push(action);
    }
    return groups;
  }, [actions]);

  const orderedGroups = useMemo(() => {
    const entries = Array.from(groupedActions.entries());
    return entries.sort((a, b) => {
      const aIndex = GROUP_ORDER.indexOf(a[0]);
      const bIndex = GROUP_ORDER.indexOf(b[0]);
      if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [groupedActions]);

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command Palette">
      <Command.Input
        placeholder={placeholder ?? 'Type a command or search...'}
        className="w-full"
        autoFocus
      />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        {orderedGroups.map(([groupName, groupActions], index) => (
          <div key={groupName}>
            {index > 0 && <Command.Separator />}
            <Command.Group heading={groupName}>
              {groupActions.map((action) => {
                const displayShortcut = action.shortcutKeys ? formatShortcut(action.shortcutKeys) : null;
                const value = [action.label, action.description, ...(action.keywords ?? [])]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <Command.Item
                    key={action.id}
                    value={value}
                    onSelect={() => {
                      action.onSelect();
                      onOpenChange(false);
                    }}
                    disabled={action.disabled}
                    className={cn('flex items-center gap-3', action.disabled && 'opacity-60')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-[var(--foreground)]">{action.label}</div>
                        {action.description && (
                          <div className="truncate text-xs text-[var(--muted-foreground)]">
                            {action.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {displayShortcut && (
                      <span className="ml-3 shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                        {displayShortcut}
                      </span>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          </div>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
