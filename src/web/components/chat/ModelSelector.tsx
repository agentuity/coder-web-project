import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';

const MODEL_GROUPS = [
  {
    provider: 'Anthropic',
    providerID: 'anthropic',
    color: 'bg-[#d0a8ff]',
    models: [
      {
        value: 'anthropic/claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        capabilities: ['reasoning', 'code', 'vision'],
      },
      {
        value: 'anthropic/claude-opus-4-6',
        label: 'Claude Opus 4.6',
        capabilities: ['reasoning', 'code', 'vision'],
      },
    ],
  },
  {
    provider: 'OpenAI',
    providerID: 'openai',
    color: 'bg-[#7dd3fc]',
    models: [
      {
        value: 'openai/codex-5-2',
        label: 'Codex 5.2',
        capabilities: ['code', 'tools'],
      },
    ],
  },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const allModels = useMemo(
    () => MODEL_GROUPS.flatMap((group) => group.models.map((model) => ({ ...model, group }))),
    []
  );

  const fallbackGroup = MODEL_GROUPS[0] ?? {
    provider: 'Model',
    providerID: 'model',
    color: 'bg-[var(--muted)]',
    models: [],
  };
  const fallback = allModels[0] ?? {
    value: value,
    label: value,
    capabilities: ['model'],
    group: fallbackGroup,
  };
  const selected = allModels.find((model) => model.value === value) ?? fallback;

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
			title="Select model"
			aria-label="Select model"
		>
			<Cpu className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
			<span className="inline-flex items-center gap-1.5">
				<span className={`h-2 w-2 rounded-full ${selected.group.color}`} />
				<span className="hidden md:inline">{selected.label}</span>
			</span>
			<span className="hidden md:inline">
				<ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
			</span>
		</button>

      {open && (
			<div className="absolute bottom-full left-0 z-50 mb-2 w-[calc(100vw-2rem)] rounded-md border border-[var(--border)] bg-[var(--popover)] p-2 text-xs shadow-lg md:w-64">
          {MODEL_GROUPS.map((group) => (
            <div key={group.providerID} className="mb-2 last:mb-0">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                <span className={`h-2 w-2 rounded-full ${group.color}`} />
                {group.provider}
              </div>
              <div className="space-y-1">
                {group.models.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => {
                      onChange(model.value);
                      setOpen(false);
                    }}
                    className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--muted)] ${
                      model.value === value ? 'bg-[var(--muted)]' : ''
                    }`}
                  >
                    <span className="text-xs text-[var(--foreground)]">{model.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
