import { useCallback, useMemo, useState } from 'react';

export type FileTabKind = 'file' | 'diff' | 'write' | 'read';

export type FileTab = {
	id: string;
	kind: FileTabKind;
	filePath: string;
	title: string;
	content?: string;
	oldContent?: string;
	newContent?: string;
	readonly?: boolean;
};

export function getFileName(path: string) {
	return path.split('/').pop() || path;
}

export function upsertTab(tabs: FileTab[], tab: FileTab): FileTab[] {
	const existingIndex = tabs.findIndex((item) => item.id === tab.id);
	if (existingIndex === -1) {
		return [...tabs, tab];
	}
	const updated = [...tabs];
	updated[existingIndex] = { ...updated[existingIndex], ...tab };
	return updated;
}

export function updateTabState(tabs: FileTab[], id: string, updates: Partial<FileTab>): FileTab[] {
	return tabs.map((tab) => (tab.id === id ? { ...tab, ...updates } : tab));
}

export function closeTabState(
	tabs: FileTab[],
	activeId: string | null,
	id: string,
): { tabs: FileTab[]; activeId: string | null } {
	const idx = tabs.findIndex((tab) => tab.id === id);
	if (idx === -1) return { tabs, activeId };
	const nextTabs = tabs.filter((tab) => tab.id !== id);
	if (activeId !== id) return { tabs: nextTabs, activeId };
	const nextActive = nextTabs[idx - 1] ?? nextTabs[idx] ?? null;
	return { tabs: nextTabs, activeId: nextActive?.id ?? null };
}

export function useFileTabs() {
	const [tabs, setTabs] = useState<FileTab[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);

	const openTab = useCallback((tab: FileTab) => {
		setTabs((prev) => upsertTab(prev, tab));
		setActiveId(tab.id);
	}, []);

	const openFile = useCallback((filePath: string, content?: string) => {
		openTab({
			id: `file:${filePath}`,
			kind: 'file',
			filePath,
			title: getFileName(filePath),
			content,
		});
	}, [openTab]);

	const openRead = useCallback((filePath: string, content: string) => {
		openTab({
			id: `read:${filePath}`,
			kind: 'read',
			filePath,
			title: getFileName(filePath),
			content,
			readonly: true,
		});
	}, [openTab]);

	const openWrite = useCallback((filePath: string, content: string) => {
		openTab({
			id: `write:${filePath}`,
			kind: 'write',
			filePath,
			title: getFileName(filePath),
			content,
		});
	}, [openTab]);

	const openDiff = useCallback((filePath: string, oldContent: string, newContent: string) => {
		openTab({
			id: `diff:${filePath}`,
			kind: 'diff',
			filePath,
			title: getFileName(filePath),
			oldContent,
			newContent,
		});
	}, [openTab]);

	const closeTab = useCallback((id: string) => {
		setTabs((prev) => {
			const nextState = closeTabState(prev, activeId, id);
			if (nextState.activeId !== activeId) {
				setActiveId(nextState.activeId);
			}
			return nextState.tabs;
		});
	}, [activeId]);

	const updateTab = useCallback((id: string, updates: Partial<FileTab>) => {
		setTabs((prev) => updateTabState(prev, id, updates));
	}, []);

	const activeTab = useMemo(
		() => tabs.find((tab) => tab.id === activeId) ?? null,
		[tabs, activeId],
	);

	return {
		tabs,
		activeId,
		activeTab,
		setActiveId,
		openFile,
		openRead,
		openWrite,
		openDiff,
		closeTab,
		updateTab,
	};
}
