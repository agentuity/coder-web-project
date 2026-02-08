import { useCallback, useEffect, useState } from 'react';
import { Settings, Save, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

const AGENTS = [
	{ value: 'lead', label: 'Lead', description: 'Strategic planner & orchestrator' },
	{ value: 'scout', label: 'Scout', description: 'Codebase explorer' },
	{ value: 'builder', label: 'Builder', description: 'Code implementer' },
	{ value: 'architect', label: 'Architect', description: 'Complex autonomous tasks' },
	{ value: 'reviewer', label: 'Reviewer', description: 'Code review & verification' },
];

const MODELS = [
	{ value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
	{ value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
	{ value: 'openai/codex-5-2', label: 'Codex 5.2' },
];

interface Workspace {
	id: string;
	name: string;
	description: string | null;
	settings: Record<string, unknown>;
}

interface SettingsPageProps {
	workspaceId: string;
}

export function SettingsPage({ workspaceId }: SettingsPageProps) {
	const [workspace, setWorkspace] = useState<Workspace | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	// Form state
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [defaultAgent, setDefaultAgent] = useState('builder');
	const [defaultModel, setDefaultModel] = useState('anthropic/claude-sonnet-4-5');

	// Fetch workspace
	const fetchWorkspace = useCallback(async () => {
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}`);
			const data = await res.json();
			setWorkspace(data);
			setName(data.name || '');
			setDescription(data.description || '');
			const settings = (data.settings || {}) as Record<string, unknown>;
			setDefaultAgent((settings.defaultAgent as string) || 'builder');
			setDefaultModel((settings.defaultModel as string) || 'anthropic/claude-sonnet-4-5');
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, [workspaceId]);

	useEffect(() => {
		fetchWorkspace();
	}, [fetchWorkspace]);

	const handleSave = async () => {
		setSaving(true);
		setSaved(false);
		try {
			await fetch(`/api/workspaces/${workspaceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					description: description || undefined,
					settings: {
						...(workspace?.settings || {}),
						defaultAgent,
						defaultModel,
					},
				}),
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch {
			/* ignore */
		}
		setSaving(false);
	};

	const hasChanges = (): boolean => {
		if (!workspace) return false;
		const settings = (workspace.settings || {}) as Record<string, unknown>;
		return (
			name !== (workspace.name || '') ||
			description !== (workspace.description || '') ||
			defaultAgent !== ((settings.defaultAgent as string) || 'builder') ||
			defaultModel !== ((settings.defaultModel as string) || 'anthropic/claude-sonnet-4-5')
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
		<div className="p-6 max-w-2xl">
			{/* Header */}
			<div className="flex items-center gap-2 mb-6">
				<Settings className="h-5 w-5 text-[var(--primary)]" />
				<h2 className="text-xl font-semibold text-[var(--foreground)]">Settings</h2>
			</div>

			{/* General Settings */}
			<Card className="p-4 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-4">General</h3>
				<div className="space-y-4">
					<div>
						<label className="text-xs text-[var(--muted-foreground)] mb-1 block">Workspace Name</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
							placeholder="Workspace name"
						/>
					</div>
					<div>
						<label className="text-xs text-[var(--muted-foreground)] mb-1 block">Description (optional)</label>
						<input
							type="text"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
							placeholder="What this workspace is for"
						/>
					</div>
				</div>
			</Card>

			{/* Defaults */}
			<Card className="p-4 mb-6">
				<h3 className="text-sm font-medium text-[var(--foreground)] mb-4">Defaults</h3>
				<div className="space-y-4">
					<div>
						<label className="text-xs text-[var(--muted-foreground)] mb-1 block">Default Agent</label>
						<select
							value={defaultAgent}
							onChange={(e) => setDefaultAgent(e.target.value)}
							className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
						>
							{AGENTS.map((a) => (
								<option key={a.value} value={a.value}>
									{a.label} — {a.description}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="text-xs text-[var(--muted-foreground)] mb-1 block">Default Model</label>
						<select
							value={defaultModel}
							onChange={(e) => setDefaultModel(e.target.value)}
							className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
						>
							{MODELS.map((m) => (
								<option key={m.value} value={m.value}>
									{m.label}
								</option>
							))}
						</select>
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

			{/* Danger Zone */}
			<Card className="p-4 mt-8 border-red-500/20">
				<h3 className="text-sm font-medium text-red-500 mb-2 flex items-center gap-1.5">
					<AlertTriangle className="h-4 w-4" />
					Danger Zone
				</h3>
				<p className="text-xs text-[var(--muted-foreground)] mb-3">
					Permanently delete this workspace and all its data including sessions, skills, and sources.
				</p>
				<Button variant="destructive" size="sm" disabled>
					Delete Workspace
				</Button>
			</Card>
		</div>
	);
}
