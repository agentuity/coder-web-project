import { useState } from 'react';
import { Bot, Terminal } from 'lucide-react';
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
  const status = (part as { status?: string }).status;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span className="text-xs font-medium text-[var(--foreground)] truncate">
              {part.agent || 'Sub-agent'}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">·</span>
            <span className="text-xs text-[var(--muted-foreground)] truncate">
              {part.description || 'Sub-agent task'}
            </span>
            {status && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                {status}
              </Badge>
            )}
          </div>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]">
              Details
            </Button>
          </DialogTrigger>
        </div>
        {part.command && (
          <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
            <Terminal className="h-3 w-3" />
            <span className="truncate">{part.command}</span>
          </div>
        )}
      </div>
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
