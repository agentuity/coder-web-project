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
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitStatus {
	branch: string | null;
	isDirty: boolean;
	changedFiles: string[];
	remotes: string[];
	error?: string;
}

interface GitPanelProps {
	sessionId: string;
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function StatusSection({
	status,
	loading,
	onRefresh,
}: {
	status: GitStatus | null;
	loading: boolean;
	onRefresh: () => void;
}) {
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
			{status?.error && !status.branch && (
				<div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
					<AlertCircle className="h-3 w-3" />
					{status.error}
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
					{status.isDirty && status.changedFiles.length > 0 && (
						<div className="max-h-24 overflow-auto rounded border border-[var(--border)] bg-[var(--muted)] p-1.5">
							{status.changedFiles.map((file) => (
								<div
									key={file}
									className="truncate font-mono text-[10px] text-[var(--muted-foreground)]"
								>
									{file}
								</div>
							))}
						</div>
					)}
				</div>
			)}
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

// ---------------------------------------------------------------------------
// GitPanel — main exported component
// ---------------------------------------------------------------------------

export function GitPanel({ sessionId }: GitPanelProps) {
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchStatus = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/status`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setStatus(data);
		} catch {
			setStatus({
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

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	return (
		<div className="bg-[var(--card)] flex flex-col max-h-[500px] overflow-auto">
			<StatusSection status={status} loading={loading} onRefresh={fetchStatus} />
			<BranchSection sessionId={sessionId} onSuccess={fetchStatus} />
			<CommitSection sessionId={sessionId} onSuccess={fetchStatus} />
			<PullRequestSection sessionId={sessionId} baseBranch={status?.branch ?? null} />
		</div>
	);
}

/** Lightweight hook to fetch branch + dirty count for the header badge. */
export function useGitStatus(sessionId: string | undefined) {
	const [branch, setBranch] = useState<string | null>(null);
	const [changedCount, setChangedCount] = useState(0);

	useEffect(() => {
		if (!sessionId) return;
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
	}, [sessionId]);

	return { branch, changedCount };
}
