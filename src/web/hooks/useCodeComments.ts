import { useCallback, useMemo, useState } from 'react';
import type { DiffLineAnnotation, SelectedLineRange } from '@pierre/diffs';

export type CodeComment = {
	id: string;
	file: string;
	selection: SelectedLineRange;
	comment: string;
	origin: 'diff' | 'file';
};

function createId() {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `comment-${Math.random().toString(36).slice(2)}`;
}

function normalizeRange(range: SelectedLineRange): SelectedLineRange {
	if (range.start <= range.end) return range;
	return {
		start: range.end,
		end: range.start,
		side: range.endSide ?? range.side,
		endSide: range.side,
	};
}

function formatRange(selection: SelectedLineRange) {
	const normalized = normalizeRange(selection);
	if (normalized.start === normalized.end) {
		return `${normalized.start}`;
	}
	return `${normalized.start}-${normalized.end}`;
}

export function useCodeComments() {
	const [comments, setComments] = useState<CodeComment[]>([]);

	const addComment = useCallback(
		(file: string, selection: SelectedLineRange, comment: string, origin: 'diff' | 'file') => {
			setComments((prev) => [
				...prev,
				{ id: createId(), file, selection: normalizeRange(selection), comment, origin },
			]);
		},
		[],
	);

	const clearComments = useCallback(() => setComments([]), []);

	const commentCount = comments.length;

	const getDiffAnnotations = useCallback(
		(file: string): DiffLineAnnotation<{ id: string; comment: string }>[] => {
			const annotations: DiffLineAnnotation<{ id: string; comment: string }>[] = [];
			for (const comment of comments) {
				if (comment.file !== file || comment.origin !== 'diff') continue;
				const { start, end, side } = comment.selection;
				const annotationSide = side ?? 'additions';
				for (let line = start; line <= end; line += 1) {
					annotations.push({
						side: annotationSide,
						lineNumber: line,
						metadata: { id: comment.id, comment: comment.comment },
					});
				}
			}
			return annotations;
		},
		[comments],
	);

	const getFileComments = useCallback(
		(file: string) => comments.filter((comment) => comment.file === file),
		[comments],
	);

	const formatForPrompt = useCallback(() => {
		if (comments.length === 0) return '';
		return comments
			.map((comment) => `${comment.file}:${formatRange(comment.selection)}: "${comment.comment}"`)
			.join('\n');
	}, [comments]);

	const pendingSummary = useMemo(() => {
		if (comments.length === 0) return null;
		return comments.map((comment) => ({
			id: comment.id,
			file: comment.file,
			range: formatRange(comment.selection),
			comment: comment.comment,
		}));
	}, [comments]);

	return {
		comments,
		commentCount,
		addComment,
		clearComments,
		formatForPrompt,
		getDiffAnnotations,
		getFileComments,
		pendingSummary,
	};
}
