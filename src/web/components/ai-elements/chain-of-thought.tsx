import type { ReactNode } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { ChevronDown, FileCode } from 'lucide-react';

interface ChainOfThoughtProps {
  filePath: string;
  stepCount: number;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ChainOfThought({
  filePath,
  stepCount,
  children,
  defaultOpen = true,
}: ChainOfThoughtProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="mb-2 rounded-md border border-[var(--border)] bg-[var(--card)]"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <FileCode className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <span className="text-xs font-medium">{filePath}</span>
          <span className="text-xs text-[var(--muted-foreground)]">{stepCount} steps</span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)] transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 space-y-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
