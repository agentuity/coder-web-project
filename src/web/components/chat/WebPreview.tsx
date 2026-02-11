import { useCallback, useRef, useState } from 'react';
import {
	ExternalLink,
	Maximize2,
	Minimize2,
	Monitor,
	RefreshCw,
	Smartphone,
	Tablet,
	X,
	AlertTriangle,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface WebPreviewProps {
	url: string;
	title?: string;
	onClose?: () => void;
	onRefresh?: () => void;
	className?: string;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_WIDTHS: Record<ViewportMode, string> = {
	desktop: '100%',
	tablet: '768px',
	mobile: '375px',
};

const VIEWPORT_LABELS: Record<ViewportMode, string> = {
	desktop: 'Desktop',
	tablet: 'Tablet',
	mobile: 'Mobile',
};

const VIEWPORT_ICONS: Record<ViewportMode, typeof Monitor> = {
	desktop: Monitor,
	tablet: Tablet,
	mobile: Smartphone,
};

export function WebPreview({
	url,
	title,
	onClose,
	onRefresh,
	className,
}: WebPreviewProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [iframeSrc, setIframeSrc] = useState(url);

	const handleRefresh = useCallback(() => {
		setIsLoading(true);
		setHasError(false);
		// Force iframe reload by clearing and re-setting src
		setIframeSrc('');
		requestAnimationFrame(() => {
			setIframeSrc(url);
		});
		onRefresh?.();
	}, [url, onRefresh]);

	const handleOpenExternal = useCallback(() => {
		window.open(url, '_blank', 'noopener,noreferrer');
	}, [url]);

	const handleIframeLoad = useCallback(() => {
		setIsLoading(false);
		setHasError(false);
	}, []);

	const handleIframeError = useCallback(() => {
		setIsLoading(false);
		setHasError(true);
	}, []);

	const toggleFullscreen = useCallback(() => {
		setIsFullscreen((prev) => !prev);
	}, []);

	const containerClasses = isFullscreen
		? 'fixed inset-0 z-50 flex flex-col bg-[var(--background)]'
		: cn(
				'flex flex-col rounded-lg border border-[var(--border)] overflow-hidden',
				className,
			);

	return (
		<div className={containerClasses}>
			{/* Chrome / Navigation Bar */}
			<div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--muted)] px-2 py-1.5">
				{/* URL Display */}
				<div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1">
					<div className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
					<span
						className="truncate font-mono text-[11px] text-[var(--muted-foreground)]"
						title={url}
					>
						{url}
					</span>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-0.5">
					{/* Refresh */}
					<ToolbarButton
						onClick={handleRefresh}
						title="Refresh"
						aria-label="Refresh preview"
					>
						<RefreshCw
							className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
						/>
					</ToolbarButton>

					{/* Open External */}
					<ToolbarButton
						onClick={handleOpenExternal}
						title="Open in new tab"
						aria-label="Open in new tab"
					>
						<ExternalLink className="h-3.5 w-3.5" />
					</ToolbarButton>

					{/* Separator */}
					<div className="mx-0.5 h-4 w-px bg-[var(--border)]" />

					{/* Viewport Mode Toggles */}
					{(Object.keys(VIEWPORT_WIDTHS) as ViewportMode[]).map((mode) => {
						const Icon = VIEWPORT_ICONS[mode];
						return (
							<ToolbarButton
								key={mode}
								onClick={() => setViewportMode(mode)}
								title={VIEWPORT_LABELS[mode]}
								aria-label={`${VIEWPORT_LABELS[mode]} view`}
								active={viewportMode === mode}
							>
								<Icon className="h-3.5 w-3.5" />
							</ToolbarButton>
						);
					})}

					{/* Separator */}
					<div className="mx-0.5 h-4 w-px bg-[var(--border)]" />

					{/* Fullscreen */}
					<ToolbarButton
						onClick={toggleFullscreen}
						title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
						aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					>
						{isFullscreen ? (
							<Minimize2 className="h-3.5 w-3.5" />
						) : (
							<Maximize2 className="h-3.5 w-3.5" />
						)}
					</ToolbarButton>

					{/* Close */}
					{onClose && (
						<ToolbarButton
							onClick={onClose}
							title="Close preview"
							aria-label="Close preview"
						>
							<X className="h-3.5 w-3.5" />
						</ToolbarButton>
					)}
				</div>
			</div>

			{/* Title bar (optional) */}
			{title && (
				<div className="border-b border-[var(--border)] bg-[var(--muted)] px-3 py-1">
					<span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
						{title}
					</span>
				</div>
			)}

			{/* Iframe Body */}
			<div
				className={cn(
					'relative flex-1 bg-[var(--background)]',
					isFullscreen ? '' : 'min-h-[400px]',
				)}
			>
				{/* Responsive container — centers the iframe when not desktop */}
				<div
					className="mx-auto h-full transition-[width] duration-200 ease-in-out"
					style={{ width: VIEWPORT_WIDTHS[viewportMode] }}
				>
					{/* Loading shimmer overlay */}
					{isLoading && (
						<div className="absolute inset-0 z-10 flex items-center justify-center">
							<div className="absolute inset-0 animate-pulse bg-[var(--muted)]" />
							<div className="relative flex flex-col items-center gap-2">
								<RefreshCw className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
								<span className="text-xs text-[var(--muted-foreground)]">
									Loading preview…
								</span>
							</div>
						</div>
					)}

					{/* Error state */}
					{hasError && !isLoading && (
						<div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--background)]">
							<div className="flex flex-col items-center gap-3 text-center">
								<AlertTriangle className="h-8 w-8 text-[var(--muted-foreground)]" />
								<div>
									<p className="text-sm font-medium text-[var(--foreground)]">
										Failed to load preview
									</p>
									<p className="mt-1 text-xs text-[var(--muted-foreground)]">
										The sandbox may still be starting up, or the URL might be
										unreachable.
									</p>
								</div>
								<button
									type="button"
									onClick={handleRefresh}
									className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
								>
									<RefreshCw className="h-3 w-3" />
									Try again
								</button>
							</div>
						</div>
					)}

					{/* The iframe */}
					{iframeSrc && (
						<iframe
							ref={iframeRef}
							src={iframeSrc}
							title={title || 'Web Preview'}
							className={cn(
								'h-full w-full border-0',
								viewportMode !== 'desktop' &&
									'border-x border-[var(--border)]',
							)}
							sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
							onLoad={handleIframeLoad}
							onError={handleIframeError}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

/* --------------------------------------------------------------------- */
/* Toolbar icon button                                                    */
/* --------------------------------------------------------------------- */

interface ToolbarButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	active?: boolean;
	children: React.ReactNode;
}

function ToolbarButton({
	active,
	children,
	className,
	...props
}: ToolbarButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				'inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
				active &&
					'bg-[var(--accent)] text-[var(--foreground)]',
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
