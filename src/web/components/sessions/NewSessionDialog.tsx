import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAnalytics, useAPI } from '@agentuity/react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';
import { Camera, Loader2, Trash2, X } from 'lucide-react';

interface Repo {
	fullName: string;
	name: string;
	owner: string;
	url: string;
	cloneUrl: string;
	private: boolean;
	defaultBranch: string;
	updatedAt: string;
}

interface Branch {
	name: string;
}

interface Snapshot {
	id: string;
	name: string;
	description: string | null;
	snapshotId: string;
	sourceSessionId: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

interface NewSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { repoUrl?: string; branch?: string; prompt?: string; snapshotId?: string }) => Promise<void>;
  isCreating: boolean;
  githubAvailable?: boolean;
  workspaceId?: string;
}

export function NewSessionDialog({ isOpen, onClose, onCreate, isCreating, githubAvailable = true, workspaceId }: NewSessionDialogProps) {
	const { track } = useAnalytics();
	const [mode, setMode] = useState<'dropdown' | 'url' | 'snapshot'>('dropdown');
	const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
	const [snapshotsLoading, setSnapshotsLoading] = useState(false);
	const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
	const [repoUrl, setRepoUrl] = useState('');
	const [branch, setBranch] = useState('');
	const [prompt, setPrompt] = useState('');
	const [repoSearch, setRepoSearch] = useState('');
	const [repos, setRepos] = useState<Repo[]>([]);
	const [branches, setBranches] = useState<Branch[]>([]);
	const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
	const [selectedBranch, setSelectedBranch] = useState('');
	const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
	const [repoError, setRepoError] = useState<string | null>(null);
	const repoDropdownRef = useRef<HTMLDivElement | null>(null);
	const wasOpenRef = useRef(false);
	const repoId = useId();
	const branchId = useId();
	const promptId = useId();
	const branchesPath = selectedRepo
		? `/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches`
		: '/api/github/repos/_/_/branches';

	const {
		data: repoResponse,
		isLoading: reposLoading,
		error: reposRequestError,
	} = useAPI({
		method: 'GET',
		path: '/api/github/repos',
		enabled: isOpen && mode === 'dropdown' && githubAvailable,
	}) as {
		data: { repos?: Repo[]; error?: string } | undefined;
		isLoading: boolean;
		error: Error | null;
	};

	const {
		data: branchResponse,
		isLoading: branchesLoading,
		error: branchesRequestError,
	} = useAPI({
		method: 'GET',
		path: branchesPath,
		enabled: Boolean(selectedRepo) && mode === 'dropdown' && githubAvailable,
	}) as {
		data: { branches?: Branch[]; error?: string } | undefined;
		isLoading: boolean;
		error: Error | null;
	};

	useEffect(() => {
		if (!isOpen) return;
		if (mode !== 'dropdown') return;
		if (reposRequestError) {
			setRepoError('Unable to load repositories. Use URL instead.');
			setRepos([]);
			setMode('url');
			return;
		}
		if (repoResponse?.error) {
			setRepoError(repoResponse.error);
			setRepos([]);
			setMode('url');
			return;
		}
		setRepoError(null);
		setRepos(repoResponse?.repos ?? []);
	}, [repoResponse, reposRequestError, isOpen, mode]);

	useEffect(() => {
		if (!selectedRepo || mode !== 'dropdown') {
			setBranches([]);
			return;
		}
		if (branchesRequestError) {
			setBranches([]);
			return;
		}
		if (branchResponse?.error) {
			setBranches([]);
			return;
		}
		setBranches(branchResponse?.branches ?? []);
		if (!selectedBranch && branchResponse?.branches?.length) {
			setSelectedBranch(branchResponse.branches[0]!.name);
		}
	}, [branchResponse, branchesRequestError, selectedRepo, mode, selectedBranch]);

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

	useEffect(() => {
		if (!isOpen) {
			setRepoDropdownOpen(false);
		}
	}, [isOpen]);

	useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			track('session_dialog_opened');
		}
		wasOpenRef.current = isOpen;
	}, [isOpen, track]);

	// Fetch snapshots when mode changes to 'snapshot'
	useEffect(() => {
		if (mode !== 'snapshot' || !workspaceId) return;
		setSnapshotsLoading(true);
		fetch(`/api/workspaces/${workspaceId}/snapshots`)
			.then((r) => r.json())
			.then((data: Snapshot[]) => {
				setSnapshots(Array.isArray(data) ? data : []);
			})
			.catch(() => setSnapshots([]))
			.finally(() => setSnapshotsLoading(false));
	}, [mode, workspaceId]);

	const handleDeleteSnapshot = async (snapshotId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (!workspaceId) return;
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/snapshots/${snapshotId}`, { method: 'DELETE' });
			if (res.ok) {
				setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
				if (selectedSnapshot?.id === snapshotId) {
					setSelectedSnapshot(null);
				}
			}
		} catch {
			// Ignore delete errors
		}
	};

	const filteredRepos = useMemo(() => {
		const term = repoSearch.trim().toLowerCase();
		if (!term) return repos;
		return repos.filter((repo) => repo.fullName.toLowerCase().includes(term));
	}, [repoSearch, repos]);

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (mode === 'snapshot' && selectedSnapshot) {
			await onCreate({ snapshotId: selectedSnapshot.id, prompt: prompt || undefined });
		} else {
			const resolvedRepoUrl =
				mode === 'dropdown' ? selectedRepo?.cloneUrl || undefined : repoUrl || undefined;
			const resolvedBranch =
				mode === 'dropdown'
					? selectedRepo
						? selectedBranch || selectedRepo.defaultBranch || undefined
						: undefined
					: branch || undefined;
			await onCreate({
				repoUrl: resolvedRepoUrl,
				branch: resolvedBranch,
				prompt: prompt || undefined,
			});
		}
		setRepoUrl('');
		setBranch('');
		setPrompt('');
		setRepoSearch('');
		setSelectedRepo(null);
		setSelectedBranch('');
		setBranches([]);
		setSelectedSnapshot(null);
	};

  return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ backgroundColor: 'color-mix(in oklab, var(--foreground) 50%, transparent)' }}
		>
			<div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-[var(--foreground)]">New Session</h2>
					<button type="button" onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
						<X className="h-5 w-5" />
					</button>
				</div>

		<form onSubmit={handleSubmit} className="space-y-4">
			{!githubAvailable && (
				<>
					<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
						Connect GitHub in Profile settings to enable repository selection and git features.
					</div>
					{workspaceId && (
						<div className="flex items-center gap-2 text-xs">
							<button
								type="button"
								onClick={() => setMode('snapshot')}
								className={cn(
									"text-xs inline-flex items-center gap-1",
									mode === 'snapshot' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
								)}
							>
								<Camera className="h-3 w-3" />
								From Snapshot
							</button>
						</div>
					)}
					{mode === 'snapshot' && (
						<div className="space-y-2 max-h-48 overflow-y-auto">
							{snapshotsLoading ? (
								<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] py-4 justify-center">
									<Loader2 className="h-3 w-3 animate-spin" />
									Loading snapshots...
								</div>
							) : snapshots.length === 0 ? (
								<div className="text-xs text-[var(--muted-foreground)] py-4 text-center">
									No snapshots yet. Save a snapshot from an active session to see it here.
								</div>
							) : (
								snapshots.map((snap) => (
								<div
									key={snap.id}
									role="button"
									tabIndex={0}
									onClick={() => setSelectedSnapshot(snap)}
									onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSnapshot(snap); } }}
									className={cn(
										'flex w-full items-start justify-between gap-2 rounded-md border p-2 text-left text-xs transition-colors cursor-pointer',
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
										<div className="text-[10px] text-[var(--muted-foreground)] mt-1">
											{new Date(snap.createdAt).toLocaleDateString()}
										</div>
									</div>
									<button
										type="button"
										onClick={(e) => handleDeleteSnapshot(snap.id, e)}
										className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10"
										title="Delete snapshot"
									>
										<Trash2 className="h-3 w-3" />
									</button>
								</div>
							))
							)}
						</div>
					)}
				</>
			)}
			{githubAvailable && (
				<>
					<div className="flex items-center gap-2 text-xs">
						<button
							type="button"
							onClick={() => setMode('dropdown')}
							className={cn(
								"text-xs",
								mode === 'dropdown' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
							)}
						>
							Select repository
						</button>
						<span className="text-[var(--muted-foreground)]">|</span>
						<button
							type="button"
							onClick={() => setMode('url')}
							className={cn(
								"text-xs",
								mode === 'url' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
							)}
						>
							Use URL instead
						</button>
						{workspaceId && (
							<>
								<span className="text-[var(--muted-foreground)]">|</span>
								<button
									type="button"
									onClick={() => setMode('snapshot')}
									className={cn(
										"text-xs inline-flex items-center gap-1",
										mode === 'snapshot' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
									)}
								>
									<Camera className="h-3 w-3" />
									From Snapshot
								</button>
							</>
						)}
					</div>

						{mode === 'snapshot' ? (
							<div className="space-y-2 max-h-48 overflow-y-auto">
								{snapshotsLoading ? (
									<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] py-4 justify-center">
										<Loader2 className="h-3 w-3 animate-spin" />
										Loading snapshots...
									</div>
								) : snapshots.length === 0 ? (
									<div className="text-xs text-[var(--muted-foreground)] py-4 text-center">
										No snapshots yet. Save a snapshot from an active session to see it here.
									</div>
								) : (
								snapshots.map((snap) => (
									<div
										key={snap.id}
										role="button"
										tabIndex={0}
										onClick={() => setSelectedSnapshot(snap)}
										onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSnapshot(snap); } }}
										className={cn(
											'flex w-full items-start justify-between gap-2 rounded-md border p-2 text-left text-xs transition-colors cursor-pointer',
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
											<div className="text-[10px] text-[var(--muted-foreground)] mt-1">
												{new Date(snap.createdAt).toLocaleDateString()}
											</div>
										</div>
										<button
											type="button"
											onClick={(e) => handleDeleteSnapshot(snap.id, e)}
											className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10"
											title="Delete snapshot"
										>
											<Trash2 className="h-3 w-3" />
										</button>
									</div>
								))
								)}
							</div>
						) : mode === 'dropdown' ? (
							<div className="space-y-2" ref={repoDropdownRef}>
								<div>
									<label htmlFor={repoId} className="text-sm font-medium text-[var(--foreground)]">
										Repository
									</label>
									<Input
										id={repoId}
										value={repoSearch}
										onChange={(e) => {
											setRepoSearch(e.target.value);
											if (selectedRepo) {
												setSelectedRepo(null);
												setSelectedBranch('');
												setBranches([]);
											}
											setRepoDropdownOpen(true);
										}}
										onFocus={() => setRepoDropdownOpen(true)}
										placeholder="Search repositories..."
										className="mt-1"
									/>
									<p className="mt-1 text-xs text-[var(--muted-foreground)]">
										Choose a repository to clone into the sandbox.
									</p>
								</div>

								{repoDropdownOpen && (
									<div className="relative">
										<div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
											{reposLoading ? (
												<div className="px-3 py-2 text-sm text-[var(--muted-foreground)]">Loading repositories...</div>
											) : filteredRepos.length === 0 ? (
												<div className="px-3 py-2 text-sm text-[var(--muted-foreground)]">No repositories found.</div>
											) : (
												filteredRepos.map((repo) => (
													<button
														key={repo.fullName}
														type="button"
														className={cn(
															'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--accent)]',
															selectedRepo?.fullName === repo.fullName && 'bg-[var(--accent)]',
														)}
														onClick={() => {
															setSelectedRepo(repo);
															setSelectedBranch(repo.defaultBranch ?? '');
															setRepoSearch(repo.fullName);
															setBranches([]);
															setRepoDropdownOpen(false);
														}}
													>
														<span className="font-mono text-xs">{repo.fullName}</span>
														{repo.private && (
															<span className="text-[10px] text-[var(--muted-foreground)]">Private</span>
														)}
													</button>
												))
											)}
										</div>
									</div>
								)}

								{selectedRepo && (
									<div>
										<label htmlFor={branchId} className="text-sm font-medium text-[var(--foreground)]">
											Branch
										</label>
										<select
											id={branchId}
											value={selectedBranch}
											onChange={(e) => setSelectedBranch(e.target.value)}
											className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)]"
										>
											{branchesLoading ? (
												<option>Loading branches...</option>
											) : branches.length === 0 ? (
												<option>No branches found</option>
											) : (
												branches.map((branchOption) => (
													<option key={branchOption.name} value={branchOption.name}>
														{branchOption.name}
													</option>
												))
											)}
										</select>
										<p className="mt-1 text-xs text-[var(--muted-foreground)]">
											Checkout a specific branch after cloning.
										</p>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-4">
								{repoError && (
									<div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
										{repoError}
									</div>
								)}
								<div>
									<label htmlFor={repoId} className="text-sm font-medium text-[var(--foreground)]">
										Repository URL (optional)
									</label>
									<Input
										id={repoId}
										value={repoUrl}
										onChange={(e) => setRepoUrl(e.target.value)}
										placeholder="https://github.com/owner/repo"
										className="mt-1"
									/>
									<p className="mt-1 text-xs text-[var(--muted-foreground)]">
										Clone a GitHub repo into the sandbox. Leave empty for a blank workspace.
									</p>
								</div>

								<div>
									<label htmlFor={branchId} className="text-sm font-medium text-[var(--foreground)]">
										Branch (optional)
									</label>
									<Input
										id={branchId}
										value={branch}
										onChange={(e) => setBranch(e.target.value)}
										placeholder="main"
										className="mt-1"
									/>
									<p className="mt-1 text-xs text-[var(--muted-foreground)]">
										Checkout a specific branch after cloning.
									</p>
								</div>
							</div>
						)}
					</>
				)}

          <div>
            <label htmlFor={promptId} className="text-sm font-medium text-[var(--foreground)]">Initial Prompt (optional)</label>
            <Textarea
              id={promptId}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What would you like to work on?"
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
            <Button type="submit" disabled={isCreating || (mode === 'snapshot' && !selectedSnapshot)}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Session'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
