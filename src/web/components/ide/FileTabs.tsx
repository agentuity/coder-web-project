import { FileDiff, FileText, PencilLine, X } from 'lucide-react';
import type { FileTab } from '../../hooks/useFileTabs';
import { cn } from '../../lib/utils';

interface FileTabsProps {
	tabs: FileTab[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
}

function getTabIcon(kind: FileTab['kind']) {
	switch (kind) {
		case 'diff':
			return <FileDiff className="h-3.5 w-3.5" />;
		case 'write':
			return <PencilLine className="h-3.5 w-3.5" />;
		default:
			return <FileText className="h-3.5 w-3.5" />;
	}
}

export function FileTabs({ tabs, activeId, onSelect, onClose }: FileTabsProps) {
	return (
		<div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--muted)] px-2 py-1 overflow-x-auto">
			{tabs.map((tab) => {
				const isActive = tab.id === activeId;
				return (
					<button
						key={tab.id}
						onClick={() => onSelect(tab.id)}
						className={cn(
							'group flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium transition-colors',
							isActive
								? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
								: 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
						)}
						type="button"
					>
						{getTabIcon(tab.kind)}
						<span className="truncate max-w-[140px]" title={tab.filePath}>
							{tab.title}
						</span>
						<button
							onClick={(event) => {
							event.stopPropagation();
							onClose(tab.id);
						}}
						className="ml-1 rounded p-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
						type="button"
					>
						<X className="h-3 w-3" />
					</button>
					</button>
				);
			})}
			{tabs.length === 0 && (
				<div className="text-[10px] text-[var(--muted-foreground)] px-2">No open files</div>
			)}
		</div>
	);
}
