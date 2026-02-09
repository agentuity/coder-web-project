import { useCallback, useEffect, useState } from 'react';
import {
	AlertCircle,
	Check,
	GitBranch,
	GitCommit,
	GitPullRequest,
	Loader2,
	RefreshCw,
} from 'lucide-react';
import { GitLog, type GitLogEntry } from '@tomplum/react-git-log';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitStatus {
	hasRepo: boolean;
	branch: string | null;
	isDirty: boolean;
	changedFiles: string[];
	remotes: string[];
	error?: string;
	message?: string;
}

interface GitMetadata {
	repoUrl?: string;
	branch?: string;
	pullRequest?: {
		url?: string;
		number?: number | null;
	};
	lastCommit?: {
		hash?: string | null;
		message?: string;
		timestamp?: string;
	};
}

interface GitPanelProps {
	sessionId: string;
	metadata?: GitMetadata;
	onOpenDiff: (filePath: string, oldContent: string, newContent: string) => void;
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function StatusSection({
	status,
	loading,
	onRefresh,
	onInitRepo,
	initLoading,
	initError,
	onOpenDiff,
	diffLoadingPath,
	diffError,
}: {
	status: GitStatus | null;
	loading: boolean;
	onRefresh: () => void;
	onInitRepo: (remoteUrl?: string) => void;
	initLoading: boolean;
	initError: string | null;
	onOpenDiff: (filePath: string) => void;
	diffLoadingPath: string | null;
	diffError: string | null;
}) {
	const [remoteUrl, setRemoteUrl] = useState('');
	const changes = (status?.changedFiles || [])
		.map((line) => {
			const statusLabel = line.slice(0, 2).trim();
			const rawPath = line.slice(2).trim();
			const path = rawPath.includes('->')
				? rawPath.split('->').pop()?.trim() || rawPath
				: rawPath;
			return { status: statusLabel, path };
		})
		.filter((change) => Boolean(change.path));

	const getStatusClass = (statusLabel: string) => {
		if (statusLabel.includes('A') || statusLabel.includes('?')) {
			return 'text-[var(--primary)]';
		}
		if (statusLabel.includes('D')) {
			return 'text-[var(--destructive)]';
		}
		return 'text-[var(--foreground)]';
	};

	return (
		<div className="border-b border-[var(--border)] px-3 py-2">
			<div className="flex items-center gap-2">
				<GitBranch className="h-4 w-4 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Git Status</span>
				<span className="ml-auto">
					<Button
						variant="ghost"
						size="sm"
						onClick={onRefresh}
						disabled={loading}
						className="h-6 w-6 p-0"
						title="Refresh"
					>
						<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
					</Button>
				</span>
			</div>
			{loading && !status && (
				<div className="flex items-center justify-center py-4">
					<Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
				</div>
			)}
			{status?.error && status?.hasRepo && !status?.branch && (
				<div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
					<AlertCircle className="h-3 w-3" />
					{status.error}
				</div>
			)}
			{status?.hasRepo === false && (
				<div className="mt-2 space-y-2">
					<p className="text-xs text-[var(--muted-foreground)]">
						{status.message || 'No git repository found.'}
					</p>
					<Input
						value={remoteUrl}
						onChange={(e) => setRemoteUrl(e.target.value)}
						placeholder="Remote URL (optional)"
						className="h-7 text-xs"
					/>
					<Button
						size="sm"
						onClick={() => onInitRepo(remoteUrl || undefined)}
						disabled={initLoading}
					>
						{initLoading ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							'Initialize Git Repository'
						)}
					</Button>
					{initError && <p className="text-[10px] text-red-500">{initError}</p>}
				</div>
			)}
			{status && status.branch && (
				<div className="mt-2 space-y-1.5">
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="text-[10px] font-mono">
							{status.branch}
						</Badge>
						{status.isDirty ? (
							<Badge variant="destructive" className="text-[10px]">
								{status.changedFiles.length} changed
							</Badge>
						) : (
							<Badge variant="outline" className="text-[10px]">
								Clean
							</Badge>
						)}
					</div>
					{status.isDirty && changes.length > 0 && (
						<div className="rounded border border-[var(--border)] bg-[var(--muted)] p-1.5">
							{changes.map((change) => (
								<button
									key={`${change.status}-${change.path}`}
									className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[10px] font-mono text-[var(--muted-foreground)] hover:bg-[var(--accent)] cursor-pointer"
									onClick={() => onOpenDiff(change.path)}
									type="button"
									disabled={diffLoadingPath === change.path}
								>
									<span className={`w-4 text-center text-[10px] font-semibold ${getStatusClass(change.status || 'M')}`}>
										{change.status || 'M'}
									</span>
									<span className="truncate" title={change.path}>
										{change.path}
									</span>
									{diffLoadingPath === change.path && (
										<Loader2 className="h-3 w-3 animate-spin text-[var(--muted-foreground)]" />
									)}
								</button>
							))}
						</div>
					)}
					{diffError && (
						<p className="text-[10px] text-[var(--destructive)]">{diffError}</p>
					)}
				</div>
			)}
		</div>
	);
}

