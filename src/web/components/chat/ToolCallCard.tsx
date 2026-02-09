import { useMemo, useState, useEffect, useRef } from 'react';
import type { ToolPart } from '../../types/opencode';
import { FileDiff as PierreDiff } from '@pierre/diffs/react';
import { parseDiffFromFile, type DiffLineAnnotation, type SelectedLineRange } from '@pierre/diffs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { getLangFromPath } from '../../lib/shiki';
import { parseFileOutput } from '../../lib/file-output';
import { CodeWithComments } from './CodeWithComments';
import type { CodeComment } from '../../hooks/useCodeComments';
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
	onOpenDiff?: (filePath: string, oldString: string, newString: string) => void;
	onOpenWrite?: (filePath: string, content: string) => void;
	onOpenRead?: (filePath: string, content: string) => void;
	onOpenFile?: (filePath: string) => void;
	onAddComment?: (file: string, selection: SelectedLineRange, comment: string, origin: 'diff' | 'file') => void;
	getDiffAnnotations?: (file: string) => DiffLineAnnotation<{ id: string; comment: string }>[];
	getFileComments?: (file: string) => CodeComment[];
	onSendMessage?: (text: string) => void;
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

function isWebFetchTool(input: Record<string, unknown>): input is Record<string, unknown> & {
	url: string;
} {
	return typeof input.url === 'string';
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

function isAgentInvocation(input: Record<string, unknown>): input is Record<string, unknown> & {
	subagent_type: string;
	description?: string;
	prompt?: string;
} {
	return typeof input.subagent_type === 'string';
}

// ---------------------------------------------------------------------------
// Language detection helper for @pierre/diffs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Parse read tool output — strip <file> tags and line number prefixes
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Specialised sub-views
// ---------------------------------------------------------------------------

function shortenPath(filePath: string): string {
  // Show at most the last 3 segments
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return '…/' + parts.slice(-3).join('/');
}

function getAgentBadge(agent: string) {
	const normalized = agent.replace('Agentuity Coder ', '').trim();
	const labels: Record<string, string> = {
		Lead: 'Lead',
		Scout: 'Scout',
		Builder: 'Builder',
		Architect: 'Architect',
		Reviewer: 'Reviewer',
		Memory: 'Memory',
		Expert: 'Expert',
		Runner: 'Runner',
		Product: 'Product',
	};
	return labels[normalized] ?? normalized;
}

function AgentInvocationView({ input }: { input: { subagent_type: string; description?: string; prompt?: string } }) {
	const agentLabel = getAgentBadge(input.subagent_type);
	return (
		<div className="px-3 py-2">
			<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
				<span>🤖</span>
				<Badge variant="secondary" className="text-[10px]">{agentLabel}</Badge>
				<span className="truncate">{input.description ?? 'Agent task'}</span>
			</div>
			{input.prompt && (
				<div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-2 text-xs text-[var(--foreground)] whitespace-pre-wrap">
					{input.prompt}
				</div>
			)}
		</div>
	);
}

function DiffView({
	filePath,
	oldString,
	newString,
	onAddComment,
	annotations,
}: {
	filePath: string;
	oldString: string;
	newString: string;
	onAddComment?: (file: string, selection: SelectedLineRange, comment: string, origin: 'diff' | 'file') => void;
	annotations?: DiffLineAnnotation<{ id: string; comment: string }>[];
}) {
	const lang = getLangFromPath(filePath) as any;
	const fileName = filePath.split('/').pop() || filePath;
	const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
	const [commentText, setCommentText] = useState('');

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

	const handleAddComment = () => {
		if (!onAddComment || !selectedRange) return;
		const trimmed = commentText.trim();
		if (!trimmed) return;
		onAddComment(filePath, selectedRange, trimmed, 'diff');
		setCommentText('');
		setSelectedRange(null);
	};

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
						selectedLines={selectedRange}
						lineAnnotations={annotations}
						renderAnnotation={(annotation) => (
							<div className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] text-[var(--foreground)] shadow-sm">
								{annotation.metadata?.comment ?? 'Comment'}
							</div>
						)}
						options={{
							theme: { dark: 'github-dark', light: 'github-light' },
							themeType: 'system',
							disableFileHeader: true,
							diffStyle: 'unified',
							diffIndicators: 'bars',
							enableLineSelection: true,
							onLineSelected: (range) => setSelectedRange(range),
						}}
					/>
				) : (
					<div className="px-2 py-1 text-xs text-[var(--muted-foreground)]">Unable to render diff</div>
				)}
			</div>
			{onAddComment && selectedRange && (
				<div className="mt-2 flex gap-2">
					<input
						value={commentText}
						onChange={(event) => setCommentText(event.target.value)}
						placeholder="Add a comment"
						className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
					/>
					<Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleAddComment}>
						Add
					</Button>
				</div>
			)}
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

