import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../ui/select';
import { useEditorSettings, EDITOR_THEME_OPTIONS } from '../../hooks/useEditorSettings';

const TAB_SIZE_OPTIONS = [2, 4, 8] as const;
const FONT_SIZE_OPTIONS = [11, 12, 13, 14, 15, 16] as const;

export function EditorPreferencesSettings() {
	const { settings, updateSettings } = useEditorSettings();

	return (
		<div className="space-y-4">
			{/* Theme */}
			<div className="space-y-1">
				<label className="text-xs text-[var(--muted-foreground)]">Editor Theme</label>
				<Select value={settings.theme} onValueChange={(val) => updateSettings({ theme: val })}>
					<SelectTrigger className="h-8 text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{EDITOR_THEME_OPTIONS.map((t) => (
							<SelectItem key={t.key} value={t.key} className="text-sm">
								{t.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Vim Mode */}
			<div className="flex items-center justify-between">
				<div>
					<div className="text-sm text-[var(--foreground)]">Vim Mode</div>
					<div className="text-xs text-[var(--muted-foreground)]">Enable Vim keybindings in the code editor</div>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={settings.vimMode}
					onClick={() => updateSettings({ vimMode: !settings.vimMode })}
					className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
						settings.vimMode ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'
					}`}
				>
					<span
						className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
							settings.vimMode ? 'translate-x-4' : 'translate-x-0.5'
						}`}
					/>
				</button>
			</div>

			{/* Tab Size */}
			<div className="space-y-1">
				<label className="text-xs text-[var(--muted-foreground)]">Tab Size</label>
				<Select value={String(settings.tabSize)} onValueChange={(val) => updateSettings({ tabSize: Number(val) })}>
					<SelectTrigger className="h-8 text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TAB_SIZE_OPTIONS.map((size) => (
							<SelectItem key={size} value={String(size)} className="text-sm">
								{size} spaces
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Font Size */}
			<div className="space-y-1">
				<label className="text-xs text-[var(--muted-foreground)]">Font Size</label>
				<Select value={String(settings.fontSize)} onValueChange={(val) => updateSettings({ fontSize: Number(val) })}>
					<SelectTrigger className="h-8 text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{FONT_SIZE_OPTIONS.map((size) => (
							<SelectItem key={size} value={String(size)} className="text-sm">
								{size}px
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
