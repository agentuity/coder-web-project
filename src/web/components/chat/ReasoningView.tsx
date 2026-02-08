import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import type { ReasoningPart } from '../../types/opencode';

interface ReasoningViewProps {
  part: ReasoningPart;
}

export function ReasoningView({ part }: ReasoningViewProps) {
  const [expanded, setExpanded] = useState(false);
  const duration = part.time.end ? ((part.time.end - part.time.start) / 1000).toFixed(1) : null;

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
      >
        <Brain className="h-3.5 w-3.5" />
        <span>Thinking{duration ? ` (${duration}s)` : '...'}</span>
        {expanded ? <ChevronDown className="ml-auto h-3.5 w-3.5" /> : <ChevronRight className="ml-auto h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--muted)] px-3 py-2">
          <pre className="whitespace-pre-wrap font-sans text-xs text-[var(--muted-foreground)] leading-relaxed">
            {part.text}
          </pre>
        </div>
      )}
    </div>
  );
}
