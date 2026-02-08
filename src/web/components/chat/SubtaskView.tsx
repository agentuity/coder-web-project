import { GitBranch } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { SubtaskPart } from '../../types/opencode';

interface SubtaskViewProps {
  part: SubtaskPart;
}

export function SubtaskView({ part }: SubtaskViewProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <GitBranch className="h-4 w-4 text-[var(--primary)]" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--foreground)] truncate">{part.description}</div>
      </div>
      <Badge variant="secondary" className="text-[10px]">{part.agent}</Badge>
    </div>
  );
}
