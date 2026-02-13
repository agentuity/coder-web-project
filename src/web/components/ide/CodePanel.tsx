import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { File as PierreFile, FileDiff as PierreDiff } from '@pierre/diffs/react';
import {
	parseDiffFromFile,
	type DiffLineAnnotation,
	type SelectedLineRange,
} from '@pierre/diffs';
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { FileTabs } from './FileTabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getLangFromPath } from '../../lib/shiki';
import type { EditorSettings } from '../../hooks/useEditorSettings';
import type { FileTab } from '../../hooks/useFileTabs';
import type { CodeComment } from '../../hooks/useCodeComments';

const CodeEditor = lazy(() => import('./CodeEditor'));

// Prefetch: start loading CodeEditor module immediately when this module is evaluated.
// By the time the user clicks a file, the module is already loaded or loading.
void import('./CodeEditor');

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
	editorSettings: EditorSettings;
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
	editorSettings,
}: CodePanelProps) {
	const { theme } = useAppContext();
	const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;

	// Extract primitive values from activeTab to use as stable useEffect dependencies.
	// Using the full activeTab object reference causes infinite render loops because
	// onUpdateTab() creates a new tab object via spread, changing the reference,
	// which re-fires effects that depend on it.
	const activeTabId = activeTab?.id;
	const activeTabContent = activeTab?.content;
	const activeTabKind = activeTab?.kind;
	const activeTabFilePath = activeTab?.filePath;

	const canEdit = Boolean(
		activeTab
		&& activeTab.kind !== 'diff'
		&& !activeTab.readonly
		&& activeTab.content !== undefined,
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editContent, setEditContent] = useState('');
	const [isModified, setIsModified] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
	const [commentText, setCommentText] = useState('');

	const resetKey = activeTab?.id ?? 'none';

	// Track last synced isModified value via ref to avoid including activeTabIsModified
	// in the dependency array, which would create a render cycle:
	// editContent changes → effect fires → onUpdateTab({isModified}) → activeTabIsModified changes → effect re-fires
	const lastSyncedModified = useRef<boolean | undefined>(undefined);
	// When switching tabs, the reset effect and isModified effect both fire in the same
	// render cycle. But editContent still holds the OLD tab's value (setState is queued).
	// The isModified effect would compute: oldEditContent !== newTabContent → TRUE → flash!
	// This ref tells the isModified effect to skip when a reset just happened.
	const justReset = useRef(false);

	useEffect(() => {
		if (!resetKey) return;
		lastSyncedModified.current = undefined;
		justReset.current = true;
		setSelectedRange(null);
		setCommentText('');
		setError(null);
		setSaveError(null);
		setEditContent(activeTabContent ?? '');
		setIsModified(false);
	}, [activeTabContent, resetKey]);

	useEffect(() => {
		if (!activeTabId || activeTabKind === 'diff') return;
		if (activeTabContent !== undefined) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetch(`/api/sessions/${sessionId}/files/content?path=${encodeURIComponent(activeTabFilePath!)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data) => {
				if (cancelled) return;
				onUpdateTab(activeTabId, { content: data.content || '' });
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
	}, [activeTabId, activeTabKind, activeTabContent, activeTabFilePath, onUpdateTab, sessionId]);

	useEffect(() => {
		if (!activeTabId || activeTabKind === 'diff') return;
		// Skip this cycle if the reset effect just fired — editContent is stale
		// (still holds the previous tab's content until React applies the queued setState).
		if (justReset.current) {
			justReset.current = false;
			return;
		}
		const nextModified = editContent !== (activeTabContent ?? '');
		setIsModified(nextModified);
		if (lastSyncedModified.current !== nextModified) {
			lastSyncedModified.current = nextModified;
			onUpdateTab(activeTabId, { isModified: nextModified });
		}
	}, [activeTabId, activeTabContent, activeTabKind, editContent, onUpdateTab]);

	const diffData = useMemo(() => {
		if (!activeTab || activeTab.kind !== 'diff' || activeTab.oldContent === undefined || activeTab.newContent === undefined) return null;
		const lang = getLangFromPath(activeTab.filePath) as any;
		return parseDiffFromFile(
			{ name: activeTab.filePath, contents: activeTab.oldContent, lang },
			{ name: activeTab.filePath, contents: activeTab.newContent, lang },
		);
	}, [activeTab]);

	const isNewFileDiff = Boolean(
		activeTab
		&& activeTab.kind === 'diff'
		&& activeTab.oldContent === ''
		&& (activeTab.newContent ?? '') !== '',
	);

	const isEmptyDiff = Boolean(
		activeTab
		&& activeTab.kind === 'diff'
		&& (activeTab.oldContent ?? '') === ''
		&& (activeTab.newContent ?? '') === '',
	);

	const isIdenticalDiff = Boolean(
		activeTab
		&& activeTab.kind === 'diff'
		&& !isNewFileDiff
		&& !isEmptyDiff
		&& activeTab.oldContent === activeTab.newContent,
	);

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

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="shrink-0">
				<FileTabs
					tabs={tabs}
					activeId={activeId}
					onSelect={onSelectTab}
					onClose={onCloseTab}
				/>
			</div>
			<div className="flex-1 min-h-0 overflow-hidden">
				{!activeTab && (
					<div className="flex h-full items-center justify-center text-xs text-[var(--muted-foreground)]">
						Select a file or diff to view
					</div>
				)}
				{activeTab && activeTab.kind === 'diff' && (
					<div className="flex h-full min-h-0 flex-col">
						<div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
							<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
								<span className="font-mono truncate" title={activeTab.filePath}>{activeTab.filePath}</span>
								<Badge variant="secondary" className="text-[10px]">
									{isNewFileDiff ? 'New File' : isEmptyDiff ? 'New File' : isIdenticalDiff ? 'No Changes' : 'Diff'}
								</Badge>
							</div>
						</div>
						<div className="flex-1 min-h-0 overflow-y-auto">
							{isEmptyDiff ? (
								<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
									<div className="text-2xl">📄</div>
									<div className="text-sm font-medium text-[var(--foreground)]">New file</div>
									<div className="text-xs text-[var(--muted-foreground)]">
										This file was just created. There&apos;s no previous version to compare against.
									</div>
								</div>
							) : isIdenticalDiff ? (
								<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
									<div className="text-2xl">✓</div>
									<div className="text-sm font-medium text-[var(--foreground)]">No changes</div>
									<div className="text-xs text-[var(--muted-foreground)]">
										This file is identical to the previous version.
									</div>
								</div>
							) : isNewFileDiff ? (
								<div className="px-3 py-2">
									<div className="rounded-md border border-[var(--border)] overflow-hidden [&_pre]:!text-[11px] [&_pre]:!leading-[1.6]">
										<PierreFile
											file={{
												name: activeTab.filePath,
												contents: activeTab.newContent ?? '',
												lang: getLangFromPath(activeTab.filePath) as any,
											}}
											selectedLines={selectedRange}
											lineAnnotations={getDiffAnnotations(activeTab.filePath)}
											renderAnnotation={(annotation) => (
												<div className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] text-[var(--foreground)] shadow-sm">
													{annotation.metadata?.comment ?? 'Comment'}
												</div>
											)}
											options={{
												theme: { dark: 'github-dark', light: 'github-light' },
												themeType: theme,
												disableFileHeader: true,
												enableLineSelection: true,
												onLineSelected: (range) => setSelectedRange(range),
											}}
										/>
									</div>
								</div>
							) : diffData ? (
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
												themeType: theme,
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
								<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
									<div className="text-xs text-[var(--muted-foreground)]">
										Unable to render diff
									</div>
								</div>
							)}
						</div>
					</div>
				)}
				{activeTab && activeTab.kind !== 'diff' && (
					<div className="flex h-full min-h-0 flex-col">
						<div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
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
							{isModified && (
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
								)}
							</div>
						</div>
						<div className="flex-1 min-h-0 overflow-hidden">
							{loading && (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
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
							{!loading && !error && activeTab.content !== undefined && (
								<Suspense fallback={
									<div className="flex items-center justify-center h-full">
										<Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
									</div>
								}>
								<CodeEditor
									value={editContent}
									filePath={activeTab.filePath}
									readOnly={!canEdit}
									onChange={(val) => setEditContent(val)}
									onSave={handleSave}
									onLineComment={(lineNumber) => {
										setSelectedRange({ start: lineNumber, end: lineNumber, side: 'additions' });
									}}
									theme={editorSettings.theme}
									vimMode={editorSettings.vimMode}
									tabSize={editorSettings.tabSize}
									fontSize={editorSettings.fontSize}
								/>
								</Suspense>
							)}
						</div>
					</div>
				)}
			</div>
			{activeTab && activeTab.kind === 'diff' && selectedRange && (
				<div className="shrink-0 border-t border-[var(--border)] bg-[var(--muted)] px-3 py-2">
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
			{activeTab && activeTab.kind !== 'diff' && selectedRange && (
				<div className="shrink-0 border-t border-[var(--border)] bg-[var(--muted)] px-3 py-2">
					<div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
						<span>
							Line {getNormalizedRange(selectedRange).start}
							{getNormalizedRange(selectedRange).end !== getNormalizedRange(selectedRange).start
								? `-${getNormalizedRange(selectedRange).end}`
								: ''}
						</span>
						<Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setSelectedRange(null)}>
							Clear
						</Button>
					</div>
					<div className="mt-2 flex gap-2">
						<input
							ref={(el) => el?.focus()}
							value={commentText}
							onChange={(event) => setCommentText(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') handleAddComment();
							}}
							placeholder="Add a comment for this line"
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
