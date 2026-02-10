import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

interface Skill {
	id: string;
	name: string;
	description: string | null;
	content: string;
	type: string;
	repo?: string | null;
	enabled: boolean;
	createdAt: string;
}

interface SkillsPageProps {
	workspaceId: string;
}

interface RegistrySkill {
	name: string;
	description?: string | null;
	repo?: string | null;
	owner?: string | null;
	installs?: number | null;
	url?: string | null;
}

export function SkillsPage({ workspaceId }: SkillsPageProps) {
	const [skills, setSkills] = useState<Skill[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
	const [formData, setFormData] = useState({ name: '', description: '', content: '' });
	const [saving, setSaving] = useState(false);
	const nameInputId = useId();
	const descriptionInputId = useId();
	const contentInputId = useId();
	const [registrySkills, setRegistrySkills] = useState<RegistrySkill[]>([]);
	const [registryQuery, setRegistryQuery] = useState('');
	const [registryLoading, setRegistryLoading] = useState(false);
	const [registryError, setRegistryError] = useState<string | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

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
				const res = await fetch(`/api/skills/search?q=${encodeURIComponent(trimmed)}`,
					{ signal: abortControllerRef.current.signal });
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
		[],
	);

	useEffect(() => {
		if (registryQuery.trim().length < 2) {
			setRegistrySkills([]);
			return;
		}
		const timeout = setTimeout(() => {
			fetchRegistry(registryQuery);
		}, 300);
		return () => clearTimeout(timeout);
	}, [fetchRegistry, registryQuery]);

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

	const customSkills = useMemo(() => skills.filter((skill) => skill.type !== 'registry'), [skills]);
	const registrySkillsFromDb = useMemo(
		() => skills.filter((skill) => skill.type === 'registry'),
		[skills],
	);
	const registrySkillMap = useMemo(() => {
		const map = new Map<string, Skill>();
		for (const skill of registrySkillsFromDb) {
			if (!skill.repo) continue;
			map.set(`${skill.repo.toLowerCase()}@${skill.name.toLowerCase()}`, skill);
		}
		return map;
	}, [registrySkillsFromDb]);

	const handleInstall = async (skill: RegistrySkill) => {
		if (operationInProgress) return;
		const repo = skill.repo?.trim();
		if (!repo) return;
		const installKey = `${repo}@${skill.name}`;
		setOperationInProgress(true);
		setInstallingSkills((prev) => ({ ...prev, [installKey]: true }));
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/skills`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'registry',
					name: skill.name,
					description: skill.description || null,
					repo,
				}),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => null);
				throw new Error(errBody?.details || errBody?.error || 'Failed to save skill');
			}
			await fetchSkills();
		} catch (err: any) {
			setRegistryError(err?.message || 'Failed to install skill.');
		} finally {
			setInstallingSkills((prev) => ({ ...prev, [installKey]: false }));
			setOperationInProgress(false);
		}
	};

	const handleRemove = async (skillId: string) => {
		if (operationInProgress) return;
		if (!confirm('Remove this skill from the workspace?')) return;
		setOperationInProgress(true);
		setRemovingSkills((prev) => ({ ...prev, [skillId]: true }));
		try {
			const res = await fetch(`/api/skills/${skillId}`, { method: 'DELETE' });
			if (!res.ok) {
				const errBody = await res.json().catch(() => null);
				throw new Error(errBody?.details || errBody?.error || 'Failed to remove skill');
			}
			await fetchSkills();
		} catch (err: any) {
			setRegistryError(err?.message || 'Failed to remove skill.');
		} finally {
			setRemovingSkills((prev) => ({ ...prev, [skillId]: false }));
			setOperationInProgress(false);
		}
	};

	return (
		<div className="p-6">
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
							onClick={() => setShowForm(true)}
							disabled={showForm}
						>
							<Plus className="h-4 w-4 mr-1" />
							New Skill
						</Button>
					)}
				</div>
			</div>

			{/* Installed Skills Section */}
			<div className="mb-8">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-3">
					Installed ({skills.length})
				</h3>

				{/* Create/Edit Form */}
				{showForm && (
					<Card className="p-4 mb-4 border-[var(--primary)]/30">
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

				{loading ? (
					<div className="text-sm text-[var(--muted-foreground)]">Loading skills...</div>
				) : skills.length === 0 ? (
					<div className="text-center py-8">
						<Sparkles className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
						<p className="text-sm text-[var(--muted-foreground)]">No skills installed yet</p>
						<p className="text-xs text-[var(--muted-foreground)] mt-1">
							Create a custom skill or install one from the marketplace below
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
											<Badge variant="secondary" className="text-[10px]">
												{skill.type === 'registry' ? 'Registry' : 'Custom'}
											</Badge>
											<Badge variant={skill.enabled ? 'default' : 'secondary'} className="text-[10px]">
												{skill.enabled ? 'Active' : 'Disabled'}
											</Badge>
										</div>
										{skill.description && (
											<p className="text-xs text-[var(--muted-foreground)] mt-1">{skill.description}</p>
										)}
										{skill.type === 'registry' && skill.repo && (
											<p className="text-xs text-[var(--muted-foreground)] mt-1 font-mono">{skill.repo}</p>
										)}
										{skill.type !== 'registry' && skill.content && (
											<pre className="mt-2 text-xs text-[var(--muted-foreground)] font-mono whitespace-pre-wrap line-clamp-3">
												{skill.content}
											</pre>
										)}
									</div>
									<div className="flex items-center gap-1 ml-4 shrink-0">
										{skill.type !== 'registry' && (
											<>
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
											</>
										)}
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7 text-red-500"
											onClick={() => skill.type === 'registry' ? handleRemove(skill.id) : handleDelete(skill.id)}
											disabled={removingSkills[skill.id] || operationInProgress}
											title="Remove"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
							</Card>
						))}
					</div>
				)}
			</div>

			{/* Marketplace Section */}
			<div>
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Marketplace</h3>
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
							</div>
							<div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
								<span>Search the skills registry and add to this workspace.</span>
							</div>
						</div>
					</Card>

					{registryError && (
						<p className="text-xs text-red-500">{registryError}</p>
					)}
					{registryLoading ? (
						<div className="text-sm text-[var(--muted-foreground)]">Searching skills...</div>
					) : registryQuery.trim().length < 2 ? (
						<div className="text-center py-8">
							<p className="text-sm text-[var(--muted-foreground)]">Type at least 2 characters to search the registry</p>
						</div>
					) : registrySkills.length === 0 ? (
						<div className="text-center py-8">
							<p className="text-sm text-[var(--muted-foreground)]">
								No skills found for &ldquo;{registryQuery.trim()}&rdquo;
							</p>
							<p className="text-xs text-[var(--muted-foreground)] mt-1">Try a different search term.</p>
						</div>
					) : (
						<div className="space-y-3">
							{registrySkills.map((skill) => {
								const repo = skill.repo || null;
								const fullRef = repo ? `${repo}@${skill.name}` : null;
								const registryKey = repo ? `${repo.toLowerCase()}@${skill.name.toLowerCase()}` : null;
								const installedSkill = registryKey ? registrySkillMap.get(registryKey) : undefined;
								const installed = Boolean(installedSkill);
								const installKey = fullRef || skill.name;
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
														<a
															href={skill.url}
															target="_blank"
															rel="noopener noreferrer"
															className="underline hover:text-[var(--foreground)]"
														>
															skills.sh
														</a>
													)}
												</div>
											</div>
											<div className="flex items-center gap-2 ml-4 shrink-0">
												{installed && installedSkill ? (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleRemove(installedSkill.id)}
														disabled={removingSkills[installedSkill.id] || operationInProgress}
													>
														{removingSkills[installedSkill.id] ? 'Removing...' : 'Remove'}
													</Button>
												) : (
													<Button
														size="sm"
														onClick={() => handleInstall(skill)}
														disabled={!fullRef || installingSkills[installKey] || operationInProgress}
													>
														{installingSkills[installKey] ? 'Installing...' : 'Install'}
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
			</div>
		</div>
	);
}
