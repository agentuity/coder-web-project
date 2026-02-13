import { useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter, keymap } from '@codemirror/view';

// Themes
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import { tokyoNightStorm } from '@uiw/codemirror-theme-tokyo-night-storm';
import { tokyoNightDay } from '@uiw/codemirror-theme-tokyo-night-day';
import { monokai } from '@uiw/codemirror-theme-monokai';
import { nord } from '@uiw/codemirror-theme-nord';
import { solarizedDark, solarizedLight } from '@uiw/codemirror-theme-solarized';
import { sublime } from '@uiw/codemirror-theme-sublime';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { xcodeLight, xcodeDark } from '@uiw/codemirror-theme-xcode';
import { aura } from '@uiw/codemirror-theme-aura';
import { material, materialDark } from '@uiw/codemirror-theme-material';
import { copilot } from '@uiw/codemirror-theme-copilot';
import { andromeda } from '@uiw/codemirror-theme-andromeda';

// Extensions
import { vim } from '@replit/codemirror-vim';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';

// Languages
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { php } from '@codemirror/lang-php';

interface CodeEditorProps {
	value: string;
	filePath: string;
	readOnly?: boolean;
	onChange?: (value: string) => void;
	onSave?: () => void;
	onLineComment?: (lineNumber: number) => void;
	theme: string;
	vimMode: boolean;
	tabSize: number;
	fontSize: number;
	className?: string;
}

const THEME_MAP: Record<string, Extension> = {
	githubDark,
	githubLight,
	dracula,
	tokyoNight,
	tokyoNightStorm,
	tokyoNightDay,
	monokai,
	nord,
	solarizedDark,
	solarizedLight,
	sublime,
	vscodeDark,
	xcodeLight,
	xcodeDark,
	aura,
	material,
	materialDark,
	copilot,
	andromeda,
};

// -- Comment gutter: hover-to-reveal 💬 icon on line gutters --

const setHoveredLine = StateEffect.define<number | null>();

const hoveredLineField = StateField.define<number | null>({
	create: () => null,
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setHoveredLine)) return effect.value;
		}
		return value;
	},
});

class CommentGutterMarker extends GutterMarker {
	override toDOM() {
		const span = document.createElement('span');
		span.textContent = '💬';
		span.style.cursor = 'pointer';
		span.style.fontSize = '12px';
		span.style.opacity = '0.7';
		span.title = 'Add comment';
		return span;
	}
}

const commentGutterMarker = new CommentGutterMarker();

function getLanguageExtension(filePath: string): Extension | null {
	const ext = filePath.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'ts':
		case 'tsx':
			return javascript({ typescript: true, jsx: ext === 'tsx' });
		case 'js':
		case 'jsx':
			return javascript({ jsx: ext === 'jsx' });
		case 'py':
			return python();
		case 'go':
			return go();
		case 'rs':
			return rust();
		case 'html':
		case 'htm':
			return html();
		case 'css':
		case 'scss':
			return css();
		case 'json':
			return json();
		case 'md':
		case 'mdx':
			return markdown();
		case 'yaml':
		case 'yml':
			return yaml();
		case 'sql':
			return sql();
		case 'xml':
		case 'svg':
			return xml();
		case 'java':
			return java();
		case 'cpp':
		case 'c':
		case 'h':
		case 'hpp':
			return cpp();
		case 'php':
			return php();
		default:
			return null;
	}
}

export default function CodeEditor({
	value,
	filePath,
	readOnly = false,
	onChange,
	onSave,
	onLineComment,
	theme,
	vimMode,
	tabSize,
	fontSize,
	className,
}: CodeEditorProps) {
	// Use refs for callbacks so extensions don't re-create when callbacks change
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const onLineCommentRef = useRef(onLineComment);
	onLineCommentRef.current = onLineComment;

	const extensions = useMemo(() => {
		const exts: Extension[] = [];

		// Language detection
		const langExt = getLanguageExtension(filePath);
		if (langExt) exts.push(langExt);

		// Indentation markers
		exts.push(indentationMarkers());

		// Vim mode
		if (vimMode) exts.push(vim());

		// Ctrl+S / Cmd+S save keymap
		exts.push(
			keymap.of([
				{
					key: 'Mod-s',
					run: () => {
						onSaveRef.current?.();
						return true;
					},
				},
			]),
		);

		// Gutter line selection — clicking a line number selects the entire line
		exts.push(
			EditorView.domEventHandlers({
				mousedown(event, view) {
					const target = event.target as HTMLElement;
					if (!target.closest('.cm-gutters')) return false;

					const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
					if (pos == null) return false;

					const line = view.state.doc.lineAt(pos);
					view.dispatch({
						selection: { anchor: line.from, head: line.to },
					});
					return true;
				},
			}),
		);

		// Comment gutter — shows 💬 on hover, click to add a line comment
		exts.push(hoveredLineField);
		exts.push(gutter({
			class: 'cm-comment-gutter',
			lineMarker(view, line) {
				const lineNo = view.state.doc.lineAt(line.from).number;
				const hovered = view.state.field(hoveredLineField);
				return hovered === lineNo ? commentGutterMarker : null;
			},
			lineMarkerChange(update) {
				return update.transactions.some((tr) =>
					tr.effects.some((e) => e.is(setHoveredLine)),
				);
			},
			domEventHandlers: {
				mouseover(view, line) {
					const lineNo = view.state.doc.lineAt(line.from).number;
					view.dispatch({ effects: setHoveredLine.of(lineNo) });
					return false;
				},
				mouseout(view) {
					view.dispatch({ effects: setHoveredLine.of(null) });
					return false;
				},
				click(view, line) {
					const lineNo = view.state.doc.lineAt(line.from).number;
					onLineCommentRef.current?.(lineNo);
					return true;
				},
			},
		}));
		exts.push(EditorView.theme({
			'.cm-comment-gutter': {
				width: '20px',
			},
			'.cm-comment-gutter .cm-gutterElement': {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: '0',
			},
		}));

		return exts;
	}, [filePath, vimMode]);

	const resolvedTheme = THEME_MAP[theme] ?? githubDark;

	return (
		<CodeMirror
			value={value}
			onChange={onChange}
			readOnly={readOnly}
			theme={resolvedTheme}
			extensions={extensions}
			className={className}
			height="100%"
			style={{ height: '100%', fontSize: `${fontSize}px` }}
			basicSetup={{
				lineNumbers: true,
				foldGutter: true,
				bracketMatching: true,
				closeBrackets: true,
				autocompletion: false,
				highlightActiveLine: true,
				highlightSelectionMatches: true,
				searchKeymap: true,
				foldKeymap: true,
				tabSize,
			}}
		/>
	);
}
