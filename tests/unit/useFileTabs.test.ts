import { describe, expect, test } from 'bun:test';
import type { FileTab } from '../../src/web/hooks/useFileTabs';
import { closeTabState, getFileName, updateTabState, upsertTab } from '../../src/web/hooks/useFileTabs';

describe('useFileTabs helpers', () => {
	const baseTabs: FileTab[] = [
		{ id: 'file:/a.ts', kind: 'file', filePath: '/a.ts', title: 'a.ts' },
		{ id: 'file:/b.ts', kind: 'file', filePath: '/b.ts', title: 'b.ts' },
	];

	test('getFileName returns last path segment', () => {
		expect(getFileName('/path/to/file.ts')).toBe('file.ts');
	});

	test('upsertTab adds a new tab', () => {
		const next = upsertTab(baseTabs, { id: 'file:/c.ts', kind: 'file', filePath: '/c.ts', title: 'c.ts' });
		expect(next).toHaveLength(3);
		expect(next[2].id).toBe('file:/c.ts');
	});

	test('upsertTab updates an existing tab', () => {
		const next = upsertTab(baseTabs, {
			id: 'file:/a.ts',
			kind: 'file',
			filePath: '/a.ts',
			title: 'a.ts',
			content: 'updated',
		});
		expect(next).toHaveLength(2);
		expect(next[0].content).toBe('updated');
	});

	test('closeTabState switches to previous tab when closing active', () => {
		const state = closeTabState(baseTabs, 'file:/b.ts', 'file:/b.ts');
		expect(state.tabs).toHaveLength(1);
		expect(state.activeId).toBe('file:/a.ts');
	});

	test('closeTabState keeps active tab when closing non-active', () => {
		const state = closeTabState(baseTabs, 'file:/a.ts', 'file:/b.ts');
		expect(state.activeId).toBe('file:/a.ts');
		expect(state.tabs).toHaveLength(1);
	});

	test('updateTabState merges updates', () => {
		const next = updateTabState(baseTabs, 'file:/b.ts', { title: 'b-new.ts' });
		expect(next[1].title).toBe('b-new.ts');
	});
});
