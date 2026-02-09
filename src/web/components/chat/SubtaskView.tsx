import { useState } from 'react';
import { Bot, GitBranch, Terminal } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../ui/dialog';
import type { SubtaskPart } from '../../types/opencode';

interface SubtaskViewProps {
  part: SubtaskPart;
}

export function SubtaskView({ part }: SubtaskViewProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--accent)] hover:border-[var(--primary)] cursor-pointer"
        >
          <GitBranch className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
          <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[200px]">
            {part.description || 'Sub-agent task'}
          </span>
          {part.agent && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {part.agent}
            </Badge>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">
                {part.agent || 'Sub-agent'}
              </DialogTitle>
              {part.description && (
                <DialogDescription className="truncate">
                  {part.description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {/* Command */}
          {part.command && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Command
              </span>
              <div className="flex items-center gap-2 rounded-md bg-[var(--secondary)] px-3 py-2">
                <Terminal className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
                <code className="text-sm font-mono text-[var(--foreground)]">
                  {part.command}
                </code>
              </div>
            </div>
          )}

          {/* Prompt */}
          {part.prompt && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Prompt
              </span>
              <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3 max-h-[40vh] overflow-y-auto">
                <pre className="text-sm font-mono text-[var(--foreground)] whitespace-pre-wrap break-words">
                  {part.prompt}
                </pre>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
