import {
	CornerDownLeftIcon,
	Loader2Icon,
	SquareIcon,
	XIcon,
} from 'lucide-react';
import type { ComponentProps, FormEvent, HTMLAttributes, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';

export type PromptInputMessage = {
	text: string;
};

export type PromptInputProps = Omit<
	HTMLAttributes<HTMLFormElement>,
	'onSubmit'
> & {
	onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) =>
		| void
		| Promise<void>;
};

const PromptInputContext = createContext<boolean>(false);

export const PromptInputProvider = ({ children }: { children: ReactNode }) => (
	<PromptInputContext.Provider value>{children}</PromptInputContext.Provider>
);

export const usePromptInputProvider = () => useContext(PromptInputContext);

export const PromptInput = ({
	className,
	onSubmit,
	children,
	...props
}: PromptInputProps) => {
	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const text = (formData.get('message') as string) || '';
		void onSubmit({ text }, event);
	};

	return (
		<form
			className={cn('w-full safe-area-bottom', className)}
			onSubmit={handleSubmit}
			{...props}
		>
		<div className="border border-[var(--border)] bg-[var(--background)]">
			{children}
		</div>
		</form>
	);
};

export type PromptInputTextareaProps = ComponentProps<typeof Textarea>;

export const PromptInputTextarea = ({
	className,
	placeholder = 'Send a message...',
	onKeyDown,
	onChange,
	value,
	...props
}: PromptInputTextareaProps) => {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const adjustHeight = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, []);

	// Adjust on value changes (controlled component)
	// biome-ignore lint/correctness/useExhaustiveDependencies: value triggers recalc even though adjustHeight reads from DOM
	useEffect(() => {
		adjustHeight();
	}, [value, adjustHeight]);

	const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (
		event
	) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
			// Reset height after submit
			if (textareaRef.current) {
				textareaRef.current.style.height = 'auto';
			}
			return;
		}
		onKeyDown?.(event);
	};

	const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (event) => {
		onChange?.(event);
		adjustHeight();
	};

	return (
		<Textarea
			ref={textareaRef}
			data-prompt-input="true"
			className={cn(
				'min-h-[3rem] max-h-[200px] resize-none border-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none overflow-y-auto',
				className
			)}
			name="message"
			onChange={handleChange}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			rows={1}
			value={value}
			{...props}
		/>
	);
};

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputFooter = ({
	className,
	...props
}: PromptInputFooterProps) => (
	<div
		className={cn('flex items-center justify-between gap-2 px-3 pb-2', className)}
		{...props}
	/>
);

export type PromptInputSubmitStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
	status?: PromptInputSubmitStatus;
	onStop?: () => void;
};

export const PromptInputSubmit = ({
	className,
	variant = 'default',
	status = 'ready',
	onStop,
	children,
	...props
}: PromptInputSubmitProps) => {
	let Icon = <CornerDownLeftIcon className="h-4 w-4" />;

	if (status === 'submitted') {
		Icon = <Loader2Icon className="h-4 w-4 animate-spin" />;
	} else if (status === 'streaming') {
		Icon = <SquareIcon className="h-4 w-4" />;
	} else if (status === 'error') {
		Icon = <XIcon className="h-4 w-4" />;
	}

	const isStreaming = status === 'streaming' && onStop;

	const { onClick, disabled, ...restProps } = props;

	return (
		<Button
			aria-label={isStreaming ? 'Stop' : 'Submit'}
			className={cn('h-9 w-9', className)}
			size="icon"
			type={isStreaming ? 'button' : 'submit'}
			variant={isStreaming ? 'destructive' : variant}
			disabled={isStreaming ? false : disabled}
			{...restProps}
			onClick={isStreaming ? onStop : onClick}
		>
			{children ?? Icon}
		</Button>
	);
};
