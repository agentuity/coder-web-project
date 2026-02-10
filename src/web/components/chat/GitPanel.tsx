import { useCallback, useEffect, useState } from 'react';
import {
	AlertCircle,
	Check,
	ChevronRight,
	File,
	Folder,
	FolderOpen,
	GitBranch,
	GitCommit,
	History,
	Loader2,
	RefreshCw,
	X,
} from 'lucide-react';
import { GitLog, type GitLogEntry } from '@tomplum/react-git-log';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
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
	onBranchChange?: () => void;
}

// ---------------------------------------------------------------------------
// Changes tree helpers
// ---------------------------------------------------------------------------

interface ChangeEntry {
	status: string;
	path: string;
}

interface ChangesTreeNode {
	name: string;
	fullPath: string;
	type: 'file' | 'directory';
	status?: string;
	children?: ChangesTreeNode[];
}

function buildChangesTree(changes: ChangeEntry[]): ChangesTreeNode[] {
	const root: ChangesTreeNode[] = [];

	for (const change of changes) {
		const parts = change.path.split('/');
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i] as string;
			const isFile = i === parts.length - 1;
			const fullPath = parts.slice(0, i + 1).join('/');

			if (isFile) {
				current.push({
					name: part,
					fullPath: change.path,
					type: 'file',
					status: change.status,
				});
			} else {
				let existing = current.find(
					(n) => n.type === 'directory' && n.name === part,
				);
				if (!existing) {
					existing = {
						name: part,
						fullPath: fullPath,
						type: 'directory',
						children: [],
					};
					current.push(existing);
				}
				current = existing.children!;
			}
		}
	}

	// Sort: directories first, then alphabetically
	const sortNodes = (nodes: ChangesTreeNode[]) => {
		nodes.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const n of nodes) {
			if (n.children) sortNodes(n.children);
		}
	};
	sortNodes(root);
	return root;
}

