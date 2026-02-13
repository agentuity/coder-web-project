import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { useKeybindings } from '../../hooks/useKeybindings';
import { formatShortcut, type ShortcutDef } from '../../lib/shortcuts';

const GROUP_ORDER = ['General', 'Navigation', 'Chat', 'View', 'Editor', 'Sessions'];

// Convert a KeyboardEvent to a react-hotkeys-hook key string
function eventToKeys(e: KeyboardEvent): string | null {
  // Ignore lone modifier presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  // Map special keys
  const keyMap: Record<string, string> = {
    ',': 'comma',
    '.': 'period',
    '/': 'slash',
    ' ': 'space',
    '+': 'plus',
    '-': 'minus',
    Backspace: 'backspace',
    Enter: 'enter',
    Escape: 'escape',
  };

  const key = keyMap[e.key] ?? e.key.toLowerCase();
  parts.push(key);
  return parts.join('+');
}

interface ShortcutRowProps {
  shortcut: ShortcutDef & { isCustom: boolean; defaultKeys: string };
  recordingId: string | null;
  onStartRecording: (id: string) => void;
  onReset: (id: string) => void;
}

function ShortcutRow({ shortcut, recordingId, onStartRecording, onReset }: ShortcutRowProps) {
  const isRecording = recordingId === shortcut.id;
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-sm text-[var(--foreground)]">{shortcut.label}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{shortcut.description}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {shortcut.isCustom && (
          <button
            type="button"
            onClick={() => onReset(shortcut.id)}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
            title={`Reset to default (${formatShortcut(shortcut.defaultKeys)})`}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onStartRecording(shortcut.id)}
          className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
            isRecording
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] animate-pulse'
              : shortcut.isCustom
                ? 'border-[var(--primary)]/50 bg-[var(--primary)]/5 text-[var(--foreground)]'
                : 'border-[var(--border)] bg-[var(--muted)]/30 text-[var(--foreground)]'
          }`}
        >
          {isRecording ? 'Press keys...' : formatShortcut(shortcut.keys)}
        </button>
      </div>
    </div>
  );
}

export function KeybindingsSettings() {
  const { shortcuts, setBinding, resetBinding, resetAll } = useKeybindings();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);

  // Keep ref in sync for the keydown handler
  recordingRef.current = recordingId;

  const handleStartRecording = useCallback((id: string) => {
    setRecordingId(id);
  }, []);

  const handleReset = useCallback(
    (id: string) => {
      resetBinding(id);
    },
    [resetBinding]
  );

  // Global keydown listener for recording
  useEffect(() => {
    if (!recordingId) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecordingId(null);
        return;
      }

      const keys = eventToKeys(e);
      if (!keys) return; // Lone modifier press, keep recording

      setBinding(recordingRef.current!, keys);
      setRecordingId(null);
    };

    window.addEventListener('keydown', handler, true); // capture phase
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingId, setBinding]);

  // Click outside cancels recording
  useEffect(() => {
    if (!recordingId) return;
    const handler = () => setRecordingId(null);
    // Delay to avoid the click that started recording
    const timer = setTimeout(() => {
      window.addEventListener('click', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handler);
    };
  }, [recordingId]);

  // Group shortcuts
  const hasCustom = shortcuts.some((s) => s.isCustom);
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: shortcuts.filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {grouped.map(({ group, items }) => (
        <div key={group}>
          <div className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2">
            {group}
          </div>
          <div className="space-y-0.5">
            {items.map((shortcut) => (
              <ShortcutRow
                key={shortcut.id}
                shortcut={shortcut}
                recordingId={recordingId}
                onStartRecording={handleStartRecording}
                onReset={handleReset}
              />
            ))}
          </div>
        </div>
      ))}

      {hasCustom && (
        <div className="pt-3 border-t border-[var(--border)]">
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset All to Defaults
          </Button>
        </div>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">
        Click a shortcut to re-bind it. Press Escape to cancel. Some shortcuts may be intercepted by your browser.
      </p>
    </div>
  );
}
