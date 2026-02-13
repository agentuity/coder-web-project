import { useCallback, useEffect, useId, useState } from 'react';
import { useAnalytics, useTrackOnMount } from '@agentuity/react';
import { Settings, Save, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { GitHubSettings } from '../settings/GitHubSettings';
import { VoiceSettings } from '../settings/VoiceSettings';
import { DefaultAgentSetting } from '../settings/DefaultAgentSetting';
import { KeybindingsSettings } from '../settings/KeybindingsSettings';
import { EditorPreferencesSettings } from '../settings/EditorPreferencesSettings';

interface Workspace {
	id: string;
	name: string;
	description: string | null;
	settings: Record<string, unknown>;
}

interface SettingsPageProps {
	workspaceId: string;
	onWorkspaceChange?: (id: string) => void;
}

export function SettingsPage({ workspaceId, onWorkspaceChange }: SettingsPageProps) {
	const { track } = useAnalytics();
	useTrackOnMount({ eventName: 'page_viewed', properties: { page: 'settings' } });
	const [workspace, setWorkspace] = useState<Workspace | null>(null);
	const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [newWorkspaceName, setNewWorkspaceName] = useState('');
	const [creating, setCreating] = useState(false);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const nameInputId = useId();
	const descriptionInputId = useId();
	const newWorkspaceInputId = useId();

	// Form state
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [settingsError, setSettingsError] = useState<string | null>(null);

	// Fetch all workspaces
	const fetchAllWorkspaces = useCallback(async () => {
		try {
			const res = await fetch('/api/workspaces');
			const data = await res.json();
			setAllWorkspaces(data);
		} catch {
			/* ignore */
		}
	}, []);

	// Fetch current workspace
	const fetchWorkspace = useCallback(async () => {
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}`);
			const data = await res.json();
			setWorkspace(data);
			setName(data.name || '');
			setDescription(data.description || '');
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, [workspaceId]);

	useEffect(() => {
		fetchWorkspace();
		fetchAllWorkspaces();
	}, [fetchWorkspace, fetchAllWorkspaces]);

	const handleSave = async () => {
		setSaving(true);
		setSaved(false);
		setSettingsError(null);
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					description: description || undefined,
				}),
			});
		if (!res.ok) {
			const errBody = await res.json().catch(() => null);
			throw new Error(errBody?.error || 'Failed to save settings');
		}
		track('workspace_updated');
		setSaved(true);
		fetchAllWorkspaces();
		setTimeout(() => setSaved(false), 2000);
		} catch (err: any) {
			setSettingsError(err?.message || 'Failed to save settings.');
		}
		setSaving(false);
	};

	const handleCreateWorkspace = async () => {
		if (!newWorkspaceName.trim()) return;
		setCreating(true);
		setSettingsError(null);
		try {
			const res = await fetch('/api/workspaces', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newWorkspaceName.trim() }),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => null);
				throw new Error(errBody?.error || 'Failed to create workspace');
			}
			const created = await res.json();
			setNewWorkspaceName('');
			await fetchAllWorkspaces();
			onWorkspaceChange?.(created.id);
		} catch (err: any) {
			setSettingsError(err?.message || 'Failed to create workspace.');
		}
		setCreating(false);
	};

	const handleDeleteWorkspace = async (id: string) => {
		setDeleting(true);
		setSettingsError(null);
		try {
			const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const errBody = await res.json().catch(() => null);
				throw new Error(errBody?.error || 'Failed to delete workspace');
			}
			setConfirmDeleteId(null);
			await fetchAllWorkspaces();
		} catch (err: any) {
			window.alert(err?.message || 'Failed to delete workspace.');
		}
		setDeleting(false);
	};

	const handleSwitchWorkspace = (id: string) => {
		onWorkspaceChange?.(id);
	};

	const hasChanges = (): boolean => {
		if (!workspace) return false;
		return (
			name !== (workspace.name || '') ||
			description !== (workspace.description || '')
		);
	};

	if (loading) {
		return (
			<div className="p-6">
				<div className="text-sm text-[var(--muted-foreground)]">Loading settings...</div>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto p-6">
			{/* Header */}
			<div className="flex items-center gap-2 mb-6">
				<Settings className="h-5 w-5 text-[var(--primary)]" />
				<h2 className="text-xl font-semibold text-[var(--foreground)]">Settings</h2>
			</div>

			{/* Workspace Switcher */}
			<Card className="p-4 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-4">Workspaces</h3>

				{/* Workspace list */}
				<div className="space-y-1 mb-4">
					{allWorkspaces.map((ws) => {
						const isActive = ws.id === workspaceId;
						const isOnly = allWorkspaces.length === 1;
						const isConfirming = confirmDeleteId === ws.id;

						return (
							<div
								key={ws.id}
								className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
									isActive
										? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
										: 'text-[var(--foreground)] hover:bg-[var(--accent)]/50'
								}`}
							>
								<div className="flex items-center gap-2 min-w-0">
									<span className={`shrink-0 text-xs ${isActive ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}>
										{isActive ? '[*]' : '[ ]'}
									</span>
									<span className={`truncate ${isActive ? 'font-bold' : ''}`}>
										{ws.name}
									</span>
									{isActive && (
										<span className="text-xs text-[var(--muted-foreground)]">(active)</span>
									)}
								</div>

								<div className="flex items-center gap-1 shrink-0 ml-2">
									{!isActive && (
										<Button
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs"
											onClick={() => handleSwitchWorkspace(ws.id)}
										>
											Switch
										</Button>
									)}
									{isConfirming ? (
										<div className="flex items-center gap-1">
											<Button
												variant="destructive"
												size="sm"
												className="h-7 px-2 text-xs"
												onClick={() => handleDeleteWorkspace(ws.id)}
												disabled={deleting}
											>
												{deleting ? 'Deleting...' : 'Confirm'}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs"
												onClick={() => setConfirmDeleteId(null)}
												disabled={deleting}
											>
												Cancel
											</Button>
										</div>
									) : (
										!isActive && !isOnly && (
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs text-[var(--muted-foreground)] hover:text-red-500"
												onClick={() => setConfirmDeleteId(ws.id)}
											>
												<Trash2 className="h-3 w-3" />
											</Button>
										)
									)}
								</div>
							</div>
						);
					})}
				</div>

				{/* Create new workspace */}
				<div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
					<label htmlFor={newWorkspaceInputId} className="sr-only">
						New workspace name
					</label>
					<input
						id={newWorkspaceInputId}
						type="text"
						value={newWorkspaceName}
						onChange={(e) => setNewWorkspaceName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleCreateWorkspace();
						}}
						className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
						placeholder="New workspace name"
						disabled={creating}
					/>
					<Button
						size="sm"
						onClick={handleCreateWorkspace}
						disabled={creating || !newWorkspaceName.trim()}
					>
						<Plus className="h-4 w-4 mr-1" />
						{creating ? 'Creating...' : 'Create'}
					</Button>
				</div>
			</Card>

			{/* General Settings */}
			<Card className="p-4 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-4">General</h3>
				<div className="space-y-4">
					<div>
						<label htmlFor={nameInputId} className="text-xs text-[var(--muted-foreground)] mb-1 block">
							Workspace Name
						</label>
						<input
							id={nameInputId}
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
							placeholder="Workspace name"
						/>
					</div>
					<div>
						<label htmlFor={descriptionInputId} className="text-xs text-[var(--muted-foreground)] mb-1 block">
							Description (optional)
						</label>
						<input
							id={descriptionInputId}
							type="text"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
							placeholder="What this workspace is for"
						/>
					</div>
				</div>
			</Card>

			{/* Save Button */}
			<div className="flex items-center gap-3">
				<Button size="sm" onClick={handleSave} disabled={saving || !name.trim() || !hasChanges()}>
					<Save className="h-4 w-4 mr-1" />
					{saving ? 'Saving...' : 'Save Changes'}
				</Button>
				{saved && <span className="text-xs text-green-500">Settings saved</span>}
			</div>

			{settingsError && (
				<div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
					{settingsError}
				</div>
			)}

			{/* Default Agent */}
			<Card className="p-4 mt-8 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-2">Default Agent</h3>
				<p className="text-xs text-[var(--muted-foreground)] mb-3">
					Choose which agent is pre-selected when you start a new chat session.
				</p>
				<DefaultAgentSetting />
			</Card>

		{/* Code Editor */}
		<Card className="p-4 mb-6">
			<h3 className="text-sm font-medium text-[var(--foreground)] mb-2">Code Editor</h3>
			<p className="text-xs text-[var(--muted-foreground)] mb-4">
				Customize the code editor appearance and behavior.
			</p>
			<EditorPreferencesSettings />
		</Card>

		{/* Voice */}
		<Card className="p-4 mb-6">
			<h3 className="text-sm font-medium text-[var(--foreground)] mb-4">Voice (Narrator)</h3>
				<p className="text-xs text-[var(--muted-foreground)] mb-4">
					Configure voice input and text-to-speech for narrator conversations.
				</p>
				<VoiceSettings />
			</Card>

			{/* GitHub */}
			<Card className="p-4 mt-8 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-4">GitHub</h3>
				<p className="text-xs text-[var(--muted-foreground)] mb-4">
					Connect a GitHub personal access token for repository access in coding sessions.
				</p>
				<GitHubSettings />
			</Card>

			{/* Keyboard Shortcuts */}
			<Card className="p-4 mt-8 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-2">Keyboard Shortcuts</h3>
				<p className="text-xs text-[var(--muted-foreground)] mb-4">
					Customize keyboard shortcuts. Click a binding to change it.
				</p>
				<KeybindingsSettings />
			</Card>

			{/* Danger Zone */}
			<Card className="p-4 mt-8 border-red-500/20">
				<h3 className="text-sm font-medium text-red-500 mb-2 flex items-center gap-1.5">
					<AlertTriangle className="h-4 w-4" />
					Danger Zone
				</h3>
				<p className="text-xs text-[var(--muted-foreground)] mb-3">
					Permanently delete this workspace and all its data including sessions, skills, and sources.
				</p>
				<Button variant="destructive" size="sm" disabled={allWorkspaces.length <= 1}
					onClick={() => {
						if (allWorkspaces.length <= 1) return;
						// Switch to another workspace first, then delete
						const other = allWorkspaces.find(w => w.id !== workspaceId);
						if (!other) return;
						if (window.confirm(`Delete "${workspace?.name}" and all its data? This cannot be undone.`)) {
							onWorkspaceChange?.(other.id);
							handleDeleteWorkspace(workspaceId);
						}
					}}
				>
					Delete Workspace
				</Button>
				{allWorkspaces.length <= 1 && (
					<p className="text-xs text-[var(--muted-foreground)] mt-2">
						Cannot delete the only workspace. Create another workspace first.
					</p>
				)}
			</Card>
		</div>
	);
}
