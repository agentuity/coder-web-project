import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Code2, MessageSquare, Clock, Camera, GitBranch, Loader2, ChevronDown } from 'lucide-react';
import { useTrackOnMount, useAPI } from '@agentuity/react';
import {
	PromptInput,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
} from '../ai-elements/prompt-input';
import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';
import { useAppContext } from '../../context/AppContext';
import { cn } from '../../lib/utils';
import { Input } from '../ui/input';

interface Session {
	id: string;
	title: string | null;
	status: string;
	createdAt: string;
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

export function WorkspacePage() {
	const { sessions, handleNewSession, githubAvailable, workspaceId } = useAppContext();
	const navigate = useNavigate();
	useTrackOnMount({ eventName: 'page_viewed', properties: { page: 'workspace_home' } });
	const recentSessions = sessions.slice(0, 5);
	const [prompt, setPrompt] = useState('');
	const [selectedCommand, setSelectedCommand] = useState('');
	const [selectedModel, setSelectedModel] = useState('anthropic/claude-sonnet-4-5');

	// Repo & snapshot selection state
	const [repoSearch, setRepoSearch] = useState('');
	const [selectedRepo, setSelectedRepo] = useState<{ fullName: string; name: string; owner: string; cloneUrl: string; defaultBranch: string; private: boolean } | null>(null);
	const [selectedBranch, setSelectedBranch] = useState('');
	const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
	const repoDropdownRef = useRef<HTMLDivElement | null>(null);

	const [snapshots, setSnapshots] = useState<Array<{ id: string; name: string; description: string | null; createdAt: string }>>([]);
	const [snapshotsLoading, setSnapshotsLoading] = useState(false);
	const [selectedSnapshot, setSelectedSnapshot] = useState<{ id: string; name: string } | null>(null);
	const [showOptions, setShowOptions] = useState(false);

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

	// Fetch repos
	const {
		data: repoResponse,
		isLoading: reposLoading,
	} = useAPI({
		method: 'GET',
		path: '/api/github/repos',
		enabled: githubAvailable && showOptions,
	}) as {
		data: { repos?: Array<{ fullName: string; name: string; owner: string; url: string; cloneUrl: string; private: boolean; defaultBranch: string; updatedAt: string }> } | undefined;
		isLoading: boolean;
		error: Error | null;
	};

	const repos = useMemo(() => repoResponse?.repos ?? [], [repoResponse]);

	// Fetch branches for selected repo
	const {
		data: branchResponse,
		isLoading: branchesLoading,
	} = useAPI({
		method: 'GET',
		path: selectedRepo ? `/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches` : '/api/github/repos/_/_/branches',
		enabled: Boolean(selectedRepo) && githubAvailable,
	}) as {
		data: { branches?: Array<{ name: string }> } | undefined;
		isLoading: boolean;
		error: Error | null;
	};

	const branches = useMemo(() => branchResponse?.branches ?? [], [branchResponse]);

	// Fetch snapshots when options are shown
	useEffect(() => {
		if (!showOptions || !workspaceId) return;
		setSnapshotsLoading(true);
		fetch(`/api/workspaces/${workspaceId}/snapshots`)
			.then((r) => r.json())
			.then((data) => setSnapshots(Array.isArray(data) ? data : []))
			.catch(() => setSnapshots([]))
			.finally(() => setSnapshotsLoading(false));
	}, [showOptions, workspaceId]);

	// Close repo dropdown on outside click
	useEffect(() => {
		const handleOutsideClick = (event: MouseEvent) => {
			if (!repoDropdownOpen) return;
			const target = event.target as Node;
			if (repoDropdownRef.current && !repoDropdownRef.current.contains(target)) {
				setRepoDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [repoDropdownOpen]);

	// Filter repos by search
	const filteredRepos = useMemo(() => {
		const term = repoSearch.trim().toLowerCase();
		if (!term) return repos;
		return repos.filter((repo) => repo.fullName.toLowerCase().includes(term));
	}, [repoSearch, repos]);

	const handleSubmit = (text: string) => {
		const trimmed = text.trim();
		if (!trimmed && !selectedRepo && !selectedSnapshot) return;
		void handleNewSession({
			prompt: trimmed || undefined,
			repoUrl: selectedRepo?.cloneUrl || undefined,
			branch: selectedRepo ? (selectedBranch || selectedRepo.defaultBranch || undefined) : undefined,
			snapshotId: selectedSnapshot?.id || undefined,
			agent: selectedCommand || undefined,
			model: selectedModel || undefined,
		});
		setPrompt('');
		setSelectedRepo(null);
		setSelectedBranch('');
		setRepoSearch('');
		setSelectedSnapshot(null);
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
								<CommandPicker value={selectedCommand} onChange={setSelectedCommand} hideCommands />
								<ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={selectedCommand === '/agentuity-coder' || selectedCommand === '/agentuity-cadence'} />
							</div>
							<PromptInputSubmit
								disabled={!prompt.trim() && !selectedRepo && !selectedSnapshot}
								status="ready"
							/>
						</PromptInputFooter>
					</PromptInput>
			</PromptInputProvider>

			{/* Session Options — repo & snapshot */}
			<div className="space-y-3">
				<button
					type="button"
					onClick={() => setShowOptions((prev) => !prev)}
					className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
				>
					<ChevronDown className={cn('h-3 w-3 transition-transform', showOptions && 'rotate-180')} />
					Session options
					{(selectedRepo || selectedSnapshot) && (
						<span className="rounded-full bg-[var(--primary)] h-1.5 w-1.5" />
					)}
				</button>

				{showOptions && (
					<div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
						{/* GitHub Repo Selector */}
						{githubAvailable && (
							<div className="space-y-2" ref={repoDropdownRef}>
								<div className="flex items-center gap-2">
									<GitBranch className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
									<span className="text-xs font-medium text-[var(--foreground)]">Repository</span>
									{selectedRepo && (
										<button
											type="button"
											onClick={() => { setSelectedRepo(null); setSelectedBranch(''); setRepoSearch(''); }}
											className="ml-auto text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
										>
											Clear
										</button>
									)}
								</div>
								<Input
									value={selectedRepo ? selectedRepo.fullName : repoSearch}
									onChange={(e) => {
										setRepoSearch(e.target.value);
										if (selectedRepo) {
											setSelectedRepo(null);
											setSelectedBranch('');
										}
										setRepoDropdownOpen(true);
									}}
									onFocus={() => !selectedRepo && setRepoDropdownOpen(true)}
									placeholder="Search repositories..."
									className="h-8 text-xs"
								/>
								{repoDropdownOpen && !selectedRepo && (
									<div className="relative">
										<div className="absolute z-50 w-full max-h-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
											{reposLoading ? (
												<div className="px-3 py-2 text-xs text-[var(--muted-foreground)] flex items-center gap-2">
													<Loader2 className="h-3 w-3 animate-spin" /> Loading...
												</div>
											) : filteredRepos.length === 0 ? (
												<div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">No repositories found.</div>
											) : (
												filteredRepos.map((repo) => (
													<button
														key={repo.fullName}
														type="button"
														className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--foreground)] hover:bg-[var(--accent)]"
														onClick={() => {
															setSelectedRepo(repo);
															setSelectedBranch(repo.defaultBranch ?? '');
															setRepoSearch('');
															setRepoDropdownOpen(false);
														}}
													>
														<span className="font-mono">{repo.fullName}</span>
														{repo.private && <span className="text-[10px] text-[var(--muted-foreground)]">Private</span>}
													</button>
												))
											)}
										</div>
									</div>
								)}
								{selectedRepo && (
									<select
										value={selectedBranch}
										onChange={(e) => setSelectedBranch(e.target.value)}
										className="w-full h-8 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 text-xs text-[var(--foreground)]"
									>
										{branchesLoading ? (
											<option>Loading branches...</option>
										) : branches.length === 0 ? (
											<option>{selectedRepo.defaultBranch || 'main'}</option>
										) : (
											branches.map((b) => (
												<option key={b.name} value={b.name}>{b.name}</option>
											))
										)}
									</select>
								)}
							</div>
						)}

						{!githubAvailable && (
							<div className="text-xs text-[var(--muted-foreground)]">
								Connect GitHub in <button type="button" onClick={() => navigate({ to: '/profile' })} className="text-[var(--primary)] hover:underline">Profile settings</button> to enable repository selection.
							</div>
						)}

						{/* Snapshot Selector */}
						{workspaceId && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Camera className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
									<span className="text-xs font-medium text-[var(--foreground)]">From Snapshot</span>
									{selectedSnapshot && (
										<button
											type="button"
											onClick={() => setSelectedSnapshot(null)}
											className="ml-auto text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
										>
											Clear
										</button>
									)}
								</div>
								{snapshotsLoading ? (
									<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] py-2">
										<Loader2 className="h-3 w-3 animate-spin" /> Loading snapshots...
									</div>
								) : snapshots.length === 0 ? (
									<div className="text-[10px] text-[var(--muted-foreground)]">
										No snapshots yet. Save a snapshot from an active session.
									</div>
								) : (
									<div className="space-y-1 max-h-32 overflow-y-auto">
										{snapshots.map((snap) => (
											<button
												key={snap.id}
												type="button"
												onClick={() => setSelectedSnapshot(selectedSnapshot?.id === snap.id ? null : snap)}
												className={cn(
													'flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors',
													selectedSnapshot?.id === snap.id
														? 'border-[var(--primary)] bg-[var(--accent)]'
														: 'border-[var(--border)] hover:bg-[var(--accent)]',
												)}
											>
												<div className="min-w-0 flex-1">
													<div className="font-medium text-[var(--foreground)]">{snap.name}</div>
													{snap.description && (
														<div className="text-[var(--muted-foreground)] mt-0.5 truncate">{snap.description}</div>
													)}
												</div>
											</button>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				)}

				{/* Selected indicators when collapsed */}
				{!showOptions && (selectedRepo || selectedSnapshot) && (
					<div className="flex flex-wrap gap-2">
						{selectedRepo && (
							<span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[10px] text-[var(--foreground)]">
								<GitBranch className="h-2.5 w-2.5" />
								{selectedRepo.fullName}
								{selectedBranch && selectedBranch !== selectedRepo.defaultBranch && ` \u2192 ${selectedBranch}`}
							</span>
						)}
						{selectedSnapshot && (
							<span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[10px] text-[var(--foreground)]">
								<Camera className="h-2.5 w-2.5" />
								{selectedSnapshot.name}
							</span>
						)}
					</div>
				)}
			</div>

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
									onClick={() => navigate({ to: '/session/$sessionId', params: { sessionId: session.id } })}
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
