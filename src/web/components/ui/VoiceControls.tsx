import { useState } from 'react';
import { Loader2, Mic, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface VoiceControlsProps {
	narratorEnabled: boolean;
	onNarratorToggle: () => void;
	isListening: boolean;
	onMicToggle: () => void;
	isProcessing: boolean;
	isSupported: boolean;
	isCountingDown: boolean;
	countdownProgress: number;
	disabled?: boolean;
	className?: string;
}

export function VoiceControls({
	narratorEnabled,
	onNarratorToggle,
	isListening,
	onMicToggle,
	isProcessing,
	isSupported,
	isCountingDown,
	countdownProgress,
	disabled = false,
	className,
}: VoiceControlsProps) {
	const [showHint, setShowHint] = useState(false);

	if (!isSupported) return null;

	const micActive = isListening && !narratorEnabled;
	const bothActive = narratorEnabled;

	return (
		<fieldset
			aria-label="Voice controls"
			className={cn(
				'relative inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--muted)] m-0 p-0 h-9',
				className,
			)}
		>
			{/* Mic half */}
			<button
				type="button"
				onClick={onMicToggle}
				disabled={disabled || isProcessing}
				aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
				className={cn(
					'relative flex items-center justify-center h-full w-9 transition-colors',
					isProcessing && 'cursor-not-allowed opacity-50',
					micActive && 'bg-red-500/20 text-red-500',
					bothActive && 'bg-[var(--primary)]/15 text-[var(--primary)]',
					!isListening && !narratorEnabled && 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
				)}
			>
				{isListening && !narratorEnabled && (
					<div className="absolute inset-0 animate-ping rounded-none bg-red-500/10 pointer-events-none" />
				)}
				{isProcessing ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Mic className="h-4 w-4" />
				)}
			</button>

			{/* Divider */}
			<div className="h-4 w-px bg-[var(--border)]" />

			{/* Narrator half */}
			<div className="relative">
				<button
					type="button"
					onClick={onNarratorToggle}
					onMouseEnter={() => setShowHint(true)}
					onMouseLeave={() => setShowHint(false)}
					disabled={disabled}
					aria-label={narratorEnabled ? 'Disable narrator mode' : 'Enable narrator mode'}
				className={cn(
					'relative flex items-center justify-center h-full w-9 transition-colors',
					narratorEnabled && 'bg-[var(--primary)]/15 text-[var(--primary)]',
					narratorEnabled && isCountingDown && 'animate-pulse',
					!narratorEnabled && 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
				)}
				>
					{narratorEnabled ? (
						<Circle className="h-3.5 w-3.5 fill-current" />
					) : (
						<Circle className="h-3.5 w-3.5" />
					)}
				</button>

				{/* Hint popover */}
				{showHint && !narratorEnabled && (
					<div className="absolute bottom-full right-0 mb-2 w-52 rounded-md border border-[var(--border)] bg-[var(--popover)] p-2.5 text-xs text-[var(--popover-foreground)] shadow-md z-50">
						<p className="font-medium mb-1">Voice Narrator</p>
						<p className="text-[var(--muted-foreground)] leading-relaxed">
							Speak and your message sends automatically after a pause. Say <span className="font-medium text-[var(--foreground)]">"send"</span> or <span className="font-medium text-[var(--foreground)]">"go"</span> to send immediately, or <span className="font-medium text-[var(--foreground)]">"cancel"</span> to clear.
						</p>
					</div>
				)}
			</div>

			{/* Countdown progress bar */}
			{isCountingDown && (
				<div
					className="absolute bottom-0 left-0 h-0.5 bg-[var(--primary)]/70"
					style={{ width: `${countdownProgress * 100}%` }}
				/>
			)}
		</fieldset>
	);
}