function FileListView({ title, output }: { title: string; output?: string }) {
	const items = output ? output.split('\n').filter(Boolean) : [];
	return (
		<div className="px-3 py-2">
			<div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-2">{title}</div>
			{items.length === 0 ? (
				<div className="text-xs text-[var(--muted-foreground)]">No results</div>
			) : (
				<ul className="space-y-1 text-xs text-[var(--foreground)]">
					{items.map((item) => (
						<li key={item} className="font-mono truncate" title={item}>{item}</li>
					))}
				</ul>
			)}
		</div>
	);
}

function WebFetchView({ url, output }: { url: string; output?: string }) {
	const preview = output ? output.slice(0, 400) : '';
	return (
		<div className="px-3 py-2">
			<div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-2">WebFetch</div>
			<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-xs font-mono text-[var(--foreground)] break-all">
				{url}
			</div>
			{preview && (
				<div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-xs text-[var(--foreground)] whitespace-pre-wrap max-h-48 overflow-auto">
					{preview}
					{output && output.length > preview.length ? '…' : ''}
				</div>
			)}
		</div>
	);
}

function WriteView({
	filePath,
	content,
	output,
	onAccept,
	onReject,
	onAddComment,
	comments,
}: {
	filePath: string;
	content: string;
	output?: string;
	onAccept?: () => void;
	onReject?: () => void;
	onAddComment?: (file: string, selection: SelectedLineRange, comment: string, origin: 'diff' | 'file') => void;
	comments?: CodeComment[];
}) {
	const lines = content.split('\n');

	return (
		<div className="px-3 py-2">
			<div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
				<span>📄</span>
				<span className="font-mono truncate" title={filePath}>{shortenPath(filePath)}</span>
				<span className="ml-auto text-[10px]">{lines.length} lines</span>
			</div>
			<CodeWithComments
				code={content}
				filePath={filePath}
				onAddComment={onAddComment}
				comments={comments}
			/>
			{(onAccept || onReject) && (
				<div className="mt-2 flex gap-2">
					{onAccept && (
						<Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onAccept}>
							Accept
						</Button>
					)}
					{onReject && (
						<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onReject}>
							Reject
						</Button>
					)}
				</div>
			)}
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

