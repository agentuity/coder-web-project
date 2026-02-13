import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { formatShortcut } from '../lib/shortcuts';
import { useKeybindings } from '../hooks/useKeybindings';

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUP_ORDER = ['General', 'Navigation', 'Chat', 'View', 'Editor', 'Sessions'];

export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  const { shortcuts } = useKeybindings();

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof shortcuts>();
    for (const shortcut of shortcuts) {
      if (!groups.has(shortcut.group)) {
        groups.set(shortcut.group, []);
      }
      groups.get(shortcut.group)?.push(shortcut);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const aIndex = GROUP_ORDER.indexOf(a[0]);
      const bIndex = GROUP_ORDER.indexOf(b[0]);
      if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [shortcuts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-6">
            {grouped.map(([group, items]) => (
              <div key={group}>
                <div className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                  {group}
                </div>
                <div className="mt-2 space-y-2">
                  {items.map((shortcut) => (
                    <div key={shortcut.id} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm text-[var(--foreground)]">{shortcut.label}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {shortcut.description}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium ${
                        shortcut.isCustom
                          ? 'border-[var(--primary)]/50 bg-[var(--primary)]/5 text-[var(--foreground)]'
                          : 'border-[var(--border)] bg-[var(--muted)]/30 text-[var(--foreground)]'
                      }`}>
                        {formatShortcut(shortcut.keys)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
