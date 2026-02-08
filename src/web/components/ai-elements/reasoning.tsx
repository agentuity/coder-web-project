import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, memo, useContext, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
import { cn } from '../../lib/utils';
import { Shimmer } from './shimmer';

type ReasoningContextValue = {
	isStreaming: boolean;
	isOpen: boolean;
	duration?: number;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
	const context = useContext(ReasoningContext);
	if (!context) {
		throw new Error('Reasoning components must be used within Reasoning');
	}
	return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
	duration?: number;
};

export const Reasoning = memo(
	({
		className,
		isStreaming = false,
		duration,
		children,
		open,
		defaultOpen = true,
		onOpenChange,
		...props
	}: ReasoningProps) => {
		const [internalOpen, setInternalOpen] = useState(defaultOpen);
		const isOpen = open ?? internalOpen;

		const handleOpenChange = (nextOpen: boolean) => {
			if (open === undefined) {
				setInternalOpen(nextOpen);
			}
			onOpenChange?.(nextOpen);
		};

		const context = useMemo(
			() => ({
				isStreaming,
				isOpen,
				duration,
			}),
			[isStreaming, duration, isOpen]
		);

		return (
			<ReasoningContext.Provider value={context}>
				<Collapsible
					className={cn('not-prose mb-2', className)}
					defaultOpen={defaultOpen}
					onOpenChange={handleOpenChange}
					open={isOpen}
					{...props}
				>
					{children}
				</Collapsible>
			</ReasoningContext.Provider>
		);
	}
);

export type ReasoningTriggerProps = ComponentProps<
	typeof CollapsibleTrigger
> & {
	getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
	if (isStreaming || duration === 0) {
		return <Shimmer duration={1}>Thinking</Shimmer>;
	}
	if (duration === undefined) {
		return <span>Thought</span>;
	}
	return <span>{duration}s</span>;
};

export const ReasoningTrigger = memo(
	({
		className,
		children,
		getThinkingMessage = defaultGetThinkingMessage,
		...props
	}: ReasoningTriggerProps) => {
		const { isStreaming, isOpen, duration } = useReasoning();

		return (
			<CollapsibleTrigger
				className={cn(
					'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
					className
				)}
				{...props}
			>
				{children ?? (
					<>
						<BrainIcon className="h-3 w-3" />
						{getThinkingMessage(isStreaming, duration)}
						<ChevronDownIcon
							className={cn(
								'h-2.5 w-2.5 transition-transform',
								isOpen ? 'rotate-180' : 'rotate-0'
							)}
						/>
					</>
				)}
			</CollapsibleTrigger>
		);
	}
);

export type ReasoningContentProps = ComponentProps<
	typeof CollapsibleContent
> & {
	children: string;
};

export const ReasoningContent = memo(
	({ className, children, ...props }: ReasoningContentProps) => (
		<CollapsibleContent
			className={cn(
				'mt-1.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]',
				className
			)}
			{...props}
		>
			<div className="max-h-48 overflow-y-auto rounded-md border border-[var(--border)]/50 bg-[var(--muted)]/30 p-2.5 text-[11px]">
				<Streamdown>{children}</Streamdown>
			</div>
		</CollapsibleContent>
	)
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
