import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown, Terminal } from 'lucide-react';

interface PickerItem {
  value: string;
  label: string;
  description: string;
}

const CHAT_OPTION: PickerItem = { value: '', label: 'Chat', description: 'Direct AI conversation' };

const AGENTS: PickerItem[] = [
  { value: '/agentuity-coder', label: 'Agentuity Coder', description: 'Full agent team' },
  { value: '/agentuity-cadence', label: 'Cadence', description: 'Autonomous loop' },
];

const COMMANDS: PickerItem[] = [
  { value: '/agentuity-memory-save', label: 'Save Memory', description: 'Save session' },
  { value: '/agentuity-memory-share', label: 'Share Memory', description: 'Share memory' },
  { value: '/agentuity-cloud', label: 'Cloud', description: 'Cloud services' },
  { value: '/agentuity-sandbox', label: 'Sandbox', description: 'Isolated execution' },
];

const ALL_ITEMS = [CHAT_OPTION, ...AGENTS, ...COMMANDS];

interface CommandPickerProps {
  value: string;
  onChange: (command: string) => void;
  /** Hide slash commands — only show agents. Used on the home page. */
  hideCommands?: boolean;
}

export function CommandPicker({ value, onChange, hideCommands }: CommandPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => ALL_ITEMS.find((item) => item.value === value) ?? CHAT_OPTION,
    [value],
  );

  const isCommand = COMMANDS.some((cmd) => cmd.value === value);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (item: PickerItem) => {
    onChange(item.value);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
        title="Select agent"
        aria-label="Select agent"
      >
        {isCommand ? (
          <Terminal className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        )}
        <span className="hidden md:inline">{selected.label}</span>
        <span className="hidden md:inline">
          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        </span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[calc(100vw-2rem)] max-w-[90vw] rounded-md border border-[var(--border)] bg-[var(--popover)] p-2 text-xs shadow-lg md:w-56">
          {/* Chat (default) */}
          <button
            type="button"
            onClick={() => handleSelect(CHAT_OPTION)}
            className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] ${
              CHAT_OPTION.value === value ? 'bg-[var(--muted)]' : ''
            }`}
          >
            <span className="text-xs text-[var(--foreground)]">{CHAT_OPTION.label}</span>
            <span className="text-[10px] text-[var(--muted-foreground)]">{CHAT_OPTION.description}</span>
          </button>

          {/* Agents section */}
          <div className="my-2 border-t border-[var(--border)]" />
          <div className="mb-1 px-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Agents</div>
          {AGENTS.map((agent) => (
            <button
              key={agent.value}
              type="button"
              onClick={() => handleSelect(agent)}
              className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] ${
                agent.value === value ? 'bg-[var(--muted)]' : ''
              }`}
            >
              <span className="text-xs text-[var(--foreground)]">{agent.label}</span>
              <span className="text-[10px] text-[var(--muted-foreground)]">{agent.description}</span>
            </button>
          ))}

          {/* Commands section — hidden on home page */}
          {!hideCommands && (
            <>
              <div className="my-2 border-t border-[var(--border)]" />
              <div className="mb-1 px-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Commands</div>
              {COMMANDS.map((cmd) => (
                <button
                  key={cmd.value}
                  type="button"
                  onClick={() => handleSelect(cmd)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] ${
                    cmd.value === value ? 'bg-[var(--muted)]' : ''
                  }`}
                >
                  <Terminal className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
                  <div className="flex flex-col">
                    <span className="text-xs text-[var(--muted-foreground)]">{cmd.label}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]/60">{cmd.description}</span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