function MetadataSection({ metadata }: { metadata?: GitMetadata }) {
	if (!metadata) return null;

	const repoUrl = metadata.repoUrl;
	const branch = metadata.branch;
	const prUrl = metadata.pullRequest?.url;
	const prNumber = metadata.pullRequest?.number;
	const lastCommit = metadata.lastCommit?.hash;

	if (!repoUrl && !branch && !prUrl && !lastCommit) return null;

	return (
		<div className="border-b border-[var(--border)] px-3 py-2 space-y-2">
			<div className="text-xs font-medium text-[var(--foreground)]">Repository</div>
			<div className="space-y-1">
				{repoUrl && (
					<div className="flex items-center gap-1.5 text-[10px]">
						<span className="text-[var(--muted-foreground)]">Repo:</span>
						<a
							href={repoUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-[var(--primary)] hover:underline truncate"
						>
							{repoUrl}
						</a>
					</div>
				)}
				{branch && (
					<div className="flex items-center gap-1.5 text-[10px]">
						<span className="text-[var(--muted-foreground)]">Branch:</span>
						<span className="font-mono text-[var(--foreground)]">{branch}</span>
					</div>
				)}
				{lastCommit && (
					<div className="flex items-center gap-1.5 text-[10px]">
						<span className="text-[var(--muted-foreground)]">Last commit:</span>
						<span className="font-mono text-[var(--foreground)]">{lastCommit}</span>
					</div>
				)}
				{prUrl && (
					<div className="flex items-center gap-1.5 text-[10px]">
						<span className="text-[var(--muted-foreground)]">PR:</span>
						<a
							href={prUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-[var(--primary)] hover:underline truncate"
						>
							{prNumber ? `#${prNumber}` : prUrl}
						</a>
					</div>
				)}
			</div>
		</div>
	);
}

function CreateRepoSection({
	show,
	repoName,
	onRepoNameChange,
	isPrivate,
	onPrivateChange,
	onCreate,
	creating,
	error,
}: {
	show: boolean;
	repoName: string;
	onRepoNameChange: (value: string) => void;
	isPrivate: boolean;
	onPrivateChange: (value: boolean) => void;
	onCreate: () => void;
	creating: boolean;
	error: string | null;
}) {
	if (!show) return null;

	return (
		<div className="border-b border-[var(--border)] px-3 py-2">
			<div className="flex items-center gap-2 mb-2">
				<GitBranch className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Create GitHub Repo &amp; Push</span>
			</div>
			<p className="text-[10px] text-[var(--muted-foreground)] mb-2">
				Create a new repository on GitHub and push your current project.
			</p>
			<div className="space-y-2">
				<Input
					value={repoName}
					onChange={(e) => onRepoNameChange(e.target.value)}
					placeholder="Repository name"
					className="h-7 text-xs"
				/>
				<label className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
					<input
						type="checkbox"
						checked={isPrivate}
						onChange={(e) => onPrivateChange(e.target.checked)}
						className="h-3 w-3 rounded border border-[var(--border)] accent-[var(--primary)]"
					/>
					<span>Private repository</span>
				</label>
				<Button
					variant="default"
					size="sm"
					onClick={onCreate}
					disabled={creating || !repoName.trim()}
					className={cn('h-7 text-xs w-full', creating && 'cursor-wait')}
				>
					{creating ? (
						<>
							<Loader2 className="h-3 w-3 animate-spin mr-1" />
							Creating...
						</>
					) : (
						'Create Repo & Push'
					)}
				</Button>
				{error && (
					<p className="text-[10px] text-[var(--destructive)]">{error}</p>
				)}
			</div>
		</div>
	);
}

function BranchSection({
	sessionId,
	onSuccess,
}: {
	sessionId: string;
	onSuccess: () => void;
}) {
	const [name, setName] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const handleCreate = async () => {
		if (!name.trim()) return;
		setLoading(true);
		setError(null);
		setSuccess(false);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/branch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim() }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to create branch');
			}
			setSuccess(true);
			setName('');
			onSuccess();
			setTimeout(() => setSuccess(false), 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create branch');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="border-b border-[var(--border)] px-3 py-2">
			<div className="flex items-center gap-2 mb-2">
				<GitBranch className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">New Branch</span>
			</div>
			<div className="flex items-center gap-1.5">
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="feature/my-branch"
					className="h-7 text-xs flex-1"
					onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
				/>
				<Button
					variant="secondary"
					size="sm"
					onClick={handleCreate}
					disabled={loading || !name.trim()}
					className="h-7 text-xs shrink-0"
				>
					{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : success ? <Check className="h-3 w-3" /> : 'Create'}
				</Button>
			</div>
			{error && (
				<p className="mt-1 text-[10px] text-red-500">{error}</p>
			)}
		</div>
	);
}

function CommitSection({
	sessionId,
	onSuccess,
}: {
	sessionId: string;
	onSuccess: () => void;
}) {
	const [message, setMessage] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [commitHash, setCommitHash] = useState<string | null>(null);

	const handleCommit = async () => {
		if (!message.trim()) return;
		setLoading(true);
		setError(null);
		setCommitHash(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/commit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: message.trim() }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to commit');
			}
			setCommitHash(data.hash);
			setMessage('');
			onSuccess();
			setTimeout(() => setCommitHash(null), 3000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to commit');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="border-b border-[var(--border)] px-3 py-2">
			<div className="flex items-center gap-2 mb-2">
				<GitCommit className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Commit</span>
			</div>
			<div className="space-y-1.5">
				<Input
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					placeholder="Commit message..."
					className="h-7 text-xs"
					onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleCommit()}
				/>
				<div className="flex items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={handleCommit}
						disabled={loading || !message.trim()}
						className="h-7 text-xs"
					>
						{loading ? (
							<Loader2 className="h-3 w-3 animate-spin mr-1" />
						) : (
							<GitCommit className="h-3 w-3 mr-1" />
						)}
						Commit All
					</Button>
					{commitHash && (
						<span className="text-[10px] font-mono text-green-500">
							{commitHash}
						</span>
					)}
				</div>
			</div>
			{error && (
				<p className="mt-1 text-[10px] text-red-500">{error}</p>
			)}
		</div>
	);
}

