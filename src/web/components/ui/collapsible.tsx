import * as React from 'react';
import { cn } from '../../lib/utils';

type CollapsibleContextValue = {
	isOpen: boolean;
	setOpen: (open: boolean) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(
	null
);

const useCollapsible = () => {
	const context = React.useContext(CollapsibleContext);
	if (!context) {
		throw new Error('Collapsible components must be used within Collapsible');
	}
	return context;
};

export type CollapsibleProps = React.HTMLAttributes<HTMLDivElement> & {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export const Collapsible = ({
	className,
	open,
	defaultOpen = false,
	onOpenChange,
	children,
	...props
}: CollapsibleProps) => {
	const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
	const isOpen = open ?? internalOpen;

	const setOpen = React.useCallback(
		(next: boolean) => {
			if (open === undefined) {
				setInternalOpen(next);
			}
			onOpenChange?.(next);
		},
		[open, onOpenChange]
	);

	return (
		<CollapsibleContext.Provider value={{ isOpen, setOpen }}>
			<div
				className={cn('group', className)}
				data-state={isOpen ? 'open' : 'closed'}
				{...props}
			>
				{children}
			</div>
		</CollapsibleContext.Provider>
	);
};

export type CollapsibleTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const CollapsibleTrigger = React.forwardRef<
	HTMLButtonElement,
	CollapsibleTriggerProps
>(({ className, onClick, ...props }, ref) => {
	const { isOpen, setOpen } = useCollapsible();

	return (
		<button
			className={cn('group flex items-center', className)}
			data-state={isOpen ? 'open' : 'closed'}
			onClick={(event) => {
				onClick?.(event);
				setOpen(!isOpen);
			}}
			ref={ref}
			type="button"
			{...props}
		/>
	);
});
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

export type CollapsibleContentProps = React.HTMLAttributes<HTMLDivElement>;

export const CollapsibleContent = React.forwardRef<
	HTMLDivElement,
	CollapsibleContentProps
>(({ className, ...props }, ref) => {
	const { isOpen } = useCollapsible();

	return (
		<div
			className={cn(className)}
			data-state={isOpen ? 'open' : 'closed'}
			hidden={!isOpen}
			ref={ref}
			{...props}
		/>
	);
});
CollapsibleContent.displayName = 'CollapsibleContent';
