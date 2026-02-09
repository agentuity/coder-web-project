import { useMemo, useState } from 'react';
import { File as PierreFile } from '@pierre/diffs/react';
import type { LineAnnotation, SelectedLineRange } from '@pierre/diffs';
import { getLangFromPath } from '../../lib/shiki';
import { Button } from '../ui/button';
import type { CodeComment } from '../../hooks/useCodeComments';

function getNormalizedRange(range: SelectedLineRange) {
	if (range.start <= range.end) return range;
	return { ...range, start: range.end, end: range.start };
}

interface CodeWithCommentsProps {
	code: string;
	filePath: string;
	onAddComment?: (
		file: string,
		selection: SelectedLineRange,
		comment: string,
		origin: 'diff' | 'file',
	) => void;
	comments?: CodeComment[];
	/** Maximum height CSS class for the code container (default: "max-h-64") */
	maxHeightClass?: string;
}

export function CodeWithComments({
	code,
	filePath,
	onAddComment,
	comments = [],
	maxHeightClass = 'max-h-64',
}: CodeWithCommentsProps) {
	const lang = getLangFromPath(filePath) as any;
	const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
	const [commentText, setCommentText] = useState('');

	const fileAnnotations = useMemo(() => {
		const annotations: LineAnnotation<{ id: string; comment: string }>[] = [];
		for (const comment of comments) {
			if (comment.file !== filePath) continue;
			const normalized = getNormalizedRange(comment.selection);
			for (let line = normalized.start; line <= normalized.end; line += 1) {
				annotations.push({
					lineNumber: line,
					metadata: { id: comment.id, comment: comment.comment },
				});
			}
		}
		return annotations;
	}, [comments, filePath]);

	const handleAddComment = () => {
		if (!onAddComment || !selectedRange) return;
		const trimmed = commentText.trim();
		if (!trimmed) return;
		onAddComment(filePath, selectedRange, trimmed, 'file');
		setCommentText('');
		setSelectedRange(null);
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleAddComment();
		}
	};

	const normalizedSelection = selectedRange ? getNormalizedRange(selectedRange) : null;

	return (
		<div>
			<div
				className={`rounded-md border border-[var(--border)] overflow-hidden overflow-y-auto overflow-x-auto [&_pre]:!text-[11px] [&_pre]:!leading-[1.6] ${maxHeightClass}`}
			>
				<PierreFile
					file={{ name: filePath, contents: code, lang }}
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
						overflow: 'scroll',
						enableLineSelection: !!onAddComment,
						onLineSelected: (range: SelectedLineRange | null) => setSelectedRange(range),
					}}
				/>
			</div>
			{onAddComment && normalizedSelection && (
				<div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
					<div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] mb-1">
						<span>
							Lines {normalizedSelection.start}
							{normalizedSelection.end !== normalizedSelection.start
								? `\u2013${normalizedSelection.end}`
								: ''}
						</span>
						<Button
							size="sm"
							variant="ghost"
							className="h-5 text-[10px] px-1"
							onClick={() => setSelectedRange(null)}
						>
							Clear
						</Button>
					</div>
					<div className="flex gap-2">
						<input
							value={commentText}
							onChange={(event) => setCommentText(event.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Add a comment for these lines"
							className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
						/>
						<Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleAddComment}>
							Comment
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
