import { Code2, MessageSquare, Plus, Sparkles, Plug, Clock } from 'lucide-react';
import { Button } from '../ui/button';

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

export function WorkspacePage({ sessions = [], onNewSession, onSelectSession, onNavigate }: WorkspacePageProps) {
	const activeSessions = sessions.filter(s => s.status === 'active');
	const recentSessions = sessions.slice(0, 5);

	return (
		<div className="flex h-full items-start justify-center overflow-auto p-8">
			<div className="w-full max-w-2xl space-y-8">
				{/* Welcome */}
				<div className="text-center pt-8">
					<Code2 className="mx-auto h-10 w-10 text-[var(--primary)] mb-3" />
					<h2 className="text-2xl font-bold text-[var(--foreground)]">Welcome to Agentuity Coder</h2>
					<p className="mt-2 text-sm text-[var(--muted-foreground)]">
						Your AI-powered coding workspace. Start a session to begin building.
					</p>
				</div>

				{/* Stats */}
				<div className="grid grid-cols-2 gap-4">
					<div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
						<p className="text-2xl font-bold text-[var(--foreground)]">{sessions.length}</p>
						<p className="text-xs text-[var(--muted-foreground)]">Total Sessions</p>
					</div>
					<div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
						<p className="text-2xl font-bold text-green-500">{activeSessions.length}</p>
						<p className="text-xs text-[var(--muted-foreground)]">Active Sessions</p>
					</div>
				</div>

				{/* Quick Actions */}
				<div>
					<h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Quick Actions</h3>
					<div className="grid grid-cols-3 gap-3">
						<button
							type="button"
							onClick={onNewSession}
							className="flex flex-col items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm transition-colors hover:bg-[var(--accent)] hover:border-[var(--primary)]"
						>
							<Plus className="h-5 w-5 text-[var(--primary)]" />
							<span className="text-[var(--foreground)]">New Session</span>
						</button>
						<button
							type="button"
							onClick={() => onNavigate?.('skills')}
							className="flex flex-col items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm transition-colors hover:bg-[var(--accent)] hover:border-[var(--primary)]"
						>
							<Sparkles className="h-5 w-5 text-[var(--primary)]" />
							<span className="text-[var(--foreground)]">Skills</span>
						</button>
						<button
							type="button"
							onClick={() => onNavigate?.('sources')}
							className="flex flex-col items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm transition-colors hover:bg-[var(--accent)] hover:border-[var(--primary)]"
						>
							<Plug className="h-5 w-5 text-[var(--primary)]" />
							<span className="text-[var(--foreground)]">Sources</span>
						</button>
					</div>
				</div>

				{/* Recent Sessions */}
				{recentSessions.length > 0 && (
					<div>
						<h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Recent Sessions</h3>
						<div className="rounded-lg border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
							{recentSessions.map((session) => (
								<button
									type="button"
									key={session.id}
									onClick={() => onSelectSession?.(session.id)}
									className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--accent)]"
								>
									<MessageSquare className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-[var(--foreground)] truncate">
											{session.title || 'Untitled Session'}
										</p>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<div className={`h-2 w-2 rounded-full ${getStatusColor(session.status)}`} />
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

				{/* Empty state */}
				{sessions.length === 0 && (
					<div className="text-center py-8">
						<MessageSquare className="mx-auto h-8 w-8 text-[var(--muted-foreground)] mb-3" />
						<p className="text-sm text-[var(--muted-foreground)]">
							No sessions yet. Create one to get started.
						</p>
						{onNewSession && (
							<Button onClick={onNewSession} className="mt-4" size="sm">
								<Plus className="mr-2 h-4 w-4" />
								Create First Session
							</Button>
						)}
					</div>
				)}

				{/* Keyboard shortcut hint */}
				<p className="text-center text-xs text-[var(--muted-foreground)]">
					Tip: Press{' '}
					<kbd className="rounded border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">
						⌘N
					</kbd>{' '}
					to quickly create a new session
				</p>
			</div>
		</div>
	);
}
