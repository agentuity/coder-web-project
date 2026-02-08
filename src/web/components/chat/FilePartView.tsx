import { FileText } from 'lucide-react';
import type { FilePart } from '../../types/opencode';

interface FilePartViewProps {
  part: FilePart;
}

export function FilePartView({ part }: FilePartViewProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
      <FileText className="h-3.5 w-3.5" />
      <span className="font-mono">{part.filename || part.url}</span>
    </div>
  );
}
