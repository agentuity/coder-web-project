import { GitCommit, FileEdit, FilePlus, FileX } from 'lucide-react';

interface CommitProps {
  hash?: string;
  message: string;
  files?: { path: string; status: 'added' | 'modified' | 'deleted' }[];
}

export function Commit({ hash, message, files }: CommitProps) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <GitCommit className="h-4 w-4 text-[var(--primary)]" />
        <span className="text-xs font-medium">{message}</span>
      </div>
      {hash && (
        <code className="text-[10px] text-[var(--muted-foreground)] font-mono">
          {hash.slice(0, 7)}
        </code>
      )}
      {files && files.length > 0 && (
        <div className="space-y-0.5">
          {files.map((file) => (
            <div key={`${file.status}-${file.path}`} className="flex items-center gap-1.5 text-xs">
              {file.status === 'added' ? (
                <FilePlus className="h-3 w-3 text-green-500" />
              ) : file.status === 'deleted' ? (
                <FileX className="h-3 w-3 text-red-500" />
              ) : (
                <FileEdit className="h-3 w-3 text-yellow-500" />
              )}
              <span className="text-[var(--muted-foreground)] font-mono">{file.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
