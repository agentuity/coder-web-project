import React from 'react';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, memo, useContext, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Shimmer } from './shimmer';

const reasoningCodePlugin = createCodePlugin({
	themes: ['github-dark', 'github-light'],
});

const reasoningComponents = {
	h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
		<h1 className="text-xs font-bold mt-2 mb-1 text-[var(--muted-foreground)]" {...props}>{children}</h1>
	),
	h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
		<h2 className="text-xs font-bold mt-1.5 mb-0.5 text-[var(--muted-foreground)]" {...props}>{children}</h2>
	),
	h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
		<h3 className="text-[11px] font-semibold mt-1 mb-0.5 text-[var(--muted-foreground)]" {...props}>{children}</h3>
	),
	p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
		<p className="text-[11px] leading-relaxed text-[var(--muted-foreground)] my-1" {...props}>{children}</p>
	),
	code: ({ children, className, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
		if (className && className.includes('language-')) {
			return <code className={className} {...props}>{children}</code>;
		}
		return (
			<code className="rounded bg-[var(--muted)] px-1 py-0.5 text-[10px] font-mono text-[var(--muted-foreground)]" {...props}>
				{children}
			</code>
		);
	},
	pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
		<pre className="overflow-x-auto rounded-md bg-[var(--muted)] p-2 text-[10px] leading-relaxed font-mono my-1" {...props}>
			{children}
		</pre>
	),
	ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
		<ul className="text-[11px] list-disc ml-4 my-1 space-y-0.5 text-[var(--muted-foreground)]" {...props}>{children}</ul>
	),
	ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
		<ol className="text-[11px] list-decimal ml-4 my-1 space-y-0.5 text-[var(--muted-foreground)]" {...props}>{children}</ol>
	),
	li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
		<li className="text-[11px] text-[var(--muted-foreground)]" {...props}>{children}</li>
	),
	strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
		<strong className="font-semibold text-[var(--muted-foreground)]" {...props}>{children}</strong>
	),
	blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<'blockquote'>) => (
		<blockquote className="border-l-2 border-[var(--border)] pl-2 my-1 text-[11px] text-[var(--muted-foreground)] italic" {...props}>
			{children}
		</blockquote>
	),
};

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
					className={cn('not-prose mb-2 min-w-0 overflow-hidden', className)}
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
	return <span>Thought</span>;
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
						{duration !== undefined && !isStreaming && (
							<Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">
								{duration}s
							</Badge>
						)}
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
	({ className, children, ...props }: ReasoningContentProps) => {
		const { isStreaming } = useReasoning();
		const trimmed = children?.trim();
		return (
			<CollapsibleContent
				className={cn(
					'mt-1.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]',
					className
				)}
				{...props}
			>
				<div className="max-h-48 overflow-y-auto overflow-x-hidden rounded-md border border-[var(--border)]/50 bg-[var(--muted)]/30 p-2.5 text-[11px] min-w-0 break-words whitespace-pre-wrap [word-break:break-word] [&_*]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:overflow-hidden [&_code]:break-all [&_.streamdown]:overflow-hidden [&_.streamdown]:break-words">
					{isStreaming && !trimmed ? (
						<div className="space-y-2">
							<Shimmer className="block h-2 w-2/3 rounded bg-[var(--muted)]">&nbsp;</Shimmer>
							<Shimmer className="block h-2 w-5/6 rounded bg-[var(--muted)]">&nbsp;</Shimmer>
							<Shimmer className="block h-2 w-1/2 rounded bg-[var(--muted)]">&nbsp;</Shimmer>
						</div>
					) : (
						<Streamdown
						isAnimating={isStreaming}
						caret={isStreaming ? 'block' : undefined}
						mode={isStreaming ? 'streaming' : undefined}
						components={reasoningComponents}
						plugins={{ code: reasoningCodePlugin }}
					>{children}</Streamdown>
					)}
				</div>
			</CollapsibleContent>
		);
	}
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
