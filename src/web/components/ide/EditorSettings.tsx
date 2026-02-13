import { Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../ui/select';
import { type EditorSettings as EditorSettingsType, EDITOR_THEME_OPTIONS } from '../../hooks/useEditorSettings';

interface EditorSettingsProps {
	settings: EditorSettingsType;
	onUpdate: (updates: Partial<EditorSettingsType>) => void;
}

const TAB_SIZE_OPTIONS = [2, 4, 8] as const;
const FONT_SIZE_OPTIONS = [11, 12, 13, 14, 15, 16] as const;

export function EditorSettings({ settings, onUpdate }: EditorSettingsProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0"
					title="Editor settings"
				>
					<Settings className="h-3.5 w-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-3">
				<div className="space-y-3">
					<div className="text-xs font-medium text-[var(--foreground)]">Editor Settings</div>

					{/* Theme */}
					<div className="space-y-1">
						<span className="text-[10px] text-[var(--muted-foreground)]">Theme</span>
						<Select value={settings.theme} onValueChange={(val) => onUpdate({ theme: val })}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EDITOR_THEME_OPTIONS.map((t) => (
									<SelectItem key={t.key} value={t.key} className="text-xs">
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Vim Mode */}
					<div className="flex items-center justify-between">
						<span className="text-[10px] text-[var(--muted-foreground)]">Vim Mode</span>
						<button
							type="button"
							role="switch"
							aria-checked={settings.vimMode}
							onClick={() => onUpdate({ vimMode: !settings.vimMode })}
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
						<span className="text-[10px] text-[var(--muted-foreground)]">Tab Size</span>
						<Select value={String(settings.tabSize)} onValueChange={(val) => onUpdate({ tabSize: Number(val) })}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TAB_SIZE_OPTIONS.map((size) => (
									<SelectItem key={size} value={String(size)} className="text-xs">
										{size} spaces
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Font Size */}
					<div className="space-y-1">
						<span className="text-[10px] text-[var(--muted-foreground)]">Font Size</span>
						<Select value={String(settings.fontSize)} onValueChange={(val) => onUpdate({ fontSize: Number(val) })}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FONT_SIZE_OPTIONS.map((size) => (
									<SelectItem key={size} value={String(size)} className="text-xs">
										{size}px
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
