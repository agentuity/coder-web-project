import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';

const COMMANDS = [
  { value: '', label: 'Chat', description: 'Direct AI conversation' },
  { value: '/agentuity-coder', label: 'Agentuity Coder', description: 'Full agent team' },
  { value: '/agentuity-cadence', label: 'Cadence', description: 'Autonomous loop' },
  { value: '/agentuity-memory-save', label: 'Save Memory', description: 'Save session' },
  { value: '/agentuity-memory-share', label: 'Share Memory', description: 'Share memory' },
  { value: '/agentuity-cloud', label: 'Cloud', description: 'Cloud services' },
  { value: '/agentuity-sandbox', label: 'Sandbox', description: 'Isolated execution' },
  { value: '/review', label: 'Review', description: 'Review code' },
];

interface CommandPickerProps {
  value: string;
  onChange: (command: string) => void;
}

export function CommandPicker({ value, onChange }: CommandPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => COMMANDS.find((cmd) => cmd.value === value) ?? COMMANDS[0],
    [value]
  );

  const chatOption = COMMANDS[0] ?? { value: '', label: 'Chat', description: 'Direct AI conversation' };
  const agentOptions = COMMANDS.slice(1);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
        title="Select agent"
      >
        <Bot className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        <span>{selected?.label ?? 'Agent'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      </button>
      {open && (
        <div className="absolute bottom-full z-50 mb-2 w-56 rounded-md border border-[var(--border)] bg-[var(--popover)] p-2 text-xs shadow-lg">
          <button
            key={chatOption.value}
            type="button"
            onClick={() => {
              onChange(chatOption.value);
              setOpen(false);
            }}
            className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] ${
              chatOption.value === value ? 'bg-[var(--muted)]' : ''
            }`}
          >
            <span className="text-xs text-[var(--foreground)]">{chatOption.label}</span>
            <span className="text-[10px] text-[var(--muted-foreground)]">{chatOption.description}</span>
          </button>
          <div className="my-2 border-t border-[var(--border)]" />
          <div className="mb-1 px-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Agent Teams</div>
          {agentOptions.map((cmd) => (
            <button
              key={cmd.value}
              type="button"
              onClick={() => {
                onChange(cmd.value);
                setOpen(false);
              }}
              className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] ${
                cmd.value === value ? 'bg-[var(--muted)]' : ''
              }`}
            >
              <span className="text-xs text-[var(--foreground)]">{cmd.label}</span>
              <span className="text-[10px] text-[var(--muted-foreground)]">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
