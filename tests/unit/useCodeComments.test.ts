import { describe, expect, test } from 'bun:test';
import type { SelectedLineRange } from '@pierre/diffs';
import {
	addCommentState,
	buildPendingSummary,
	createComment,
	formatCommentsForPrompt,
	formatRange,
	getDiffAnnotationsForComments,
	getFileCommentsFor,
	normalizeRange,
} from '../../src/web/hooks/useCodeComments';

describe('useCodeComments helpers', () => {
	test('normalizeRange swaps reversed ranges', () => {
		const range: SelectedLineRange = { start: 5, end: 2, side: 'deletions', endSide: 'additions' };
		const normalized = normalizeRange(range);
		expect(normalized.start).toBe(2);
		expect(normalized.end).toBe(5);
		expect(normalized.side).toBe('additions');
		expect(normalized.endSide).toBe('deletions');
	});

	test('formatRange returns single line for same start/end', () => {
		expect(formatRange({ start: 3, end: 3, side: 'additions' })).toBe('3');
	});

	test('createComment normalizes selection and preserves id', () => {
		const comment = createComment({
			id: 'fixed',
			file: '/a.ts',
			selection: { start: 4, end: 2, side: 'additions' },
			comment: 'Check this',
			origin: 'diff',
		});
		expect(comment.id).toBe('fixed');
		expect(comment.selection.start).toBe(2);
	});

	test('getDiffAnnotationsForComments returns per-line annotations', () => {
		const comment = createComment({
			id: 'c1',
			file: '/a.ts',
			selection: { start: 1, end: 2, side: 'additions' },
			comment: 'Note',
			origin: 'diff',
		});
		const annotations = getDiffAnnotationsForComments([comment], '/a.ts');
		expect(annotations).toHaveLength(2);
		expect(annotations[0].metadata?.comment).toBe('Note');
	});

	test('formatCommentsForPrompt returns formatted list', () => {
		const comment = createComment({
			id: 'c2',
			file: '/b.ts',
			selection: { start: 7, end: 8, side: 'additions' },
			comment: 'Refactor',
			origin: 'file',
		});
		const result = formatCommentsForPrompt([comment]);
		expect(result).toBe('/b.ts:7-8: "Refactor"');
	});

	test('buildPendingSummary returns null for empty comments', () => {
		expect(buildPendingSummary([])).toBeNull();
	});

	test('getFileCommentsFor filters by file', () => {
		const comments = addCommentState([], createComment({
			id: 'c3',
			file: '/a.ts',
			selection: { start: 1, end: 1, side: 'additions' },
			comment: 'A',
			origin: 'file',
		}));
		const filtered = getFileCommentsFor(comments, '/a.ts');
		expect(filtered).toHaveLength(1);
	});
});
