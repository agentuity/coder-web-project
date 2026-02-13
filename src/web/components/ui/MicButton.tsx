import { Loader2, Mic, MicOff } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

interface MicButtonProps {
	isListening: boolean;
	isProcessing: boolean;
	isSupported: boolean;
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}

export function MicButton({
	isListening,
	isProcessing,
	isSupported,
	onClick,
	disabled = false,
	className,
}: MicButtonProps) {
	if (!isSupported) return null;

	const isDisabled = disabled || isProcessing;

	return (
		<div className="relative inline-flex items-center justify-center">
			{isListening && (
				<div className="absolute inset-0 rounded-md animate-ping bg-red-500/20 pointer-events-none" />
			)}
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={onClick}
				disabled={isDisabled}
				className={cn('h-9 w-9', className)}
				aria-label={isListening ? 'Stop listening' : isProcessing ? 'Processing voice' : 'Start voice input'}
				title={isListening ? 'Stop listening' : isProcessing ? 'Processing voice' : 'Voice input'}
			>
				{isProcessing ? (
					<Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
				) : isListening ? (
					<MicOff className="h-4 w-4 text-red-500" />
				) : (
					<Mic className="h-4 w-4" />
				)}
			</Button>
		</div>
	);
}
