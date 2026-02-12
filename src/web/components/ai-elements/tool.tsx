import {
	CheckCircleIcon,
	ChevronDownIcon,
	CircleIcon,
	ClockIcon,
	WrenchIcon,
	XCircleIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { isValidElement } from 'react';
import { Streamdown } from 'streamdown';
import { Badge } from '../ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
import { cn } from '../../lib/utils';

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
	<Collapsible
		className={cn(
			'not-prose mb-1 w-full rounded-md border border-[var(--border)] bg-[var(--card)] transition-all duration-200',
			'data-[state=closed]:border-transparent data-[state=closed]:bg-transparent data-[state=closed]:opacity-70',
			'data-[state=closed]:hover:border-[var(--border)] data-[state=closed]:hover:bg-[var(--muted)]/30',
			className
		)}
		{...props}
	/>
);

export type ToolState = 'call' | 'partial-call' | 'result';
export type ToolStatus = 'pending' | 'running' | 'completed' | 'error';

export type ToolHeaderProps = {
	title?: string;
	type: string;
	state: ToolState;
	status?: ToolStatus;
	meta?: string;
	className?: string;
};

const getStatusBadge = (status: ToolStatus | undefined, state: ToolState) => {
	const labels: Record<ToolStatus, string> = {
		pending: 'Pending',
		running: 'Running',
		completed: 'Completed',
		error: 'Error',
	};

	const icons: Record<ToolStatus, ReactNode> = {
		pending: <CircleIcon className="h-4 w-4" />,
		running: <ClockIcon className="h-4 w-4 animate-pulse" />,
		completed: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
		error: <XCircleIcon className="h-4 w-4 text-red-500" />,
	};

	if (!status) {
		return (
			<Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
				{state === 'result' ? (
					<CheckCircleIcon className="h-4 w-4 text-green-500" />
				) : state === 'partial-call' ? (
					<ClockIcon className="h-4 w-4 animate-pulse" />
				) : (
					<CircleIcon className="h-4 w-4" />
				)}
				{state === 'result'
					? 'Completed'
					: state === 'partial-call'
						? 'Running'
						: 'Pending'}
			</Badge>
		);
	}

	return (
		<Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
			{icons[status]}
			{labels[status]}
		</Badge>
	);
};

export const ToolHeader = ({
	className,
	title,
	type,
	state,
	status,
	meta,
	...props
}: ToolHeaderProps) => (
	<CollapsibleTrigger
		className={cn(
			'group flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
			'data-[state=closed]:py-1.5 data-[state=closed]:text-[var(--muted-foreground)]',
			className
		)}
		{...props}
	>
		<div className="flex items-center gap-2">
			<WrenchIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
			<span className="text-xs font-medium text-[var(--foreground)] group-data-[state=closed]:text-[var(--muted-foreground)]">
				{title ?? type.split('-').slice(1).join('-')}
			</span>
			{getStatusBadge(status, state)}
			{meta && (
				<span className="text-xs text-[var(--muted-foreground)]">{meta}</span>
			)}
		</div>
		<ChevronDownIcon className="h-4 w-4 text-[var(--muted-foreground)] transition-transform group-data-[state=open]:rotate-180" />
	</CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsibleContent
		className={cn(
			'text-[var(--popover-foreground)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
			className
		)}
		{...props}
	/>
);

export type ToolInputProps = ComponentProps<'div'> & {
	input: Record<string, unknown>;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
	<div className={cn('space-y-2 overflow-hidden p-4', className)} {...props}>
		<h4 className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
			Parameters
		</h4>
		<pre className="overflow-x-auto rounded-md bg-[var(--muted)]/50 p-3 font-mono text-xs">
			{JSON.stringify(input, null, 2)}
		</pre>
	</div>
);

export type ToolOutputProps = ComponentProps<'div'> & {
	output?: string | Record<string, unknown> | ReactNode;
	errorText?: string;
};

export const ToolOutput = ({
	className,
	output,
	errorText,
	...props
}: ToolOutputProps) => {
	if (!(output || errorText)) {
		return null;
	}

	const renderOutput = () => {
		if (typeof output === 'object' && output !== null && !isValidElement(output)) {
			return (
				<pre className="overflow-x-auto p-3 font-mono text-xs">
					{JSON.stringify(output, null, 2)}
				</pre>
			);
		}
		if (typeof output === 'string') {
			return (
				<div className="p-3 text-xs overflow-auto max-h-96">
					<Streamdown>{output}</Streamdown>
				</div>
			);
		}
		return <div className="p-3">{output as ReactNode}</div>;
	};

	return (
		<div className={cn('space-y-2 p-4', className)} {...props}>
			<h4 className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
				{errorText ? 'Error' : 'Result'}
			</h4>
			<div
				className={cn(
					'overflow-x-auto rounded-md text-xs [&_table]:w-full',
					errorText
						? 'bg-red-500/10 text-red-500'
						: 'bg-[var(--muted)]/50 text-[var(--foreground)]'
				)}
			>
				{errorText && <div className="p-3">{errorText}</div>}
				{!errorText && renderOutput()}
			</div>
		</div>
	);
};
