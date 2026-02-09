import { useEffect, useRef, useState } from 'react';

interface IDELayoutProps {
	sidebar: React.ReactNode;
	codePanel: React.ReactNode;
	chatPanel?: React.ReactNode;
}

export function IDELayout({ sidebar, codePanel, chatPanel }: IDELayoutProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [codeWidth, setCodeWidth] = useState(520);
	const [isDragging, setIsDragging] = useState(false);

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
		<div ref={containerRef} className="flex h-full min-w-0 bg-[var(--background)] overflow-hidden">
			<div className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--card)] overflow-hidden flex flex-col">
				{sidebar}
			</div>
			<div className="flex min-w-0 flex-1 overflow-hidden">
				{chatPanel ? (
					<>
						<div style={{ width: codeWidth }} className="min-w-[320px] border-r border-[var(--border)] overflow-hidden flex flex-col">
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
		</div>
	);
}