function ChangesTreeItem({
	node,
	depth,
	onOpenDiff,
	diffLoadingPath,
	getStatusClass,
}: {
	node: ChangesTreeNode;
	depth: number;
	onOpenDiff: (filePath: string) => void;
	diffLoadingPath: string | null;
	getStatusClass: (status: string) => string;
}) {
	const [expanded, setExpanded] = useState(depth < 1);

	if (node.type === 'directory') {
		return (
			<div>
				<button
					type="button"
					className="flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--accent)]"
					style={{ paddingLeft: `${depth * 12 + 4}px` }}
					onClick={() => setExpanded(!expanded)}
				>
					<ChevronRight
						className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
					/>
					{expanded ? (
						<FolderOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
					) : (
						<Folder className="h-3.5 w-3.5 text-[var(--primary)]" />
					)}
					<span className="text-[10px] font-mono text-[var(--muted-foreground)]">
						{node.name}
					</span>
				</button>
				{expanded &&
					node.children?.map((child) => (
						<ChangesTreeItem
							key={child.fullPath}
							node={child}
							depth={depth + 1}
							onOpenDiff={onOpenDiff}
							diffLoadingPath={diffLoadingPath}
							getStatusClass={getStatusClass}
						/>
					))}
			</div>
		);
	}

	return (
		<button
			type="button"
			className="flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--accent)] cursor-pointer"
			style={{ paddingLeft: `${depth * 12 + 16}px` }}
			onClick={() => onOpenDiff(node.fullPath)}
			disabled={diffLoadingPath === node.fullPath}
		>
			<span
				className={`w-4 text-center text-[10px] font-semibold ${getStatusClass(node.status || 'M')}`}
			>
				{node.status || 'M'}
			</span>
			<File className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
			<span className="truncate text-[10px] font-mono text-[var(--muted-foreground)]" title={node.fullPath}>
				{node.name}
			</span>
			{diffLoadingPath === node.fullPath && (
				<Loader2 className="h-3 w-3 animate-spin text-[var(--muted-foreground)]" />
			)}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Git History Modal
// ---------------------------------------------------------------------------

function GitHistoryModal({
	open,
	onOpenChange,
	entries,
	loading,
	error,
	currentBranch,
	repoUrl,
	sessionId,
	onBranchCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entries: GitLogEntry[];
	loading: boolean;
	error: string | null;
	currentBranch: string;
	repoUrl?: string;
	sessionId: string;
	onBranchCreated: () => void;
}) {
	const isDark =
		typeof document !== 'undefined'
			? document.documentElement.classList.contains('dark')
			: false;

	const [selectedCommit, setSelectedCommit] = useState<any>(null);
	const [checkoutName, setCheckoutName] = useState('');
	const [checkoutLoading, setCheckoutLoading] = useState(false);
	const [checkoutError, setCheckoutError] = useState<string | null>(null);
	const [checkoutSuccess, setCheckoutSuccess] = useState(false);

	const resolvedEntries = entries.map((entry) => ({
		...entry,
		branch: entry.branch || currentBranch,
	}));

	const handleCheckout = async () => {
		if (!checkoutName.trim() || !selectedCommit?.hash) return;
		setCheckoutLoading(true);
		setCheckoutError(null);
		setCheckoutSuccess(false);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: checkoutName.trim(),
					startPoint: selectedCommit.hash,
				}),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || 'Failed to create branch');
			}
			setCheckoutSuccess(true);
			setCheckoutName('');
			setSelectedCommit(null);
			onBranchCreated();
			// Close the modal after a brief success flash so the user sees the branch change in the sidebar
			setTimeout(() => {
				setCheckoutSuccess(false);
				onOpenChange(false);
			}, 800);
		} catch (err) {
			setCheckoutError(err instanceof Error ? err.message : 'Failed to create branch');
		} finally {
			setCheckoutLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl h-[80vh] flex flex-col">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<DialogTitle>Commit History</DialogTitle>
						<Badge variant="secondary" className="text-[10px] font-mono">
							{currentBranch}
						</Badge>
						{resolvedEntries.length > 0 && (
							<Badge variant="outline" className="text-[10px]">
								{resolvedEntries.length} commit{resolvedEntries.length !== 1 ? 's' : ''}
							</Badge>
						)}
					</div>
				</DialogHeader>
				<div className="overflow-auto flex-1 rounded border border-[var(--border)] bg-[var(--background)]">
					{loading && resolvedEntries.length === 0 && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
						</div>
					)}
					{error && (
						<div className="flex items-center justify-center gap-2 py-12">
							<AlertCircle className="h-4 w-4 text-[var(--destructive)]" />
							<span className="text-xs text-[var(--destructive)]">{error}</span>
						</div>
					)}
					{!loading && !error && resolvedEntries.length === 0 && (
						<div className="flex items-center justify-center py-12">
							<span className="text-xs text-[var(--muted-foreground)]">No commits yet.</span>
						</div>
					)}
					{resolvedEntries.length > 0 && (
						<GitLog
							entries={resolvedEntries}
							currentBranch={currentBranch}
							theme={isDark ? 'dark' : 'light'}
							showHeaders={false}
							rowSpacing={0}
							defaultGraphWidth={180}
							classes={{ containerClass: 'text-xs' }}
							onSelectCommit={(commit) => {
								setSelectedCommit(commit ?? null);
								setCheckoutName('');
								setCheckoutError(null);
								setCheckoutSuccess(false);
							}}
							enableSelectedCommitStyling
							enablePreviewedCommitStyling
							urls={repoUrl ? ({ commit }) => ({
								commit: `${repoUrl.replace('.git', '')}/commit/${commit.hash}`,
								branch: `${repoUrl.replace('.git', '')}/tree/${commit.branch}`,
							}) : undefined}
						>
							<GitLog.GraphHTMLGrid
								nodeSize={12}
								showCommitNodeTooltips
								enableResize
							/>
							<GitLog.Table
								className="text-xs"
								timestampFormat="YYYY-MM-DD"
							/>
						</GitLog>
					)}
				</div>
				{selectedCommit && (
					<div className="shrink-0 border-t border-[var(--border)] px-4 py-3 space-y-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<GitCommit className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
								<span className="font-mono text-xs text-[var(--primary)]">{selectedCommit.hash}</span>
								{repoUrl && (
									<a
										href={`${repoUrl.replace('.git', '')}/commit/${selectedCommit.hash}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[10px] text-[var(--primary)] hover:underline"
									>
										View on GitHub
									</a>
								)}
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 text-[10px]"
								onClick={() => setSelectedCommit(null)}
							>
								<X className="h-3 w-3" />
							</Button>
						</div>
						<p className="text-xs text-[var(--foreground)]">{selectedCommit.message}</p>
						<div className="flex items-center gap-4 text-[10px] text-[var(--muted-foreground)]">
							{selectedCommit.author?.name && (
								<span>{selectedCommit.author.name}</span>
							)}
							{selectedCommit.committerDate && (
								<span>{selectedCommit.committerDate}</span>
							)}
							{selectedCommit.parents?.length > 0 && (
								<span>Parents: {selectedCommit.parents.map((p: string) => p.slice(0, 7)).join(', ')}</span>
							)}
						</div>
						{selectedCommit.branch && (
							<div className="flex items-center gap-1.5">
								<Badge variant="secondary" className="text-[10px] font-mono">
									{selectedCommit.branch}
								</Badge>
								{repoUrl && (
									<a
										href={`${repoUrl.replace('.git', '')}/tree/${selectedCommit.branch}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[10px] text-[var(--primary)] hover:underline"
									>
										View branch
									</a>
								)}
							</div>
						)}
						<div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border)]">
							<GitBranch className="h-3 w-3 text-[var(--muted-foreground)] shrink-0" />
							<Input
								value={checkoutName}
								onChange={(e) => setCheckoutName(e.target.value)}
								placeholder="new-branch-name"
								className="h-7 text-xs flex-1"
								onKeyDown={(e) => e.key === 'Enter' && handleCheckout()}
							/>
							<Button
								variant="secondary"
								size="sm"
								onClick={handleCheckout}
								disabled={checkoutLoading || !checkoutName.trim()}
								className="h-7 text-xs shrink-0"
							>
								{checkoutLoading ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : checkoutSuccess ? (
									<Check className="h-3 w-3" />
								) : (
									'Branch from here'
								)}
							</Button>
						</div>
						{checkoutError && (
							<p className="text-[10px] text-[var(--destructive)]">{checkoutError}</p>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
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
						{buildChangesTree(changes).map((node) => (
							<ChangesTreeItem
								key={node.fullPath}
								node={node}
								depth={0}
								onOpenDiff={onOpenDiff}
								diffLoadingPath={diffLoadingPath}
								getStatusClass={getStatusClass}
							/>
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

function HistoryButton({
	entries,
	loading,
	onOpen,
}: {
	entries: GitLogEntry[];
	loading: boolean;
	onOpen: () => void;
}) {
	return (
		<div className="border-b border-[var(--border)]">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[var(--accent)] cursor-pointer"
				onClick={onOpen}
			>
				<History className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">History</span>
				<span className="ml-auto flex items-center gap-1.5">
					{loading && entries.length === 0 && (
						<Loader2 className="h-3 w-3 animate-spin text-[var(--muted-foreground)]" />
					)}
					{entries.length > 0 && (
						<Badge variant="outline" className="text-[10px]">
							{entries.length}
						</Badge>
					)}
					<ChevronRight className="h-3 w-3 text-[var(--muted-foreground)]" />
				</span>
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// GitPanel — main exported component
// ---------------------------------------------------------------------------

export function GitPanel({ sessionId, metadata, onOpenDiff, onBranchChange }: GitPanelProps) {
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
		onBranchChange?.();
	}, [fetchHistory, fetchStatus, onBranchChange]);

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

	const [historyOpen, setHistoryOpen] = useState(false);

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
			<HistoryButton
				entries={history}
				loading={historyLoading}
				onOpen={() => setHistoryOpen(true)}
			/>
			<GitHistoryModal
				open={historyOpen}
				onOpenChange={setHistoryOpen}
				entries={history}
				loading={historyLoading}
				error={historyError}
				currentBranch={currentBranch}
				repoUrl={resolvedMetadata?.repoUrl}
				sessionId={sessionId}
				onBranchCreated={refreshAll}
			/>
			<BranchSection sessionId={sessionId} onSuccess={refreshAll} />
			<div className="px-3 py-3">
				<p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
					Use the chat to manage your changes — commit, push, create PRs, and more.
				</p>
			</div>
		</div>
	);
}

/** Lightweight hook to fetch branch + dirty count for the header badge. */
export function useGitStatus(sessionId: string | undefined, enabled = true) {
	const [branch, setBranch] = useState<string | null>(null);
	const [changedCount, setChangedCount] = useState(0);

	const load = useCallback(async () => {
		if (!sessionId || !enabled) return;
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/status`);
			if (!res.ok) return;
			const data: GitStatus = await res.json();
			setBranch(data.branch);
			setChangedCount(data.changedFiles.length);
		} catch {
			// ignore
		}
	}, [sessionId, enabled]);

	useEffect(() => {
		if (!sessionId || !enabled) {
			setBranch(null);
			setChangedCount(0);
			return;
		}
		load();
		const interval = setInterval(load, 30_000);
		return () => clearInterval(interval);
	}, [sessionId, enabled, load]);

	return { branch, changedCount, refresh: load };
}
