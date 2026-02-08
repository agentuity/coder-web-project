import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, FileCode, Loader2, Plus, Minus, Pencil, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';

interface FileDiff {
	path: string;
	status: string;
	content?: string;
	before?: string;
	after?: string;
}

interface FileChangesPanelProps {
	sessionId: string;
}

function StatusIcon({ status }: { status: string }) {
	switch (status) {
		case 'added':
			return <Plus className="h-3.5 w-3.5 text-green-500 shrink-0" />;
		case 'deleted':
			return <Minus className="h-3.5 w-3.5 text-red-500 shrink-0" />;
		case 'modified':
		default:
			return <Pencil className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
	}
}

function DiffContent({ content }: { content: string }) {
	const lines = content.split('\n');
	return (
		<pre className="text-[10px] leading-relaxed font-mono overflow-x-auto p-2 bg-[var(--muted)] rounded-md mt-1">
			{lines.map((line, i) => {
				let color = 'text-[var(--muted-foreground)]';
				if (line.startsWith('+')) color = 'text-green-500';
				else if (line.startsWith('-')) color = 'text-red-500';
				else if (line.startsWith('@@')) color = 'text-purple-400';

				return (
					<div key={i} className={color}>
						{line}
					</div>
				);
			})}
		</pre>
	);
}

export function FileChangesPanel({ sessionId }: FileChangesPanelProps) {
	const [diffs, setDiffs] = useState<FileDiff[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

	const fetchDiffs = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/diff`);
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const data = await res.json();
			// Resilient: handle { diffs: [...] }, [...], or other shapes
			const items: FileDiff[] = Array.isArray(data)
				? data
				: Array.isArray(data?.diffs)
					? data.diffs
					: [];
			setDiffs(items);
		} catch (err) {
			setError('Failed to load changes');
			console.error('Failed to fetch diffs:', err);
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		fetchDiffs();
	}, [fetchDiffs]);

	const toggleFile = (path: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	// Extract just the filename from a path
	const fileName = (path: string) => {
		const parts = path.split('/');
		return parts[parts.length - 1] || path;
	};

	const dirPath = (path: string) => {
		const parts = path.split('/');
		if (parts.length <= 1) return '';
		return parts.slice(0, -1).join('/');
	};

	return (
		<div className="bg-[var(--card)] h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
				<FileCode className="h-4 w-4 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Changes</span>
				<span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
					{!loading && !error && `${diffs.length} file${diffs.length !== 1 ? 's' : ''}`}
				</span>
				<Button
					variant="ghost"
					size="sm"
					onClick={fetchDiffs}
					disabled={loading}
					className="h-6 w-6 p-0"
					title="Refresh"
				>
					<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
				</Button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-2 space-y-0.5">
				{/* Loading */}
				{loading && diffs.length === 0 && (
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
				{!loading && !error && diffs.length === 0 && (
					<div className="text-center py-8">
						<p className="text-xs text-[var(--muted-foreground)]">No file changes yet</p>
					</div>
				)}

				{/* File list */}
				{diffs.map((diff) => {
					const hasContent = !!diff.content;
					const isExpanded = expandedFiles.has(diff.path);

					return (
						<div key={diff.path}>
							<button
								type="button"
								onClick={() => hasContent && toggleFile(diff.path)}
								className={`flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--accent)] transition-colors ${
									hasContent ? 'cursor-pointer' : 'cursor-default'
								}`}
							>
								{hasContent ? (
									isExpanded ? (
										<ChevronDown className="h-3 w-3 text-[var(--muted-foreground)] shrink-0" />
									) : (
										<ChevronRight className="h-3 w-3 text-[var(--muted-foreground)] shrink-0" />
									)
								) : (
									<span className="w-3 shrink-0" />
								)}
								<StatusIcon status={diff.status} />
								<div className="flex-1 min-w-0">
									<span className="text-xs text-[var(--foreground)] truncate block">
										{fileName(diff.path)}
									</span>
									{dirPath(diff.path) && (
										<span className="text-[10px] text-[var(--muted-foreground)] truncate block">
											{dirPath(diff.path)}
										</span>
									)}
								</div>
								<span
									className={`text-[10px] shrink-0 ${
										diff.status === 'added'
											? 'text-green-500'
											: diff.status === 'deleted'
												? 'text-red-500'
												: 'text-blue-400'
									}`}
								>
									{diff.status}
								</span>
							</button>

							{/* Expanded diff content */}
							{isExpanded && hasContent && (
								<div className="px-2 pb-1">
									<DiffContent content={diff.content!} />
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
