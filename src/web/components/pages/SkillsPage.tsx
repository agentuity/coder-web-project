import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface Skill {
	id: string;
	name: string;
	description: string | null;
	content: string;
	enabled: boolean;
	createdAt: string;
}

interface SkillsPageProps {
	workspaceId: string;
	sessionId?: string;
}

interface RegistrySkill {
	name: string;
	description?: string | null;
	repo?: string | null;
	owner?: string | null;
	installs?: number | null;
	url?: string | null;
}

interface InstalledSkill {
	name: string;
	description?: string | null;
	repo?: string | null;
	directory?: string | null;
}

export function SkillsPage({ workspaceId, sessionId }: SkillsPageProps) {
	const [skills, setSkills] = useState<Skill[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
	const [formData, setFormData] = useState({ name: '', description: '', content: '' });
	const [saving, setSaving] = useState(false);
	const nameInputId = useId();
	const descriptionInputId = useId();
	const contentInputId = useId();
	const [activeTab, setActiveTab] = useState<'custom' | 'registry'>('custom');

	const [registrySkills, setRegistrySkills] = useState<RegistrySkill[]>([]);
	const [registryQuery, setRegistryQuery] = useState('');
	const [registryLoading, setRegistryLoading] = useState(false);
	const [registryError, setRegistryError] = useState<string | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
	const [installedLoading, setInstalledLoading] = useState(false);
	const [installedError, setInstalledError] = useState<string | null>(null);
	const [installedOnly, setInstalledOnly] = useState(false);
	const [installingSkills, setInstallingSkills] = useState<Record<string, boolean>>({});
	const [removingSkills, setRemovingSkills] = useState<Record<string, boolean>>({});
	const [operationInProgress, setOperationInProgress] = useState(false);

	// Fetch skills
	const fetchSkills = useCallback(async () => {
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/skills`);
			const data = await res.json();
			setSkills(Array.isArray(data) ? data : []);
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, [workspaceId]);

	useEffect(() => {
		fetchSkills();
	}, [fetchSkills]);

	const fetchRegistry = useCallback(
		async (query: string) => {
			if (!sessionId) {
				setRegistrySkills([]);
				return;
			}
			const trimmed = query.trim();
			if (trimmed.length < 2) {
				setRegistrySkills([]);
				return;
			}

			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
			abortControllerRef.current = new AbortController();

			setRegistryLoading(true);
			setRegistryError(null);
			try {
				const res = await fetch(
					`/api/sessions/${sessionId}/skills/search?q=${encodeURIComponent(trimmed)}`,
					{ signal: abortControllerRef.current.signal },
				);
				if (!res.ok) {
					const err = await res.json().catch(() => ({ error: 'Search failed' }));
					throw new Error(err.error || 'Search failed');
				}
				const data = await res.json();
				const mapped: RegistrySkill[] = (Array.isArray(data) ? data : []).map((item: any) => ({
					name: item.name || '',
					repo: item.repo || null,
					owner: item.repo?.split('/')[0] || null,
					installs: null,
					description: null,
					url: item.url || null,
				}));
				setRegistrySkills(mapped);
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') return;
				const msg = error instanceof Error ? error.message : 'Search failed';
				setRegistryError(msg);
				setRegistrySkills([]);
			} finally {
				setRegistryLoading(false);
			}
		},
		[sessionId],
	);

	const fetchInstalled = useCallback(async () => {
		if (!sessionId) {
			setInstalledSkills([]);
			return;
		}
		setInstalledLoading(true);
		setInstalledError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/skills/installed`);
			if (!res.ok) {
				const error = await res.json().catch(() => ({ error: 'Unknown error' }));
				if (res.status === 503) {
					setInstalledError('Sandbox is starting up. Please wait...');
				} else {
					setInstalledError(error.error || 'Failed to load installed skills');
				}
				setInstalledSkills([]);
				setInstalledLoading(false);
				return;
			}
			const data = await res.json();
			setInstalledSkills(Array.isArray(data) ? data : []);
		} catch {
			setInstalledError('Unable to load installed skills.');
			setInstalledSkills([]);
		} finally {
			setInstalledLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		if (!sessionId) {
			setInstalledSkills([]);
			setInstalledOnly(false);
			return;
		}
		fetchInstalled();
	}, [fetchInstalled, sessionId]);

	useEffect(() => {
		if (activeTab !== 'registry' || !sessionId || registryQuery.trim().length < 2) {
			if (registryQuery.trim().length < 2) {
				setRegistrySkills([]);
			}
			return;
		}
		const timeout = setTimeout(() => {
			fetchRegistry(registryQuery);
		}, 300);
		return () => clearTimeout(timeout);
	}, [activeTab, fetchRegistry, registryQuery, sessionId]);

	// Create/Update
	const handleSave = async () => {
		if (!formData.name.trim() || !formData.content.trim()) return;
		setSaving(true);
		try {
			if (editingSkill) {
				await fetch(`/api/skills/${editingSkill.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formData),
				});
			} else {
				await fetch(`/api/workspaces/${workspaceId}/skills`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formData),
				});
			}
			setShowForm(false);
			setEditingSkill(null);
			setFormData({ name: '', description: '', content: '' });
			fetchSkills();
		} catch {
			/* ignore */
		}
		setSaving(false);
	};

	// Toggle enabled
	const handleToggle = async (skill: Skill) => {
		await fetch(`/api/skills/${skill.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ enabled: !skill.enabled }),
		});
		fetchSkills();
	};

	// Delete
	const handleDelete = async (id: string) => {
		if (!confirm('Delete this skill?')) return;
		await fetch(`/api/skills/${id}`, { method: 'DELETE' });
		fetchSkills();
	};

	// Start editing
	const startEdit = (skill: Skill) => {
		setEditingSkill(skill);
		setFormData({ name: skill.name, description: skill.description || '', content: skill.content });
		setShowForm(true);
	};

	// Cancel form
	const cancelForm = () => {
		setShowForm(false);
		setEditingSkill(null);
		setFormData({ name: '', description: '', content: '' });
	};

	const installedNameSet = useMemo(() => {
		return new Set(installedSkills.map((skill) => skill.name.toLowerCase()));
	}, [installedSkills]);

	const installedRepoSet = useMemo(() => {
		return new Set(
			installedSkills
				.map((skill) => skill.repo?.toLowerCase())
				.filter((repo): repo is string => Boolean(repo)),
		);
	}, [installedSkills]);

	const isRegistryInstalled = (skill: RegistrySkill): boolean => {
		const repo = skill.repo?.toLowerCase();
		if (repo && installedRepoSet.has(repo)) return true;
		const name = skill.name.toLowerCase();
		return installedNameSet.has(name);
	};

	const handleInstall = async (skill: RegistrySkill) => {
		if (!sessionId || operationInProgress) return;
		// Construct full ref: owner/repo@skill-name for specific skill install
		const baseRepo = skill.repo || (skill.owner ? `${skill.owner}/${skill.name}` : null);
		if (!baseRepo) return;
		const repoRef = skill.name && skill.repo ? `${skill.repo}@${skill.name}` : baseRepo;
		setOperationInProgress(true);
		setInstallingSkills((prev) => ({ ...prev, [repoRef]: true }));
		try {
			const res = await fetch(`/api/sessions/${sessionId}/skills/install`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ repo: repoRef }),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => null);
				throw new Error(errBody?.details || errBody?.error || 'Failed to install skill');
			}
			await fetchInstalled();
		} catch (err: any) {
			setRegistryError(err?.message || 'Failed to install skill.');
		} finally {
			setInstallingSkills((prev) => ({ ...prev, [repoRef]: false }));
			setOperationInProgress(false);
		}
	};

	const handleRemove = async (name: string) => {
		if (!sessionId || operationInProgress) return;
		if (!confirm('Remove this skill from the sandbox?')) return;
		setOperationInProgress(true);
		setRemovingSkills((prev) => ({ ...prev, [name]: true }));
		try {
			const res = await fetch(`/api/sessions/${sessionId}/skills/installed/${encodeURIComponent(name)}`,
				{
					method: 'DELETE',
				},
			);
			if (!res.ok) {
				const errBody = await res.json().catch(() => null);
				throw new Error(errBody?.details || errBody?.error || 'Failed to remove skill');
			}
			await fetchInstalled();
		} catch (err: any) {
			setInstalledError(err?.message || 'Failed to remove skill.');
		} finally {
			setRemovingSkills((prev) => ({ ...prev, [name]: false }));
			setOperationInProgress(false);
		}
	};

	return (
		<div className="p-6 max-w-4xl">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<Sparkles className="h-5 w-5 text-[var(--primary)]" />
					<h2 className="text-xl font-semibold text-[var(--foreground)]">Skills</h2>
					<span className="text-xs text-[var(--muted-foreground)]">Custom instructions for the AI agent</span>
				</div>
				<div className="flex items-center gap-3">
					{!showForm && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => { setActiveTab('custom'); setShowForm(true); }}
							disabled={showForm}
						>
							<Plus className="h-4 w-4 mr-1" />
							New Skill
						</Button>
					)}
					<div className="flex items-center rounded-lg border border-[var(--border)] p-0.5">
						<button
							type="button"
							onClick={() => setActiveTab('custom')}
							className={cn(
								'rounded-md px-3 py-1 text-sm font-medium transition-colors',
								activeTab === 'custom'
									? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
									: 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
							)}
						>
							Custom
						</button>
						<button
							type="button"
							onClick={() => { setActiveTab('registry'); setShowForm(false); }}
							className={cn(
								'rounded-md px-3 py-1 text-sm font-medium transition-colors',
								activeTab === 'registry'
									? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
									: 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
							)}
						>
							Registry
						</button>
					</div>
				</div>
			</div>

			{activeTab === 'custom' && (
				<>
					{/* Create/Edit Form */}
					{showForm && (
						<Card className="p-4 mb-6 border-[var(--primary)]/30">
							<h3 className="text-sm font-medium text-[var(--foreground)] mb-3">
								{editingSkill ? 'Edit Skill' : 'New Skill'}
							</h3>
							<div className="space-y-3">
								<div>
									<label
										className="text-xs text-[var(--muted-foreground)] mb-1 block"
										htmlFor={nameInputId}
									>
										Name
									</label>
									<input
										id={nameInputId}
										type="text"
										value={formData.name}
										onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
										className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
										placeholder="e.g., Code Style Rules"
									/>
								</div>
								<div>
									<label
										className="text-xs text-[var(--muted-foreground)] mb-1 block"
										htmlFor={descriptionInputId}
									>
										Description (optional)
									</label>
									<input
										id={descriptionInputId}
										type="text"
										value={formData.description}
										onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
										className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
										placeholder="Brief description of what this skill does"
									/>
								</div>
								<div>
									<label
										className="text-xs text-[var(--muted-foreground)] mb-1 block"
										htmlFor={contentInputId}
									>
										Content (instructions in markdown)
									</label>
									<textarea
										id={contentInputId}
										value={formData.content}
										onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
										className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] font-mono min-h-[200px] resize-y"
										placeholder="Write your skill instructions here..."
									/>
								</div>
								<div className="flex gap-2 justify-end">
									<Button variant="ghost" size="sm" onClick={cancelForm}>
										Cancel
									</Button>
									<Button
										size="sm"
										onClick={handleSave}
										disabled={saving || !formData.name.trim() || !formData.content.trim()}
									>
										{saving ? 'Saving...' : editingSkill ? 'Update' : 'Create'}
									</Button>
								</div>
							</div>
						</Card>
					)}

					{/* Skills List */}
					{loading ? (
						<div className="text-sm text-[var(--muted-foreground)]">Loading skills...</div>
					) : skills.length === 0 ? (
						<div className="text-center py-12">
							<Sparkles className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
							<p className="text-sm text-[var(--muted-foreground)]">No skills yet</p>
							<p className="text-xs text-[var(--muted-foreground)] mt-1">
								Skills are custom instructions injected into the AI agent context
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{skills.map((skill) => (
								<Card key={skill.id} className={`p-4 ${!skill.enabled ? 'opacity-50' : ''}`}>
									<div className="flex items-start justify-between">
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<h3 className="text-sm font-medium text-[var(--foreground)]">{skill.name}</h3>
												<Badge variant={skill.enabled ? 'default' : 'secondary'} className="text-[10px]">
													{skill.enabled ? 'Active' : 'Disabled'}
												</Badge>
											</div>
											{skill.description && (
												<p className="text-xs text-[var(--muted-foreground)] mt-1">{skill.description}</p>
											)}
											<pre className="mt-2 text-xs text-[var(--muted-foreground)] font-mono whitespace-pre-wrap line-clamp-3">
												{skill.content}
											</pre>
										</div>
										<div className="flex items-center gap-1 ml-4 shrink-0">
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												onClick={() => handleToggle(skill)}
												title={skill.enabled ? 'Disable' : 'Enable'}
											>
												{skill.enabled ? (
													<ToggleRight className="h-4 w-4 text-green-500" />
												) : (
													<ToggleLeft className="h-4 w-4" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												onClick={() => startEdit(skill)}
												title="Edit"
											>
												<Pencil className="h-3.5 w-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 text-red-500"
												onClick={() => handleDelete(skill.id)}
												title="Delete"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								</Card>
							))}
						</div>
					)}
				</>
			)}

			{activeTab === 'registry' && (
				<div className="space-y-4">
					<Card className="p-4">
						<div className="flex flex-col gap-3">
							<div className="flex items-center gap-2">
								<input
									type="text"
									value={registryQuery}
									onChange={(e) => setRegistryQuery(e.target.value)}
									className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
									placeholder="Search skills registry"
									aria-label="Search skills registry"
								/>
								<Button
									size="sm"
									variant={installedOnly ? 'secondary' : 'ghost'}
									onClick={() => setInstalledOnly((prev) => !prev)}
									disabled={!sessionId}
								>
									Installed only
								</Button>
							</div>
							<div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
								<span>Search the skills registry and install to the active sandbox.</span>
								{!sessionId && <span>Start a session to search and install skills.</span>}
							</div>
						</div>
					</Card>

					<Card className="p-4">
						<div className="flex items-center justify-between mb-2">
							<h3 className="text-sm font-medium text-[var(--foreground)]">Installed Skills</h3>
							<span className="text-xs text-[var(--muted-foreground)]">
								{installedLoading ? 'Loading...' : `${installedSkills.length} installed`}
							</span>
						</div>
						{installedError && (
							<p className="text-xs text-red-500 mb-2">{installedError}</p>
						)}
						{!sessionId ? (
							<p className="text-xs text-[var(--muted-foreground)]">Select a session to view installed skills.</p>
						) : installedLoading ? (
							<p className="text-xs text-[var(--muted-foreground)]">Loading installed skills...</p>
						) : installedSkills.length === 0 ? (
							<p className="text-xs text-[var(--muted-foreground)]">No skills installed yet.</p>
						) : (
							<div className="space-y-2">
								{installedSkills.map((skill) => {
									const removeKey = skill.directory || skill.name;
									return (
										<div key={removeKey} className="flex items-center justify-between">
											<div>
												<p className="text-sm text-[var(--foreground)]">{skill.name}</p>
												{skill.description && (
													<p className="text-xs text-[var(--muted-foreground)]">{skill.description}</p>
												)}
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleRemove(removeKey)}
												disabled={removingSkills[removeKey] || operationInProgress}
											>
												{removingSkills[removeKey] ? 'Removing...' : 'Remove'}
											</Button>
										</div>
									);
								})}
							</div>
						)}
					</Card>

					{registryError && (
						<p className="text-xs text-red-500">{registryError}</p>
					)}
				{registryLoading ? (
					<div className="text-sm text-[var(--muted-foreground)]">Searching skills...</div>
				) : !sessionId ? (
					<div className="text-center py-10">
						<Sparkles className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
						<p className="text-sm text-[var(--muted-foreground)]">Start a session to search the skills registry</p>
					</div>
				) : registryQuery.trim().length < 2 ? (
					<div className="text-center py-10">
						<Sparkles className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
						<p className="text-sm text-[var(--muted-foreground)]">Type at least 2 characters to search</p>
					</div>
				) : registrySkills.length === 0 ? (
					<div className="text-center py-10">
						<Sparkles className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
						<p className="text-sm text-[var(--muted-foreground)]">No skills found for &ldquo;{registryQuery.trim()}&rdquo;</p>
						<p className="text-xs text-[var(--muted-foreground)] mt-1">
							Try a different search term.
						</p>
					</div>
					) : (
						<div className="space-y-3">
							{registrySkills
								.filter((skill) => (!installedOnly ? true : isRegistryInstalled(skill)))
								.map((skill) => {
									const baseRepo = skill.repo || (skill.owner ? `${skill.owner}/${skill.name}` : null);
									const fullRef = skill.name && skill.repo ? `${skill.repo}@${skill.name}` : baseRepo;
									const installed = isRegistryInstalled(skill);
									const installedMatch = installedSkills.find(
										(item) =>
											(item.repo && skill.repo && item.repo === skill.repo) || item.name === skill.name,
									);
									const removeKey = installedMatch?.directory || installedMatch?.name || skill.name;
									return (
										<Card key={`${skill.name}-${skill.repo ?? skill.owner ?? 'registry'}`} className="p-4">
											<div className="flex items-start justify-between">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<h3 className="text-sm font-medium text-[var(--foreground)]">{skill.name}</h3>
														{installed && (
															<Badge variant="secondary" className="text-[10px]">
																Installed
															</Badge>
														)}
													</div>
													{skill.description && (
														<p className="text-xs text-[var(--muted-foreground)] mt-1">{skill.description}</p>
													)}
													<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
														{fullRef && <span className="font-mono">{fullRef}</span>}
														{skill.url && (
															<a href={skill.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--foreground)]">
																skills.sh
															</a>
														)}
													</div>
												</div>
												<div className="flex items-center gap-2 ml-4 shrink-0">
													{installed ? (
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleRemove(removeKey)}
															disabled={!sessionId || removingSkills[removeKey] || operationInProgress}
														>
															{removingSkills[removeKey] ? 'Removing...' : 'Remove'}
														</Button>
													) : (
														<Button
															size="sm"
															onClick={() => handleInstall(skill)}
															disabled={!sessionId || !fullRef || installingSkills[fullRef] || operationInProgress}
														>
															{fullRef && installingSkills[fullRef] ? 'Installing...' : 'Install'}
														</Button>
													)}
												</div>
											</div>
										</Card>
									);
								})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
