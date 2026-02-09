import { FileText, Link2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type SourceItem = {
  type: 'file' | 'url';
  label: string;
  href?: string;
};

interface SourcesViewProps {
  sources: SourceItem[];
  className?: string;
}

export function SourcesView({ sources, className }: SourcesViewProps) {
  if (!sources.length) return null;

  return (
    <div className={cn('space-y-1 px-3 py-2', className)}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        Sources
      </div>
      <ul className="space-y-1 text-xs">
        {sources.map((source) => (
          <li key={`${source.type}-${source.label}`} className="flex items-center gap-2">
            {source.type === 'file' ? (
              <FileText className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            ) : (
              <Link2 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            )}
            {source.href ? (
              <a
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[var(--primary)] hover:underline"
                title={source.label}
              >
                {source.label}
              </a>
            ) : (
              <span className="truncate text-[var(--foreground)]" title={source.label}>
                {source.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
