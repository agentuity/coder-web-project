import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Code2, FolderOpen, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';

interface IDELayoutProps {
	sidebar: ReactNode;
	codePanel: ReactNode;
	chatPanel?: ReactNode;
}

export function IDELayout({ sidebar, codePanel, chatPanel }: IDELayoutProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [codeWidth, setCodeWidth] = useState(520);
	const [isDragging, setIsDragging] = useState(false);
	const [ideSidebarOpen, setIdeSidebarOpen] = useState(false);
	const [mobilePanel, setMobilePanel] = useState<'code' | 'chat'>('code');

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (event: MouseEvent) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const min = 320;
			const max = Math.max(420, rect.width - 360);
			const next = Math.min(Math.max(event.clientX - rect.left - 240, min), max);
			setCodeWidth(next);
		};

		const handleMouseUp = () => setIsDragging(false);

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isDragging]);

	return (
		<div ref={containerRef} className="relative flex h-full min-w-0 bg-[var(--background)] overflow-hidden">
			{ideSidebarOpen && (
				<button
					type="button"
					className="fixed inset-0 z-40 bg-black/40 md:hidden"
					onClick={() => setIdeSidebarOpen(false)}
					aria-label="Close file sidebar"
				/>
			)}
			<div
				className={cn(
					'shrink-0 border-r border-[var(--border)] bg-[var(--card)] overflow-hidden flex flex-col',
					'hidden md:flex md:w-60',
					ideSidebarOpen && 'absolute inset-y-0 left-0 z-50 flex w-64 md:static md:z-auto md:w-60',
				)}
			>
				{sidebar}
			</div>
			<div className="flex md:hidden items-center border-b border-[var(--border)] shrink-0">
				<button
					type="button"
					onClick={() => setIdeSidebarOpen((prev) => !prev)}
					className="p-2 text-[var(--muted-foreground)]"
					aria-label={ideSidebarOpen ? 'Close file sidebar' : 'Open file sidebar'}
					title={ideSidebarOpen ? 'Close file sidebar' : 'Open file sidebar'}
				>
					<FolderOpen className="h-4 w-4" />
				</button>
				{chatPanel && (
					<div className="flex items-center rounded-md bg-[var(--muted)] p-0.5 mx-2">
						<button
							type="button"
							onClick={() => setMobilePanel('code')}
							className={cn(
								'px-2 py-1 text-xs rounded',
								mobilePanel === 'code' && 'bg-[var(--background)] shadow-sm',
							)}
							title="Code"
						>
							<Code2 className="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							onClick={() => setMobilePanel('chat')}
							className={cn(
								'px-2 py-1 text-xs rounded',
								mobilePanel === 'chat' && 'bg-[var(--background)] shadow-sm',
							)}
							title="Chat"
						>
							<MessageSquare className="h-3.5 w-3.5" />
						</button>
					</div>
				)}
			</div>
			<div className="hidden md:flex min-w-0 flex-1 overflow-hidden">
				{chatPanel ? (
					<>
						<div
							style={{ width: codeWidth }}
							className="min-w-[320px] border-r border-[var(--border)] overflow-hidden flex flex-col"
						>
							{codePanel}
						</div>
						<button
							type="button"
							className="w-1 cursor-col-resize bg-[var(--border)] hover:bg-[var(--primary)]"
							onMouseDown={() => setIsDragging(true)}
							aria-label="Resize panels"
						/>
						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
							{chatPanel}
						</div>
					</>
				) : (
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
						{codePanel}
					</div>
				)}
			</div>
			<div className="flex md:hidden min-w-0 flex-1 flex-col overflow-hidden">
				{chatPanel ? (
					mobilePanel === 'code' ? (
						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">{codePanel}</div>
					) : (
						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">{chatPanel}</div>
					)
				) : (
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden">{codePanel}</div>
				)}
			</div>
		</div>
	);
}
