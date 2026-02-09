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

function getFileName(path: string) {
	return path.split('/').pop() || path;
}

export function useFileTabs() {
	const [tabs, setTabs] = useState<FileTab[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);

	const openTab = useCallback((tab: FileTab) => {
		setTabs((prev) => {
			const existingIndex = prev.findIndex((item) => item.id === tab.id);
			if (existingIndex === -1) {
				return [...prev, tab];
			}
			const updated = [...prev];
			updated[existingIndex] = { ...updated[existingIndex], ...tab };
			return updated;
		});
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
			const idx = prev.findIndex((tab) => tab.id === id);
			if (idx === -1) return prev;
			const nextTabs = prev.filter((tab) => tab.id !== id);
			if (activeId === id) {
				const nextActive = nextTabs[idx - 1] ?? nextTabs[idx] ?? null;
				setActiveId(nextActive?.id ?? null);
			}
			return nextTabs;
		});
	}, [activeId]);

	const updateTab = useCallback((id: string, updates: Partial<FileTab>) => {
		setTabs((prev) =>
			prev.map((tab) => (tab.id === id ? { ...tab, ...updates } : tab)),
		);
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
