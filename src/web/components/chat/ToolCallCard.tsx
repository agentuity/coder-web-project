import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Clock, Wrench } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { ToolPart } from '../../types/opencode';

interface ToolCallCardProps {
  part: ToolPart;
}

function getToolDisplayName(tool: string): string {
  return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getStatusInfo(status: string) {
  switch (status) {
    case 'pending':
      return { icon: Clock, color: 'text-yellow-500', label: 'Pending', animate: false };
    case 'running':
      return { icon: Loader2, color: 'text-blue-500', label: 'Running', animate: true };
    case 'completed':
      return { icon: CheckCircle2, color: 'text-green-500', label: 'Completed', animate: false };
    case 'error':
      return { icon: XCircle, color: 'text-red-500', label: 'Error', animate: false };
    default:
      return { icon: Wrench, color: 'text-[var(--muted-foreground)]', label: status, animate: false };
  }
}

// ---------------------------------------------------------------------------
// Tool-type detection helpers
// ---------------------------------------------------------------------------

function isEditTool(input: Record<string, unknown>): input is Record<string, unknown> & {
  filePath: string;
  oldString: string;
  newString: string;
} {
  return (
    typeof input.filePath === 'string' &&
    typeof input.oldString === 'string' &&
    typeof input.newString === 'string'
  );
}

function isBashTool(input: Record<string, unknown>): input is Record<string, unknown> & {
  command: string;
} {
  return typeof input.command === 'string';
}

function isWriteTool(input: Record<string, unknown>): input is Record<string, unknown> & {
  filePath: string;
  content: string;
} {
  return (
    typeof input.filePath === 'string' &&
    typeof input.content === 'string' &&
    typeof input.oldString !== 'string'
  );
}

function isReadTool(input: Record<string, unknown>): input is Record<string, unknown> & {
  filePath: string;
} {
  return (
    typeof input.filePath === 'string' &&
    typeof input.oldString !== 'string' &&
    typeof input.content !== 'string' &&
    typeof input.command !== 'string'
  );
}

// ---------------------------------------------------------------------------
// Simple line-by-line diff computation
// ---------------------------------------------------------------------------

interface DiffLine {
  type: 'context' | 'removed' | 'added';
  text: string;
}

function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Find first differing line
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  // Find last differing line (from the end)
  let oldSuffix = oldLines.length;
  let newSuffix = newLines.length;
  while (
    oldSuffix > prefixLen &&
    newSuffix > prefixLen &&
    oldLines[oldSuffix - 1] === newLines[newSuffix - 1]
  ) {
    oldSuffix--;
    newSuffix--;
  }

  const result: DiffLine[] = [];

  // Context before (up to 3 lines)
  const ctxStart = Math.max(0, prefixLen - 3);
  for (let i = ctxStart; i < prefixLen; i++) {
    result.push({ type: 'context', text: oldLines[i] ?? '' });
  }

  // Removed lines
  for (let i = prefixLen; i < oldSuffix; i++) {
    result.push({ type: 'removed', text: oldLines[i] ?? '' });
  }

  // Added lines
  for (let i = prefixLen; i < newSuffix; i++) {
    result.push({ type: 'added', text: newLines[i] ?? '' });
  }

  // Context after (up to 3 lines)
  const ctxEnd = Math.min(oldLines.length, oldSuffix + 3);
  for (let i = oldSuffix; i < ctxEnd; i++) {
    result.push({ type: 'context', text: oldLines[i] ?? '' });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Specialised sub-views
// ---------------------------------------------------------------------------

function shortenPath(filePath: string): string {
  // Show at most the last 3 segments
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return '…/' + parts.slice(-3).join('/');
}

function DiffView({ filePath, oldString, newString }: { filePath: string; oldString: string; newString: string }) {
  const lines = computeDiff(oldString, newString);
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
        <span>📝</span>
        <span className="font-mono truncate" title={filePath}>{shortenPath(filePath)}</span>
      </div>
      <div className="rounded-md border border-[var(--border)] overflow-hidden max-h-72 overflow-y-auto overflow-x-auto">
        <div className="min-w-fit">
          {lines.map((line, i) => {
            let bg = 'bg-transparent';
            let fg = 'text-[var(--muted-foreground)]';
            let prefix = ' ';
            if (line.type === 'removed') {
              bg = 'bg-red-500/15';
              fg = 'text-red-400';
              prefix = '-';
            } else if (line.type === 'added') {
              bg = 'bg-green-500/15';
              fg = 'text-green-400';
              prefix = '+';
            }
            return (
              <div key={`${line.type}-${i}`} className={`${bg} ${fg} px-2 font-mono text-[10px] leading-[1.7] whitespace-pre`}>
                <span className="select-none opacity-60 mr-2 inline-block w-3 text-center">{prefix}</span>
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BashView({ command, output }: { command: string; output?: string }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {/* Command */}
      <div className="rounded-md bg-[#1a1a2e] border border-[var(--border)] px-3 py-2 font-mono text-xs text-green-400 whitespace-pre-wrap break-all">
        <span className="select-none text-[var(--muted-foreground)] mr-1">$</span>
        {command}
      </div>
      {/* Output */}
      {output && (
        <div>
          <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">Output</div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-64 overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

function WriteView({ filePath, content, output }: { filePath: string; content: string; output?: string }) {
  const lines = content.split('\n');
  const preview = lines.slice(0, 20);
  const truncated = lines.length > 20;
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
        <span>📄</span>
        <span className="font-mono truncate" title={filePath}>{shortenPath(filePath)}</span>
        <span className="ml-auto text-[10px]">{lines.length} lines</span>
      </div>
      <div className="rounded-md border border-[var(--border)] overflow-hidden max-h-64 overflow-auto">
        <pre className="text-[11px] leading-[1.6] font-mono m-0 px-2 py-1 text-green-400 bg-green-500/5">
          {/* biome-ignore lint/suspicious/noArrayIndexKey: stable line-number list */}
          {preview.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="select-none opacity-40 mr-2 inline-block w-5 text-right">{i + 1}</span>
              {line}
            </div>
          ))}
          {truncated && (
            <div className="text-[var(--muted-foreground)] italic mt-1">… {lines.length - 20} more lines</div>
          )}
        </pre>
      </div>
      {output && (
        <div className="mt-2">
          <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">Output</div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-32 overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

function ReadView({ filePath, output }: { filePath: string; output?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
        <span>📖</span>
        <span className="font-mono truncate" title={filePath}>Read: {shortenPath(filePath)}</span>
      </div>
      {output && (
        <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-64 overflow-auto rounded-md border border-[var(--border)] px-2 py-1">
          {output}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default JSON fallback (original behaviour)
// ---------------------------------------------------------------------------

function DefaultView({ input, output }: { input: Record<string, unknown>; output?: string }) {
  return (
    <>
      <div className="px-3 py-2">
        <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">Input</div>
        <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-48 overflow-auto">
          {JSON.stringify(input, null, 2)}
        </pre>
      </div>
      {output !== undefined && (
        <div className="border-t border-[var(--border)] px-3 py-2">
          <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">Output</div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-64 overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ToolCallCard({ part }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = getStatusInfo(part.state.status);
  const StatusIcon = statusInfo.icon;

  const title = ('title' in part.state && part.state.title) ? part.state.title : getToolDisplayName(part.tool);
  const duration = ('time' in part.state && part.state.time && 'end' in part.state.time)
    ? (((part.state.time as { start: number; end: number }).end - part.state.time.start) / 1000).toFixed(1)
    : null;

  const input = part.state.input;
  const output = 'output' in part.state ? part.state.output : undefined;

  // Determine which specialised view to use
  function renderBody() {
    if (isEditTool(input)) {
      return (
        <>
          <DiffView filePath={input.filePath} oldString={input.oldString} newString={input.newString} />
          {output && (
            <div className="border-t border-[var(--border)] px-3 py-1">
              <span className="font-mono text-[10px] text-green-500">{output}</span>
            </div>
          )}
        </>
      );
    }

    if (isBashTool(input)) {
      return <BashView command={input.command} output={output} />;
    }

    if (isWriteTool(input)) {
      return <WriteView filePath={input.filePath} content={input.content} output={output} />;
    }

    if (isReadTool(input)) {
      return <ReadView filePath={input.filePath} output={output} />;
    }

    // Fallback: raw JSON (original behaviour)
    return <DefaultView input={input} output={part.state.status === 'completed' ? output : undefined} />;
  }

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
      >
        <StatusIcon className={`h-4 w-4 ${statusInfo.color} ${statusInfo.animate ? 'animate-spin' : ''}`} />
        <span className="font-medium text-[var(--foreground)] truncate">{title}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {part.tool}
        </Badge>
        {duration && (
          <span className="text-xs text-[var(--muted-foreground)]">{duration}s</span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--muted)]">
          {renderBody()}
          {/* Error */}
          {part.state.status === 'error' && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <div className="text-[10px] font-medium uppercase text-red-500 mb-1">Error</div>
              <pre className="whitespace-pre-wrap font-mono text-xs text-red-400">
                {part.state.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
