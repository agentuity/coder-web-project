import { ChevronDown, GitBranch } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
import type { SubtaskPart } from '../../types/opencode';

interface SubtaskViewProps {
  part: SubtaskPart;
}

export function SubtaskView({ part }: SubtaskViewProps) {
  return (
    <Collapsible className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--accent)]">
        <GitBranch className="h-4 w-4 text-[var(--primary)]" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--foreground)] truncate">{part.description}</div>
        </div>
        <Badge variant="secondary" className="text-[10px]">{part.agent}</Badge>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)] transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-[var(--border)] px-3 py-2">
        <div className="text-xs text-[var(--muted-foreground)]">{part.prompt}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
