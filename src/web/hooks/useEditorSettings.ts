import { useState, useCallback } from 'react';

const STORAGE_KEY = 'agentuity-editor-settings';

export interface EditorSettings {
	theme: string;
	vimMode: boolean;
	tabSize: number;
	fontSize: number;
}

const DEFAULT_SETTINGS: EditorSettings = {
	theme: 'githubDark',
	vimMode: false,
	tabSize: 2,
	fontSize: 13,
};

/** Theme keys available for the editor picker — labels only, no heavy imports. */
export const EDITOR_THEME_OPTIONS = [
	{ key: 'githubDark', label: 'GitHub Dark' },
	{ key: 'githubLight', label: 'GitHub Light' },
	{ key: 'dracula', label: 'Dracula' },
	{ key: 'tokyoNight', label: 'Tokyo Night' },
	{ key: 'tokyoNightStorm', label: 'Tokyo Night Storm' },
	{ key: 'tokyoNightDay', label: 'Tokyo Night Day' },
	{ key: 'monokai', label: 'Monokai' },
	{ key: 'nord', label: 'Nord' },
	{ key: 'solarizedDark', label: 'Solarized Dark' },
	{ key: 'solarizedLight', label: 'Solarized Light' },
	{ key: 'sublime', label: 'Sublime' },
	{ key: 'vscodeDark', label: 'VS Code Dark' },
	{ key: 'xcodeLight', label: 'Xcode Light' },
	{ key: 'xcodeDark', label: 'Xcode Dark' },
	{ key: 'aura', label: 'Aura' },
	{ key: 'material', label: 'Material' },
	{ key: 'materialDark', label: 'Material Dark' },
	{ key: 'copilot', label: 'Copilot' },
	{ key: 'andromeda', label: 'Andromeda' },
] as const;

function loadSettings(): EditorSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_SETTINGS, ...parsed };
	} catch {
		return DEFAULT_SETTINGS;
	}
}

function saveSettings(settings: EditorSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// localStorage may be unavailable
	}
}

export function useEditorSettings() {
	const [settings, setSettings] = useState<EditorSettings>(() => loadSettings());

	const updateSettings = useCallback((updates: Partial<EditorSettings>) => {
		setSettings((prev) => {
			const next = { ...prev, ...updates };
			saveSettings(next);
			return next;
		});
	}, []);

	return { settings, updateSettings } as const;
}
