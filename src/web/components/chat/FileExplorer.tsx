import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, AlertCircle, FolderTree, ChevronDown, GitCommit } from 'lucide-react';
import { Button } from '../ui/button';
import { FileTree, type FileTreeNode } from '../ai-elements/file-tree';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileEntry {
	name: string;
	path: string;
	type: 'file' | 'directory';
	size?: number;
}

interface GitStatus {
	hasRepo: boolean;
	branch: string | null;
	isDirty: boolean;
	changedFiles: string[];
	remotes: string[];
	message?: string;
	error?: string;
}

interface GitChange {
	path: string;
	status: string;
}

interface FileExplorerProps {
	sessionId: string;
	onOpenFile: (path: string) => void;
	onOpenDiff?: (path: string) => void;
	activeFilePath?: string | null;
	// Tree caching props — parent can persist tree state across mount/unmount cycles
	cachedNodes?: FileTreeNode[];
	cachedEntryCount?: number;
	onTreeLoaded?: (nodes: FileTreeNode[], entryCount: number) => void;
}

export function FileExplorer({ sessionId, onOpenFile, onOpenDiff, activeFilePath, cachedNodes, cachedEntryCount, onTreeLoaded }: FileExplorerProps) {
	const [nodes, setNodes] = useState<FileTreeNode[]>(cachedNodes ?? []);
	const [entryCount, setEntryCount] = useState(cachedEntryCount ?? 0);
	// If cached nodes exist, skip loading spinner — show them instantly (stale-while-revalidate)
	const [loading, setLoading] = useState(!cachedNodes?.length);
	const [error, setError] = useState<string | null>(null);
	const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
	const [gitLoading, setGitLoading] = useState(false);
	const [gitError, setGitError] = useState<string | null>(null);

	const buildTree = useCallback((entries: FileEntry[], rawPath: string): FileTreeNode[] => {
		const basePath = rawPath === '/' ? '/home/agentuity' : rawPath;
		const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
		const rootNodes: FileTreeNode[] = [];
		const nodeMap = new Map<string, FileTreeNode>();

		const addNode = (node: FileTreeNode, parent?: FileTreeNode) => {
			if (parent) {
				parent.children = parent.children ?? [];
				parent.children.push(node);
			} else {
				rootNodes.push(node);
			}
		};

		const getOrCreateDir = (fullPath: string, name: string, parent?: FileTreeNode) => {
			const existing = nodeMap.get(fullPath);
			if (existing) return existing;
			const node: FileTreeNode = { name, path: fullPath, type: 'directory', children: [] };
			nodeMap.set(fullPath, node);
			addNode(node, parent);
			return node;
		};

		for (const entry of entries) {
			const relative = entry.path.startsWith(`${normalizedBase}/`)
				? entry.path.slice(normalizedBase.length + 1)
				: entry.path.replace(/^\/+/, '');
			const segments = relative.split('/').filter(Boolean);
			if (segments.length === 0) continue;
			let parent: FileTreeNode | undefined;
			for (let i = 0; i < segments.length; i += 1) {
				const segment = segments[i] as string;
				const fullPath = `${normalizedBase}/${segments.slice(0, i + 1).join('/')}`;
				const isLeaf = i === segments.length - 1;
				if (!isLeaf || entry.type === 'directory') {
					parent = getOrCreateDir(fullPath, segment, parent);
				} else {
					const fileNode: FileTreeNode = {
						name: segment,
						path: entry.path,
						type: 'file',
						size: entry.size,
					};
					addNode(fileNode, parent);
				}
			}
		}

		const sortNodes = (list: FileTreeNode[]) => {
			list.sort((a, b) => {
				if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			for (const node of list) {
				if (node.children) sortNodes(node.children);
			}
		};

		sortNodes(rootNodes);
		return rootNodes;
	}, []);
	const fetchRoot = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/files`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			const entries = data.entries || [];
			setEntryCount(entries.length);
			const tree = buildTree(entries, data.path || '/');
			setNodes(tree);
			onTreeLoaded?.(tree, entries.length);
		} catch {
			setError('Failed to load files');
			setNodes([]);
			setEntryCount(0);
		} finally {
			setLoading(false);
		}
	}, [sessionId, buildTree, onTreeLoaded]);

	const fetchGitStatus = useCallback(async () => {
		setGitLoading(true);
		setGitError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/github/status`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setGitStatus(data as GitStatus);
		} catch {
			setGitError('Failed to load git status');
			setGitStatus(null);
		} finally {
			setGitLoading(false);
		}
	}, [sessionId]);

	const handleRefresh = useCallback(() => {
		void fetchRoot();
		void fetchGitStatus();
	}, [fetchGitStatus, fetchRoot]);

	useEffect(() => {
		fetchRoot();
		fetchGitStatus();
	}, [fetchGitStatus, fetchRoot]);

	const gitChanges = useMemo<GitChange[]>(() => {
		if (!gitStatus?.changedFiles?.length) return [];
		return gitStatus.changedFiles
			.map((line) => {
				const status = line.slice(0, 2).trim();
				const rawPath = line.slice(2).trim();
				const path = rawPath.includes('->')
					? rawPath.split('->').pop()?.trim() || rawPath
					: rawPath;
				return { status, path };
			})
			.filter((change) => Boolean(change.path));
	}, [gitStatus]);

	return (
		<div className="bg-[var(--card)] h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
				<FolderTree className="h-4 w-4 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Files</span>
				<span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
					{!loading && !error && `${entryCount} items`}
				</span>
				<Button
					variant="ghost"
					size="sm"
					onClick={handleRefresh}
					disabled={loading || gitLoading}
					className="h-6 w-6 p-0"
					title="Refresh"
				>
					<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
				</Button>
			</div>

			{/* Tree view */}
			<div className="overflow-auto p-1 flex-1 space-y-2">
			{gitChanges.length > 0 && (
					<Collapsible defaultOpen className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40">
						<CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
							<span>Git Changes ({gitChanges.length})</span>
							<ChevronDown className="h-3 w-3" />
						</CollapsibleTrigger>
						<CollapsibleContent className="border-t border-[var(--border)] px-2 py-1.5 space-y-1">
							{gitChanges.map((change) => {
								const statusLabel = change.status || 'M';
								const statusColor = statusLabel.includes('A') || statusLabel.includes('?')
									? 'text-green-500'
									: statusLabel.includes('D')
										? 'text-red-500'
										: 'text-yellow-500';
								return (
								<button
									key={`${change.status}-${change.path}`}
									onClick={() => (onOpenDiff ?? onOpenFile)(change.path)}
									className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--accent)]"
									type="button"
								>
										<GitCommit className="h-3 w-3 text-[var(--muted-foreground)]" />
										<span className={`w-4 text-center text-[10px] font-semibold ${statusColor}`}>
											{statusLabel}
										</span>
										<span className="truncate" title={change.path}>{change.path.split('/').pop()}</span>
									</button>
								);
							})}
						</CollapsibleContent>
					</Collapsible>
				)}
				{gitError && (
					<div className="flex items-center gap-2 px-2 py-1 text-[11px] text-red-500">
						<AlertCircle className="h-3 w-3 shrink-0" />
						{gitError}
					</div>
				)}
				{/* Loading */}
				{loading && nodes.length === 0 && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
					</div>
				)}

				{/* Error */}
				{error && (
					<div className="flex items-center gap-2 px-2 py-4 text-xs text-red-500">
						<AlertCircle className="h-3.5 w-3.5 shrink-0" />
						{error}
					</div>
				)}

				{/* Empty */}
				{!loading && !error && nodes.length === 0 && (
					<div className="text-center py-8">
						<p className="text-xs text-[var(--muted-foreground)]">No files found</p>
					</div>
				)}

				{/* File tree */}
				{nodes.length > 0 && (
					<FileTree nodes={nodes} selectedPath={activeFilePath ?? undefined} onSelect={onOpenFile} />
				)}
			</div>

			</div>
	);
}
