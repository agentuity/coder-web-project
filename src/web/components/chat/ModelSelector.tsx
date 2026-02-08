import { Cpu } from 'lucide-react';

const MODELS = [
  { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'openai/codex-5-2', label: 'Codex 5.2' },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Cpu className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none outline-none pr-4 dark:[color-scheme:dark]"
        title="Select model"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value} className="bg-[var(--popover)] text-[var(--popover-foreground)]">
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