function PushSection({
	sessionId,
	onSuccess,
}: {
	sessionId: string;
	onSuccess: () => void;
}) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const handlePush = async () => {
		setLoading(true);
		setError(null);
		setSuccess(false);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/push`, {
				method: 'POST',
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to push branch');
			}
			setSuccess(true);
			onSuccess();
			setTimeout(() => setSuccess(false), 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to push branch');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="border-b border-[var(--border)] px-3 py-2">
			<div className="flex items-center gap-2 mb-2">
				<GitCommit className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Push</span>
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onClick={handlePush}
					disabled={loading}
					className="h-7 text-xs"
				>
					{loading ? (
						<Loader2 className="h-3 w-3 animate-spin mr-1" />
					) : (
						<GitCommit className="h-3 w-3 mr-1" />
					)}
					{loading ? 'Pushing...' : 'Push'}
				</Button>
				{success && (
					<span className="text-[10px] text-[var(--primary)]">Pushed</span>
				)}
			</div>
			{error && (
				<p className="mt-1 text-[10px] text-[var(--destructive)]">{error}</p>
			)}
		</div>
	);
}

function PullRequestSection({
	sessionId,
	baseBranch,
}: {
	sessionId: string;
	baseBranch: string | null;
}) {
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');
	const [base, setBase] = useState('main');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [prUrl, setPrUrl] = useState<string | null>(null);

	const handleCreate = async () => {
		if (!title.trim()) return;
		setLoading(true);
		setError(null);
		setPrUrl(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/pr`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					body: body.trim() || undefined,
					base,
				}),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to create PR');
			}
			setPrUrl(data.url);
			setTitle('');
			setBody('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create PR');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="px-3 py-2">
			<div className="flex items-center gap-2 mb-2">
				<GitPullRequest className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Pull Request</span>
			</div>
			<div className="space-y-1.5">
				<Input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="PR title..."
					className="h-7 text-xs"
				/>
				<Textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder="Description (optional)..."
					className="min-h-[48px] text-xs resize-none"
					rows={2}
				/>
				<div className="flex items-center gap-1.5">
					<span className="text-[10px] text-[var(--muted-foreground)] shrink-0">Base:</span>
					<Input
						value={base}
						onChange={(e) => setBase(e.target.value)}
						className="h-6 text-[10px] font-mono w-24"
					/>
				</div>
				<Button
					variant="default"
					size="sm"
					onClick={handleCreate}
					disabled={loading || !title.trim()}
					className="h-7 text-xs w-full"
				>
					{loading ? (
						<>
							<Loader2 className="h-3 w-3 animate-spin mr-1" />
							Creating PR...
						</>
					) : (
						<>
							<GitPullRequest className="h-3 w-3 mr-1" />
							Push & Create PR
						</>
					)}
				</Button>
			</div>
			{prUrl && (
				<div className="mt-2 flex items-center gap-1.5">
					<Check className="h-3 w-3 text-green-500 shrink-0" />
					<a
						href={prUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-[10px] text-[var(--primary)] hover:underline truncate"
					>
						{prUrl}
					</a>
				</div>
			)}
			{error && (
				<p className="mt-1 text-[10px] text-red-500">{error}</p>
			)}
		</div>
	);
}

