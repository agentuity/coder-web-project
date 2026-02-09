import type { BundledLanguage } from 'shiki';

const SUPPORTED_LANGS: BundledLanguage[] = [
	'typescript',
	'tsx',
	'javascript',
	'jsx',
	'json',
	'markdown',
	'css',
	'html',
	'yaml',
	'bash',
	'python',
	'rust',
	'go',
	'sql',
	'toml',
	'xml',
];

let highlighterPromise: Promise<any> | null = null;

export function getShikiHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = import('shiki').then((shiki) =>
			shiki.createHighlighter({
				themes: ['github-dark', 'github-light'],
				langs: SUPPORTED_LANGS,
			}),
		);
	}
	return highlighterPromise;
}

export function getLangFromExt(ext: string): BundledLanguage | 'text' {
	const map: Record<string, BundledLanguage | 'text'> = {
		ts: 'typescript',
		tsx: 'tsx',
		js: 'javascript',
		jsx: 'jsx',
		json: 'json',
		md: 'markdown',
		css: 'css',
		html: 'html',
		yml: 'yaml',
		yaml: 'yaml',
		sh: 'bash',
		bash: 'bash',
		py: 'python',
		rs: 'rust',
		go: 'go',
		sql: 'sql',
		toml: 'toml',
		xml: 'xml',
		svg: 'xml',
		txt: 'text',
	};
	return map[ext] || 'text';
}

export function getLangFromPath(filePath: string): BundledLanguage | 'text' {
	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
	return getLangFromExt(ext);
}