function ReadView({
	filePath,
	output,
	onAddComment,
	comments,
}: {
	filePath: string;
	output?: string;
	onAddComment?: (file: string, selection: SelectedLineRange, comment: string, origin: 'diff' | 'file') => void;
	comments?: CodeComment[];
}) {
  const parsed = useMemo(() => (output ? parseFileOutput(output) : ''), [output]);

	const lines = parsed.split('\n');

	return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)]">
        <span>📖</span>
        <span className="font-mono truncate" title={filePath}>Read: {shortenPath(filePath)}</span>
        <span className="ml-auto text-[10px]">{lines.length} lines</span>
      </div>
				{parsed && (
					<CodeWithComments
						code={parsed}
						filePath={filePath}
						onAddComment={onAddComment}
						comments={comments}
					/>
				)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Todo tool view
// ---------------------------------------------------------------------------

function TodoView({ input, output }: { input?: string; output?: string }) {
  const data = useMemo(() => {
    try {
      const raw = input || output || '{}';
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed;
    } catch {
      return {};
    }
  }, [input, output]);

  const todos: Array<{ id?: string; content?: string; status?: string; priority?: string }> =
    data.todos || (Array.isArray(data) ? data : []);

  if (todos.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
        No todo items
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-1">
      {todos.map((todo, idx) => (
        <div key={todo.id ?? idx} className="flex items-center gap-2 text-xs">
          {todo.status === 'completed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : todo.status === 'in_progress' ? (
            <Loader2 className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-spin" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
          )}
          <span
            className={
              todo.status === 'completed'
                ? 'line-through text-[var(--muted-foreground)]'
                : 'text-[var(--foreground)]'
            }
          >
            {todo.content}
          </span>
          {todo.priority === 'high' && (
            <span className="text-[10px] font-medium text-red-500">HIGH</span>
          )}
        </div>
      ))}
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

export function ToolCallCard({
	part,
	onOpenDiff,
	onOpenWrite,
	onOpenRead,
	onOpenFile,
	onAddComment,
	getDiffAnnotations,
	getFileComments,
	onSendMessage,
}: ToolCallCardProps) {
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
	const openedRef = useRef(new Set<string>());
	const [showReject, setShowReject] = useState(false);
	const [rejectReason, setRejectReason] = useState('');

	useEffect(() => {
		if (!input || openedRef.current.has(part.id)) return;
		if (isEditTool(input)) {
			onOpenDiff?.(input.filePath, input.oldString, input.newString);
			openedRef.current.add(part.id);
			return;
		}
		if (isWriteTool(input)) {
			onOpenWrite?.(input.filePath, input.content);
			openedRef.current.add(part.id);
			return;
		}
		if (isReadTool(input) && output) {
			const parsed = parseFileOutput(output);
			onOpenRead?.(input.filePath, parsed);
			openedRef.current.add(part.id);
			return;
		}
		if (isReadTool(input)) {
			onOpenFile?.(input.filePath);
			openedRef.current.add(part.id);
		}
	}, [input, output, onOpenDiff, onOpenWrite, onOpenRead, onOpenFile, part.id]);

	const handleAccept = (filePath: string) => {
		onSendMessage?.(`I accept the changes to ${filePath}.`);
	};

	const handleReject = (filePath: string, reason?: string) => {
		const trimmed = reason?.trim();
		const message = trimmed
			? `I reject the changes to ${filePath}, please try again because ${trimmed}.`
			: `I reject the changes to ${filePath}, please try again.`;
		onSendMessage?.(message);
		setShowReject(false);
		setRejectReason('');
	};

	// Determine which specialised view to use
	function renderBody() {
		if (isEditTool(input)) {
			return (
				<>
					<DiffView
						filePath={input.filePath}
						oldString={input.oldString}
						newString={input.newString}
						onAddComment={onAddComment}
						annotations={getDiffAnnotations?.(input.filePath)}
					/>
					<div className="flex items-center gap-2 px-3 pb-2">
						<Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => handleAccept(input.filePath)}>
							Accept
						</Button>
						<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowReject((prev) => !prev)}>
							Reject
						</Button>
					</div>
					{showReject && (
						<div className="px-3 pb-2">
							<input
								value={rejectReason}
								onChange={(event) => setRejectReason(event.target.value)}
								placeholder="Optional reason"
								className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
							/>
							<div className="mt-2 flex gap-2">
								<Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleReject(input.filePath, rejectReason)}>
									Send rejection
								</Button>
								<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowReject(false)}>
									Cancel
								</Button>
							</div>
						</div>
					)}
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
			return (
				<WriteView
					filePath={input.filePath}
					content={input.content}
					output={output}
					onAccept={onSendMessage ? () => handleAccept(input.filePath) : undefined}
					onReject={onSendMessage ? () => handleReject(input.filePath) : undefined}
					onAddComment={onAddComment}
					comments={getFileComments?.(input.filePath)}
				/>
			);
		}

		if (isReadTool(input)) {
			return (
				<ReadView
					filePath={input.filePath}
					output={output}
					onAddComment={onAddComment}
					comments={getFileComments?.(input.filePath)}
				/>
			);
		}

		if (part.tool === 'glob' || part.tool === 'grep') {
			return <FileListView title={part.tool.toUpperCase()} output={output} />;
		}

		if (part.tool === 'webfetch' && isWebFetchTool(input)) {
			return <WebFetchView url={input.url} output={output} />;
		}

		if (part.tool === 'task' && isAgentInvocation(input)) {
			return <AgentInvocationView input={input} />;
		}

		// Todo tool — render styled checklist instead of raw JSON
		if (part.tool === 'todowrite' || part.tool === 'TodoWrite' || part.tool === 'todo_write') {
			return <TodoView input={JSON.stringify(input)} output={output} />;
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

	const shouldOpen = isEditTool(input);
	const agentTitle = part.tool === 'task' && isAgentInvocation(input)
		? `Agent · ${getAgentBadge(input.subagent_type)}`
		: title;

	return (
		<Tool defaultOpen={shouldOpen}>
			<ToolHeader
				meta={duration ? `${duration}s` : undefined}
				state={toolState}
				status={toolStatus}
				title={agentTitle}
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
