import { useState, useEffect } from 'react';
import { Code2, MessageSquare, Clock } from 'lucide-react';
import { useTrackOnMount } from '@agentuity/react';
import {
	PromptInput,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
} from '../ai-elements/prompt-input';
import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';

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
	onQuickSession?: (prompt: string, options?: { command?: string; model?: string }) => void;
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
	const [selectedCommand, setSelectedCommand] = useState('');
	const [selectedModel, setSelectedModel] = useState('anthropic/claude-sonnet-4-5');

	// Load user's default agent preference
	useEffect(() => {
		fetch('/api/user/settings')
			.then((r) => r.json())
			.then((data: { defaultCommand?: string }) => {
				if (data.defaultCommand) {
					setSelectedCommand(data.defaultCommand);
				}
			})
			.catch(() => {});
	}, []);

	const handleSubmit = (text: string) => {
		const trimmed = text.trim();
		if (!trimmed) return;
		onQuickSession?.(trimmed, {
			command: selectedCommand || undefined,
			model: selectedModel || undefined,
		});
		setPrompt('');
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
				<PromptInputProvider>
					<PromptInput onSubmit={({ text }) => handleSubmit(text)}>
						<PromptInputTextarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="Describe what you want to build, fix, or explore..."
						/>
						<PromptInputFooter>
							<div className="flex items-center gap-2">
								<CommandPicker value={selectedCommand} onChange={setSelectedCommand} />
								<ModelSelector value={selectedModel} onChange={setSelectedModel} />
							</div>
							<PromptInputSubmit
								disabled={!prompt.trim()}
								status="ready"
							/>
						</PromptInputFooter>
					</PromptInput>
				</PromptInputProvider>

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

	
			</div>
		</div>
	);
}
