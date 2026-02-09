import { useMemo, useState, useEffect } from 'react';
import type { ToolPart } from '../../types/opencode';
import { FileDiff as PierreDiff } from '@pierre/diffs/react';
import { parseDiffFromFile } from '@pierre/diffs';
import type { BundledLanguage } from 'shiki';
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from '../ai-elements/tool';
import type { ToolState, ToolStatus } from '../ai-elements/tool';

interface ToolCallCardProps {
  part: ToolPart;
}

function getToolDisplayName(tool: string): string {
  return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
// Language detection helper for @pierre/diffs
// ---------------------------------------------------------------------------

function getLangFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', md: 'markdown', css: 'css', html: 'html',
    yml: 'yaml', yaml: 'yaml', sh: 'bash', py: 'python',
    rs: 'rust', go: 'go', sql: 'sql', toml: 'toml',
  };
  return ext ? map[ext] : undefined;
}

// ---------------------------------------------------------------------------
// Parse read tool output — strip <file> tags and line number prefixes
// ---------------------------------------------------------------------------

function parseFileOutput(output: string): string {
  return output
    .replace(/^<file>\n?/, '')                  // Remove opening <file> tag
    .replace(/\n?\(End of file[^\)]*\)$/, '')   // Remove "(End of file - total N lines)"
    .replace(/\n?<\/file>$/, '')                // Remove closing </file> tag
    .split('\n')
    .map(line => line.replace(/^\d{5}\| ?/, ''))  // Remove "00001| " line number prefix
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Lazy Shiki highlighter singleton (shared with FileExplorer)
// ---------------------------------------------------------------------------

let _readHighlighterPromise: Promise<any> | null = null;

function getReadHighlighter() {
  if (!_readHighlighterPromise) {
    _readHighlighterPromise = import('shiki').then((shiki) =>
      shiki.createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: [
          'typescript', 'tsx', 'javascript', 'jsx', 'json', 'markdown',
          'css', 'html', 'yaml', 'bash', 'python', 'rust', 'go', 'sql', 'toml', 'xml',
        ],
      }),
    );
  }
  return _readHighlighterPromise;
}

function getLangForShiki(filePath: string): BundledLanguage | 'text' {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, BundledLanguage | 'text'> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', md: 'markdown', css: 'css', html: 'html',
    yml: 'yaml', yaml: 'yaml', sh: 'bash', bash: 'bash',
    py: 'python', rs: 'rust', go: 'go', sql: 'sql',
    toml: 'toml', xml: 'xml', svg: 'xml', txt: 'text',
  };
  return map[ext] || 'text';
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
  const lang = getLangFromPath(filePath) as any;
  const fileName = filePath.split('/').pop() || filePath;

  const diffData = useMemo(() => {
    try {
      return parseDiffFromFile(
        { name: fileName, contents: oldString, lang },
        { name: fileName, contents: newString, lang },
      );
    } catch {
      return null;
    }
  }, [fileName, oldString, newString, lang]);

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
        <span>📝</span>
        <span className="font-mono truncate" title={filePath}>{shortenPath(filePath)}</span>
      </div>
      <div className="rounded-md border border-[var(--border)] overflow-hidden max-h-72 overflow-y-auto overflow-x-auto [&_pre]:!text-[11px] [&_pre]:!leading-[1.6]">
        {diffData ? (
          <PierreDiff
            fileDiff={diffData}
            options={{
              theme: 'github-dark',
              disableFileHeader: true,
              diffStyle: 'unified',
              diffIndicators: 'bars',
            }}
          />
        ) : (
          <div className="px-2 py-1 text-xs text-[var(--muted-foreground)]">Unable to render diff</div>
        )}
      </div>
    </div>
  );
}

function BashView({ command, output }: { command: string; output?: string }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {/* Command */}
      <div className="rounded-md bg-[var(--muted)] border border-[var(--border)] px-3 py-2 font-mono text-xs text-green-400 dark:text-green-400 whitespace-pre-wrap break-all">
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
			{preview.map((line, i) => (
				<div key={`${i}-${line}`} className="whitespace-pre-wrap break-all">
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
  const parsed = useMemo(() => (output ? parseFileOutput(output) : ''), [output]);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const lang = getLangForShiki(filePath);

  useEffect(() => {
    if (!parsed || lang === 'text') return;
    let cancelled = false;
    getReadHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const html = highlighter.codeToHtml(parsed, {
          lang,
          theme: 'github-dark',
        });
        setHighlightedHtml(html);
      })
      .catch(() => { /* fallback to plain text */ });
    return () => { cancelled = true; };
  }, [parsed, lang]);

  const lines = parsed.split('\n');

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
        <span>📖</span>
        <span className="font-mono truncate" title={filePath}>Read: {shortenPath(filePath)}</span>
        <span className="ml-auto text-[10px]">{lines.length} lines</span>
      </div>
      {parsed && (
        <div className="rounded-md border border-[var(--border)] overflow-hidden max-h-64 overflow-y-auto overflow-x-auto">
          {highlightedHtml ? (
            <div
              className="file-viewer-shiki text-[11px] leading-[1.6] font-mono min-h-full [&_pre]:m-0 [&_pre]:p-2 [&_pre]:min-h-full [&_code]:!text-[11px] [&_.line]:before:content-[attr(data-line)] [&_.line]:before:text-[var(--muted-foreground)] [&_.line]:before:opacity-50 [&_.line]:before:text-right [&_.line]:before:inline-block [&_.line]:before:w-10 [&_.line]:before:pr-3 [&_.line]:before:select-none"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="text-[11px] leading-[1.6] font-mono m-0 px-2 py-1 text-[var(--foreground)] bg-[var(--muted)]">
              {parsed}
            </pre>
          )}
        </div>
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
	const title = ('title' in part.state && part.state.title) ? part.state.title : getToolDisplayName(part.tool);
	const duration = ('time' in part.state && part.state.time && 'end' in part.state.time)
		? (((part.state.time as { start: number; end: number }).end - part.state.time.start) / 1000).toFixed(1)
		: null;

  const input = part.state.input;
  const output = 'output' in part.state ? part.state.output : undefined;

	const toolState: ToolState = part.state.status === 'running'
		? 'partial-call'
		: part.state.status === 'pending'
			? 'call'
			: 'result';
	const toolStatus = part.state.status as ToolStatus;

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
		return (
			<>
				<ToolInput input={input} />
				{part.state.status === 'completed' && (
					<ToolOutput output={output} />
				)}
			</>
		);
	}

	return (
		<Tool defaultOpen={part.state.status === 'running' || part.state.status === 'pending'}>
			<ToolHeader
				meta={duration ? `${duration}s` : undefined}
				state={toolState}
				status={toolStatus}
				title={title}
				type={`tool-${part.tool}`}
			/>
			<ToolContent className="border-t border-[var(--border)] bg-[var(--muted)]">
				{renderBody()}
				{part.state.status === 'error' && (
					<div className="border-t border-[var(--border)] px-3 py-2">
						<div className="mb-1 text-[10px] font-medium uppercase text-red-500">Error</div>
						<pre className="whitespace-pre-wrap font-mono text-xs text-red-400">
							{part.state.error}
						</pre>
					</div>
				)}
			</ToolContent>
		</Tool>
	);
}
