import { useState, useRef, useEffect } from 'react';
import { Code2, MessageSquare, ArrowUp, Clock } from 'lucide-react';
import { useTrackOnMount } from '@agentuity/react';

interface Session {
	id: string;
	title: string | null;
	status: string;
	createdAt: string;
}

interface WorkspacePageProps {
	workspaceId?: string;
	sessions?: Session[];
	onNewSession?: () => void;
	onQuickSession?: (prompt: string) => void;
	onSelectSession?: (id: string) => void;
	onNavigate?: (page: 'skills' | 'sources' | 'settings' | 'profile') => void;
}

function getStatusColor(status: string) {
	switch (status) {
		case 'active': return 'bg-green-500';
		case 'creating': return 'bg-yellow-500';
		case 'error': return 'bg-red-500';
		default: return 'bg-gray-400';
	}
}

function formatRelativeTime(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'Just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function WorkspacePage({ sessions = [], onNewSession, onQuickSession, onSelectSession }: WorkspacePageProps) {
	useTrackOnMount({ eventName: 'page_viewed', properties: { page: 'workspace_home' } });
	const recentSessions = sessions.slice(0, 5);
	const [prompt, setPrompt] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-resize textarea on input
	const autoResize = () => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	};

	// Focus textarea on mount
	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = prompt.trim();
		if (!trimmed) return;
		onQuickSession?.(trimmed);
		setPrompt('');
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	};

	return (
		<div className="flex h-full items-center justify-center overflow-auto p-8">
			<div className="w-full max-w-2xl space-y-8 -mt-16">
				{/* Branding */}
				<div className="text-center">
					<Code2 className="mx-auto h-9 w-9 text-[var(--primary)] mb-4" />
					<h2 className="text-xl font-semibold text-[var(--foreground)]">
						What would you like to build?
					</h2>
				</div>

				{/* Prompt input */}
				<form onSubmit={handleSubmit} className="relative">
					<div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)] transition-all">
						<textarea
							ref={textareaRef}
							value={prompt}
							onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
							onKeyDown={handleKeyDown}
							placeholder="Describe what you want to build, fix, or explore..."
							rows={3}
							className="w-full resize-none bg-transparent px-4 pt-4 pb-12 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none"
						/>
						<div className="absolute bottom-3 right-3 flex items-center gap-2">
							<button
								type="submit"
								disabled={!prompt.trim()}
								className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] transition-opacity disabled:opacity-30 hover:opacity-90"
							>
								<ArrowUp className="h-4 w-4" />
							</button>
						</div>
					</div>
				</form>

				{/* Recent Sessions */}
				{recentSessions.length > 0 && (
					<div>
						<h3 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">
							Recent Sessions
						</h3>
						<div className="rounded-lg border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
							{recentSessions.map((session) => (
								<button
									type="button"
									key={session.id}
									onClick={() => onSelectSession?.(session.id)}
									className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--accent)]"
								>
									<MessageSquare className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
									<div className="flex-1 min-w-0">
										<p className="text-sm text-[var(--foreground)] truncate">
											{session.title || 'Untitled Session'}
										</p>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<div className={`h-1.5 w-1.5 rounded-full ${getStatusColor(session.status)}`} />
										<span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
											<Clock className="h-3 w-3" />
											{formatRelativeTime(session.createdAt)}
										</span>
									</div>
								</button>
							))}
						</div>
					</div>
				)}

				{/* Keyboard shortcut hint */}
				<p className="text-center text-xs text-[var(--muted-foreground)]">
					Press{' '}
					<kbd className="rounded border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">
						⌘N
					</kbd>{' '}
					to start a session with a repository
				</p>
			</div>
		</div>
	);
}
