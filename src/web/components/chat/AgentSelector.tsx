import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';

const COMMANDS = [
  { value: '/agentuity-coder', label: 'Agentuity Coder', description: 'Full agent team' },
  { value: '/agentuity-cadence', label: 'Cadence', description: 'Autonomous loop' },
  { value: '/agentuity-memory-save', label: 'Save Memory', description: 'Save session to memory' },
  { value: '/agentuity-memory-share', label: 'Share Memory', description: 'Share memory publicly' },
  { value: '/agentuity-cloud', label: 'Cloud Services', description: 'KV, Storage, Vector, DB' },
  { value: '/agentuity-sandbox', label: 'Sandbox', description: 'Isolated execution' },
  { value: '/review', label: 'Review', description: 'Review code changes' },
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
          {COMMANDS.map((cmd) => (
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
