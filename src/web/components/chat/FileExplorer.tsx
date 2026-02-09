import { useCallback, useEffect, useState } from 'react';
import {
	ChevronRight,
	ChevronDown,
	FolderOpen,
	Folder,
	FileText,
	Loader2,
	RefreshCw,
	AlertCircle,
	FolderTree,
} from 'lucide-react';
import { Button } from '../ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileEntry {
	name: string;
	path: string;
	type: 'file' | 'directory';
	size?: number;
}

interface FileExplorerProps {
	sessionId: string;
	onOpenFile: (path: string) => void;
	activeFilePath?: string | null;
}

// ---------------------------------------------------------------------------
// FileTreeNode — recursive tree node (directory or file)
// ---------------------------------------------------------------------------

interface FileTreeNodeProps {
	entry: FileEntry;
	sessionId: string;
	depth: number;
	onFileSelect: (path: string) => void;
	selectedFile: string | null;
}

function FileTreeNode({ entry, sessionId, depth, onFileSelect, selectedFile }: FileTreeNodeProps) {
	const [expanded, setExpanded] = useState(false);
	const [children, setChildren] = useState<FileEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isDir = entry.type === 'directory';
	const isSelected = entry.path === selectedFile;

	const loadChildren = useCallback(async () => {
		if (!isDir) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/sessions/${sessionId}/files?path=${encodeURIComponent(entry.path)}`,
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setChildren(data.entries || []);
		} catch {
			setError('Failed to load');
		} finally {
			setLoading(false);
		}
	}, [sessionId, entry.path, isDir]);

	const handleClick = () => {
		if (isDir) {
			if (!expanded && children.length === 0) {
				loadChildren();
			}
			setExpanded(!expanded);
		} else {
			onFileSelect(entry.path);
		}
	};

	return (
		<div>
			<button
				type="button"
				onClick={handleClick}
				className={`flex items-center gap-1 w-full text-left px-1 py-0.5 rounded text-xs hover:bg-[var(--accent)] transition-colors ${
					isSelected ? 'bg-[var(--accent)] text-[var(--foreground)]' : 'text-[var(--foreground)]'
				}`}
				style={{ paddingLeft: `${depth * 12 + 4}px` }}
			>
				{/* Chevron / spacer */}
				{isDir ? (
					expanded ? (
						<ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
					) : (
						<ChevronRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
					)
				) : (
					<span className="w-3 shrink-0" />
				)}

				{/* Icon */}
				{isDir ? (
					expanded ? (
						<FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
					) : (
						<Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
					)
				) : (
					<FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
				)}

				{/* Name */}
				<span className="truncate">{entry.name}</span>

				{/* Loading indicator */}
				{loading && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--muted-foreground)] ml-auto" />}
			</button>

			{/* Error */}
			{error && expanded && (
				<div
					className="text-[10px] text-red-500 pl-2"
					style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
				>
					{error}
				</div>
			)}

			{/* Children */}
			{expanded &&
				children.map((child) => (
					<FileTreeNode
						key={child.path}
						entry={child}
						sessionId={sessionId}
						depth={depth + 1}
						onFileSelect={onFileSelect}
						selectedFile={selectedFile}
					/>
				))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// FileExplorer — main container
// ---------------------------------------------------------------------------

export function FileExplorer({ sessionId, onOpenFile, activeFilePath }: FileExplorerProps) {
	const [entries, setEntries] = useState<FileEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const fetchRoot = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/files`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setEntries(data.entries || []);
		} catch {
			setError('Failed to load files');
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		fetchRoot();
	}, [fetchRoot]);

	return (
		<div className="bg-[var(--card)] h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
				<FolderTree className="h-4 w-4 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Files</span>
				<span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
					{!loading && !error && `${entries.length} items`}
				</span>
				<Button
					variant="ghost"
					size="sm"
					onClick={fetchRoot}
					disabled={loading}
					className="h-6 w-6 p-0"
					title="Refresh"
				>
					<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
				</Button>
			</div>

			{/* Tree view */}
			<div className="overflow-auto p-1 flex-1">
				{/* Loading */}
				{loading && entries.length === 0 && (
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
				{!loading && !error && entries.length === 0 && (
					<div className="text-center py-8">
						<p className="text-xs text-[var(--muted-foreground)]">No files found</p>
					</div>
				)}

				{/* File tree */}
				{entries.map((entry) => (
					<FileTreeNode
						key={entry.path}
						entry={entry}
						sessionId={sessionId}
						depth={0}
						onFileSelect={onOpenFile}
						selectedFile={activeFilePath ?? null}
					/>
				))}
			</div>
		</div>
	);
}
