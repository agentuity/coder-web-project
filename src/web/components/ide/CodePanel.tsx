import { useCallback, useEffect, useMemo, useState } from 'react';
import { File as PierreFile, FileDiff as PierreDiff } from '@pierre/diffs/react';
import {
	parseDiffFromFile,
	type DiffLineAnnotation,
	type LineAnnotation,
	type SelectedLineRange,
} from '@pierre/diffs';
import { AlertCircle, Loader2, PencilLine, Save } from 'lucide-react';
import { FileTabs } from './FileTabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getLangFromPath } from '../../lib/shiki';
import type { FileTab } from '../../hooks/useFileTabs';
import type { CodeComment } from '../../hooks/useCodeComments';

interface CodePanelProps {
	sessionId: string;
	tabs: FileTab[];
	activeId: string | null;
	onSelectTab: (id: string) => void;
	onCloseTab: (id: string) => void;
	onUpdateTab: (id: string, updates: Partial<FileTab>) => void;
	onAddComment: (file: string, selection: SelectedLineRange, comment: string, origin: 'diff' | 'file') => void;
	getDiffAnnotations: (file: string) => DiffLineAnnotation<{ id: string; comment: string }> [];
	getFileComments: (file: string) => CodeComment[];
}

function getNormalizedRange(range: SelectedLineRange) {
	if (range.start <= range.end) return range;
	return { ...range, start: range.end, end: range.start };
}