function HistorySection({
	entries,
	loading,
	error,
	currentBranch,
}: {
	entries: GitLogEntry[];
	loading: boolean;
	error: string | null;
	currentBranch: string;
}) {
	const isDark = typeof document !== 'undefined'
		? document.documentElement.classList.contains('dark')
		: false;

	if (loading && entries.length === 0) {
		return (
			<div className="border-b border-[var(--border)] px-3 py-2">
				<div className="flex items-center gap-2">
					<GitCommit className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
					<span className="text-xs font-medium text-[var(--foreground)]">History</span>
				</div>
				<div className="mt-2 flex items-center justify-center py-4">
					<Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
				</div>
			</div>
		);
	}

	const resolvedEntries = entries.map((entry) => ({
		...entry,
		branch: entry.branch || currentBranch,
	}));

	return (
		<div className="border-b border-[var(--border)] px-3 py-2">
			<div className="flex items-center gap-2">
				<GitCommit className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">History</span>
			</div>
			{error && (
				<p className="mt-2 text-[10px] text-[var(--destructive)]">{error}</p>
			)}
			{!error && resolvedEntries.length === 0 && (
				<p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
					No commits yet.
				</p>
			)}
			{resolvedEntries.length > 0 && (
				<div className="mt-2 max-h-[220px] overflow-auto rounded border border-[var(--border)] bg-[var(--background)]">
					<GitLog
						entries={resolvedEntries}
						currentBranch={currentBranch}
						theme={isDark ? 'dark' : 'light'}
						showHeaders={false}
						rowSpacing={6}
						defaultGraphWidth={120}
						classes={{ containerClass: 'text-[10px]' }}
					>
						<GitLog.GraphHTMLGrid nodeSize={10} showCommitNodeTooltips={false} />
						<GitLog.Table
							className="text-[10px]"
							timestampFormat="YYYY-MM-DD"
						/>
					</GitLog>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// GitPanel — main exported component
// ---------------------------------------------------------------------------

export function GitPanel({ sessionId, metadata, onOpenDiff }: GitPanelProps) {
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [initLoading, setInitLoading] = useState(false);
	const [initError, setInitError] = useState<string | null>(null);
	const [diffLoadingPath, setDiffLoadingPath] = useState<string | null>(null);
	const [diffError, setDiffError] = useState<string | null>(null);
	const [repoName, setRepoName] = useState('');
	const [isPrivate, setIsPrivate] = useState(true);
	const [creatingRepo, setCreatingRepo] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [createdRepoUrl, setCreatedRepoUrl] = useState<string | null>(null);
	const [history, setHistory] = useState<GitLogEntry[]>([]);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);

	const fetchStatus = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/status`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setStatus(data);
		} catch {
			setStatus({
				hasRepo: true,
				branch: null,
				isDirty: false,
				changedFiles: [],
				remotes: [],
				error: 'Failed to load git status',
			});
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	const fetchHistory = useCallback(async () => {
		setHistoryLoading(true);
		setHistoryError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/log`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || `HTTP ${res.status}`);
			}
			const data = await res.json();
			if (!Array.isArray(data)) {
				throw new Error('Invalid git log response');
			}
			setHistory(data);
		} catch (err) {
			setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
			setHistory([]);
		} finally {
			setHistoryLoading(false);
		}
	}, [sessionId]);

	const refreshAll = useCallback(async () => {
		await Promise.all([fetchStatus(), fetchHistory()]);
	}, [fetchHistory, fetchStatus]);

	const handleInitRepo = useCallback(async (remoteUrl?: string) => {
		setInitLoading(true);
		setInitError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/init`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ remoteUrl }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to initialize git repository');
			}
			await refreshAll();
		} catch (err) {
			setInitError(err instanceof Error ? err.message : 'Failed to initialize git repository');
		} finally {
			setInitLoading(false);
		}
	}, [refreshAll, sessionId]);

	const handleCreateRepo = useCallback(async () => {
		if (!repoName.trim()) return;
		setCreatingRepo(true);
		setCreateError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/create-repo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: repoName.trim(),
					isPrivate,
				}),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to create repository');
			}
			if (typeof data.repoUrl === 'string' && data.repoUrl.trim()) {
				setCreatedRepoUrl(data.repoUrl.trim());
			}
			await refreshAll();
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : 'Failed to create repository');
		} finally {
			setCreatingRepo(false);
		}
	}, [isPrivate, refreshAll, repoName, sessionId]);

	useEffect(() => {
		refreshAll();
	}, [refreshAll]);

	useEffect(() => {
		if (!status) return;
		const shouldShow = status.hasRepo === false || status.remotes.length === 0;
		if (shouldShow && !repoName) {
			setRepoName('my-project');
		}
	}, [repoName, status]);

	const handleOpenDiff = useCallback(async (filePath: string) => {
		setDiffLoadingPath(filePath);
		setDiffError(null);
		try {
			const res = await fetch(
				`/api/sessions/${sessionId}/github/diff-file?path=${encodeURIComponent(filePath)}`,
			);
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Failed to load diff');
			}
			onOpenDiff(filePath, data.oldContent || '', data.newContent || '');
		} catch (err) {
			setDiffError(err instanceof Error ? err.message : 'Failed to load diff');
		} finally {
			setDiffLoadingPath(null);
		}
	}, [onOpenDiff, sessionId]);

	const showCreateRepo = Boolean(status && (status.hasRepo === false || status.remotes.length === 0));
	const resolvedMetadata = createdRepoUrl
		? { ...(metadata || {}), repoUrl: createdRepoUrl }
		: metadata;
	const currentBranch =
		status?.branch
		|| resolvedMetadata?.branch
		|| history.find((entry) => entry.branch)?.branch
		|| 'main';

	return (
		<div className="bg-[var(--card)] flex h-full flex-col">
			<StatusSection
				status={status}
				loading={loading}
				onRefresh={refreshAll}
				onInitRepo={handleInitRepo}
				initLoading={initLoading}
				initError={initError}
				onOpenDiff={handleOpenDiff}
				diffLoadingPath={diffLoadingPath}
				diffError={diffError}
			/>
			<CreateRepoSection
				show={showCreateRepo}
				repoName={repoName}
				onRepoNameChange={setRepoName}
				isPrivate={isPrivate}
				onPrivateChange={setIsPrivate}
				onCreate={handleCreateRepo}
				creating={creatingRepo}
				error={createError}
			/>
			<MetadataSection metadata={resolvedMetadata} />
			<HistorySection
				entries={history}
				loading={historyLoading}
				error={historyError}
				currentBranch={currentBranch}
			/>
			<BranchSection sessionId={sessionId} onSuccess={refreshAll} />
			<CommitSection sessionId={sessionId} onSuccess={refreshAll} />
			<PushSection sessionId={sessionId} onSuccess={refreshAll} />
			<PullRequestSection sessionId={sessionId} baseBranch={status?.branch ?? null} />
		</div>
	);
}

/** Lightweight hook to fetch branch + dirty count for the header badge. */
export function useGitStatus(sessionId: string | undefined, enabled = true) {
	const [branch, setBranch] = useState<string | null>(null);
	const [changedCount, setChangedCount] = useState(0);

	useEffect(() => {
		if (!sessionId || !enabled) {
			setBranch(null);
			setChangedCount(0);
			return;
		}
		let cancelled = false;

		const load = async () => {
			try {
				const res = await fetch(`/api/sessions/${sessionId}/github/status`);
				if (!res.ok) return;
				const data: GitStatus = await res.json();
				if (cancelled) return;
				setBranch(data.branch);
				setChangedCount(data.changedFiles.length);
			} catch {
				// ignore
			}
		};

		load();
		// Poll every 30s
		const interval = setInterval(load, 30_000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [sessionId, enabled]);

	return { branch, changedCount };
}
