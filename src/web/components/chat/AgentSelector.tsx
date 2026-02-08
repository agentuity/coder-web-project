import { Zap } from 'lucide-react';

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
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Zap className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none outline-none pr-4 dark:[color-scheme:dark]"
        title="Select command mode"
      >
        {COMMANDS.map((cmd) => (
          <option key={cmd.value} value={cmd.value} className="bg-[var(--popover)] text-[var(--popover-foreground)]">
            {cmd.label}
          </option>
        ))}
      </select>
    </div>
  );
}