export function CodePanel({
	sessionId,
	tabs,
	activeId,
	onSelectTab,
	onCloseTab,
	onUpdateTab,
	onAddComment,
	getDiffAnnotations,
	getFileComments,
}: CodePanelProps) {
	const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;
	const canEdit = Boolean(
		activeTab
		&& activeTab.kind !== 'diff'
		&& !activeTab.readonly
		&& activeTab.content !== undefined,
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState('');
	const [isModified, setIsModified] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
	const [commentText, setCommentText] = useState('');

	const resetKey = activeTab?.id ?? 'none';

	useEffect(() => {
		if (!resetKey) return;
		setSelectedRange(null);
		setCommentText('');
		setError(null);
		setSaveError(null);
		setIsEditing(false);
		setEditContent(activeTab?.content ?? '');
		setIsModified(false);
	}, [activeTab?.content, resetKey]);

	useEffect(() => {
		if (!activeTab || activeTab.kind === 'diff') return;
		if (activeTab.content !== undefined) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetch(`/api/sessions/${sessionId}/files/content?path=${encodeURIComponent(activeTab.filePath)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data) => {
				if (cancelled) return;
				onUpdateTab(activeTab.id, { content: data.content || '' });
			})
			.catch(() => {
				if (!cancelled) setError('Failed to load file content');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeTab, onUpdateTab, sessionId]);

	useEffect(() => {
		if (!activeTab || activeTab.kind === 'diff') return;
		if (isEditing) return;
		setEditContent(activeTab.content ?? '');
		setIsModified(false);
		if (activeTab.isModified) {
			onUpdateTab(activeTab.id, { isModified: false });
		}
	}, [activeTab, isEditing, onUpdateTab]);

	useEffect(() => {
		if (!activeTab || activeTab.kind === 'diff') return;
		const nextModified = editContent !== (activeTab.content ?? '');
		setIsModified(nextModified);
		if (activeTab.isModified !== nextModified) {
			onUpdateTab(activeTab.id, { isModified: nextModified });
		}
	}, [activeTab, editContent, onUpdateTab]);

	const fileAnnotations = useMemo(() => {
		if (!activeTab || activeTab.kind === 'diff') return [] as LineAnnotation<{ id: string; comment: string }>[];
		const annotations: LineAnnotation<{ id: string; comment: string }>[] = [];
		for (const comment of getFileComments(activeTab.filePath)) {
			if (comment.origin !== 'file') continue;
			const normalized = getNormalizedRange(comment.selection);
			for (let line = normalized.start; line <= normalized.end; line += 1) {
				annotations.push({
					lineNumber: line,
					metadata: { id: comment.id, comment: comment.comment },
				});
			}
		}
		return annotations;
	}, [activeTab, getFileComments]);

	const diffData = useMemo(() => {
		if (!activeTab || activeTab.kind !== 'diff' || !activeTab.oldContent || !activeTab.newContent) return null;
		const lang = getLangFromPath(activeTab.filePath) as any;
		return parseDiffFromFile(
			{ name: activeTab.filePath, contents: activeTab.oldContent, lang },
			{ name: activeTab.filePath, contents: activeTab.newContent, lang },
		);
	}, [activeTab]);

	const handleAddComment = () => {
		if (!activeTab || !selectedRange) return;
		const trimmed = commentText.trim();
		if (!trimmed) return;
		onAddComment(activeTab.filePath, selectedRange, trimmed, activeTab.kind === 'diff' ? 'diff' : 'file');
		setCommentText('');
		setSelectedRange(null);
	};

	const handleSave = useCallback(async () => {
		if (!activeTab || activeTab.kind === 'diff' || activeTab.readonly) return;
		if (!isModified) return;
		setIsSaving(true);
		setSaveError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/files/content`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: activeTab.filePath, content: editContent }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			onUpdateTab(activeTab.id, { content: editContent, isModified: false });
			setIsModified(false);
		} catch {
			setSaveError('Failed to save file');
		} finally {
			setIsSaving(false);
		}
	}, [activeTab, editContent, isModified, onUpdateTab, sessionId]);

	useEffect(() => {
		if (!isEditing || !activeTab || activeTab.kind === 'diff') return;
		const handler = (event: KeyboardEvent) => {
			const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
			if (!isSave) return;
			event.preventDefault();
			void handleSave();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [activeTab, handleSave, isEditing]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<FileTabs
				tabs={tabs}
				activeId={activeId}
				onSelect={onSelectTab}
				onClose={onCloseTab}
			/>
			{!activeTab && (
				<div className="flex flex-1 items-center justify-center text-xs text-[var(--muted-foreground)]">
					Select a file or diff to view
				</div>
			)}
			{activeTab && activeTab.kind === 'diff' && (
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
						<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
							<span className="font-mono truncate" title={activeTab.filePath}>{activeTab.filePath}</span>
							<Badge variant="secondary" className="text-[10px]">Diff</Badge>
						</div>
				</div>
				<div className="flex-1 overflow-auto">
						{diffData ? (
							<div className="px-3 py-2">
								<div className="rounded-md border border-[var(--border)] overflow-hidden [&_pre]:!text-[11px] [&_pre]:!leading-[1.6]">
									<PierreDiff
										fileDiff={diffData}
										selectedLines={selectedRange}
										lineAnnotations={getDiffAnnotations(activeTab.filePath)}
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
								</div>
							</div>
						) : (
							<div className="px-3 py-4 text-xs text-[var(--muted-foreground)]">
								Unable to render diff
							</div>
						)}
					</div>
				</div>
			)}
			{activeTab && activeTab.kind !== 'diff' && (
				<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
					<div className="flex items-center gap-2 min-w-0">
						<span className="font-mono truncate" title={activeTab.filePath}>{activeTab.filePath}</span>
						{activeTab.kind === 'write' && (
							<Badge variant="secondary" className="text-[10px]">Generated</Badge>
						)}
						{activeTab.kind === 'read' && (
							<Badge variant="secondary" className="text-[10px]">Read</Badge>
						)}
						{isModified && (
							<Badge variant="outline" className="text-[10px]">Modified</Badge>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsEditing((prev) => !prev)}
							disabled={!canEdit}
							className="h-7 text-xs"
							title={isEditing ? 'View mode' : 'Edit file'}
						>
							<PencilLine className="h-3 w-3 mr-1" />
							{isEditing ? 'View' : 'Edit'}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleSave}
							disabled={!canEdit || !isModified || isSaving}
							className="h-7 text-xs"
							title="Save (Ctrl+S)"
						>
							{isSaving ? (
								<Loader2 className="h-3 w-3 mr-1 animate-spin" />
							) : (
								<Save className="h-3 w-3 mr-1" />
							)}
							Save
						</Button>
					</div>
				</div>
					<div className="flex-1 overflow-auto">
						{loading && (
							<div className="flex items-center justify-center py-8">
								<AlertCircle className="h-4 w-4 animate-pulse text-[var(--muted-foreground)]" />
							</div>
						)}
						{error && (
							<div className="flex items-center gap-2 px-3 py-4 text-xs text-red-500">
								<AlertCircle className="h-3.5 w-3.5 shrink-0" />
								{error}
							</div>
						)}
						{saveError && !error && (
							<div className="flex items-center gap-2 px-3 py-2 text-xs text-red-500">
								<AlertCircle className="h-3.5 w-3.5 shrink-0" />
								{saveError}
							</div>
						)}
						{!loading && !error && isEditing && (
							<div className="px-3 py-2">
								<textarea
									value={editContent}
									onChange={(event) => setEditContent(event.target.value)}
									className="w-full min-h-[400px] resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-[11px] leading-[1.6] text-[var(--foreground)]"
									spellCheck={false}
								/>
							</div>
						)}
						{!loading && !error && !isEditing && activeTab.content !== undefined && (
							<div className="px-3 py-2">
								<div className="rounded-md border border-[var(--border)] overflow-hidden [&_pre]:!text-[11px] [&_pre]:!leading-[1.6]">
									<PierreFile
										file={{
											name: activeTab.filePath,
											contents: activeTab.content ?? '',
											lang: getLangFromPath(activeTab.filePath) as any,
										}}
										selectedLines={selectedRange}
										lineAnnotations={fileAnnotations}
										renderAnnotation={(annotation) => (
											<div className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] text-[var(--foreground)] shadow-sm">
												{annotation.metadata?.comment ?? 'Comment'}
											</div>
										)}
										options={{
											theme: { dark: 'github-dark', light: 'github-light' },
											themeType: 'system',
											disableFileHeader: true,
											enableLineSelection: true,
											onLineSelected: (range) => setSelectedRange(range),
										}}
									/>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
			{activeTab && selectedRange && (
				<div className="border-t border-[var(--border)] bg-[var(--muted)] px-3 py-2">
					<div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
						<span>
							Selected lines {getNormalizedRange(selectedRange).start}
							{getNormalizedRange(selectedRange).end !== getNormalizedRange(selectedRange).start
								? `-${getNormalizedRange(selectedRange).end}`
								: ''}
						</span>
						<Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setSelectedRange(null)}>
							Clear selection
						</Button>
					</div>
					<div className="mt-2 flex gap-2">
						<input
							value={commentText}
							onChange={(event) => setCommentText(event.target.value)}
							placeholder="Add a comment for these lines"
							className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
						/>
						<Button size="sm" variant="default" className="h-7 text-xs" onClick={handleAddComment}>
							Add
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
