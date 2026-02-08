import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export type ShimmerProps = ComponentProps<'span'> & {
	duration?: number;
};

export const Shimmer = ({ className, children, ...props }: ShimmerProps) => (
	<span
		className={cn('animate-pulse text-[var(--foreground)]', className)}
		{...props}
	>
		{children}
	</span>
);
