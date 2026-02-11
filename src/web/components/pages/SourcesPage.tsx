import { useCallback, useEffect, useId, useState } from 'react';
import { useAnalytics, useTrackOnMount } from '@agentuity/react';
import { Plus, Plug, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

interface Source {
	id: string;
	name: string;
	type: string;
	config: Record<string, unknown>;
	enabled: boolean;
	createdAt: string;
}

interface SourcesPageProps {
	workspaceId: string;
}

type SourceType = 'stdio' | 'sse';

const SOURCE_TYPES: { value: SourceType; label: string; description: string }[] = [
	{ value: 'stdio', label: 'stdio', description: 'Local command (stdin/stdout)' },
	{ value: 'sse', label: 'sse', description: 'Remote SSE endpoint' },
];

function parseArgsString(s: string): string[] {
	return s
		.split(',')
		.map((a) => a.trim())
		.filter(Boolean);
}

function parseEnvString(s: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of s.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx > 0) {
			env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
		}
	}
	return env;
}

function envToString(env: Record<string, string> | undefined): string {
	if (!env || typeof env !== 'object') return '';
	return Object.entries(env)
		.map(([k, v]) => `${k}=${v}`)
		.join('\n');
}

function configPreview(config: Record<string, unknown>): string {
	if (config.command) {
		const cmd = config.command as string;
		const args = Array.isArray(config.args) ? (config.args as string[]).join(' ') : '';
		return `${cmd} ${args}`.trim();
	}
	if (config.url) return config.url as string;
	return JSON.stringify(config);
}

export function SourcesPage({ workspaceId }: SourcesPageProps) {
	const { track } = useAnalytics();
	useTrackOnMount({ eventName: 'page_viewed', properties: { page: 'sources' } });
	const [sources, setSources] = useState<Source[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingSource, setEditingSource] = useState<Source | null>(null);
	const [saving, setSaving] = useState(false);
	const nameInputId = useId();
	const typeInputId = useId();
	const jsonConfigId = useId();
	const commandInputId = useId();
	const argsInputId = useId();
	const envInputId = useId();
	const urlInputId = useId();
	// Form state
	const [formName, setFormName] = useState('');
	const [formType, setFormType] = useState<SourceType>('stdio');
	const [formCommand, setFormCommand] = useState('');
	const [formArgs, setFormArgs] = useState('');
	const [formEnv, setFormEnv] = useState('');
	const [formUrl, setFormUrl] = useState('');
	const [formJsonConfig, setFormJsonConfig] = useState('');
	const [useJsonEditor, setUseJsonEditor] = useState(false);

	// Fetch sources
	const fetchSources = useCallback(async () => {
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/sources`);
			const data = await res.json();
			setSources(Array.isArray(data) ? data : []);
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, [workspaceId]);

	useEffect(() => {
		fetchSources();
	}, [fetchSources]);

	const resetForm = () => {
		setFormName('');
		setFormType('stdio');
		setFormCommand('');
		setFormArgs('');
		setFormEnv('');
		setFormUrl('');
		setFormJsonConfig('');
		setUseJsonEditor(false);
	};

	const buildConfig = (): Record<string, unknown> => {
		if (useJsonEditor) {
			try {
				return JSON.parse(formJsonConfig);
			} catch {
				return {};
			}
		}
		if (formType === 'stdio') {
			const config: Record<string, unknown> = { command: formCommand };
			const args = parseArgsString(formArgs);
			if (args.length > 0) config.args = args;
			const env = parseEnvString(formEnv);
			if (Object.keys(env).length > 0) config.env = env;
			return config;
		}
		return { url: formUrl };
	};

	const canSave = (): boolean => {
		if (!formName.trim()) return false;
		if (useJsonEditor) {
			try {
				JSON.parse(formJsonConfig);
				return true;
			} catch {
				return false;
			}
		}
		if (formType === 'stdio') return !!formCommand.trim();
		return !!formUrl.trim();
	};

	// Create/Update
	const handleSave = async () => {
		if (!canSave()) return;
		setSaving(true);
		try {
			const config = buildConfig();
			if (editingSource) {
				const res = await fetch(`/api/sources/${editingSource.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: formName, type: formType, config }),
				});
				if (res.ok) {
					track('source_updated');
				}
			} else {
				const res = await fetch(`/api/workspaces/${workspaceId}/sources`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: formName, type: formType, config }),
				});
				if (res.ok) {
					track('source_created');
				}
			}
			setShowForm(false);
			setEditingSource(null);
			resetForm();
			fetchSources();
		} catch {
			/* ignore */
		}
		setSaving(false);
	};

	// Toggle enabled
	const handleToggle = async (source: Source) => {
		await fetch(`/api/sources/${source.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ enabled: !source.enabled }),
		});
		fetchSources();
	};

	// Delete
	const handleDelete = async (id: string) => {
		if (!confirm('Delete this source?')) return;
		const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
		if (res.ok) {
			track('source_deleted');
		}
		fetchSources();
	};

	// Start editing
	const startEdit = (source: Source) => {
		setEditingSource(source);
		setFormName(source.name);
		setFormType(source.type as SourceType);
		const cfg = source.config || {};
		if (source.type === 'stdio') {
			setFormCommand((cfg.command as string) || '');
			setFormArgs(Array.isArray(cfg.args) ? (cfg.args as string[]).join(', ') : '');
			setFormEnv(envToString(cfg.env as Record<string, string> | undefined));
			setFormUrl('');
		} else {
			setFormUrl((cfg.url as string) || '');
			setFormCommand('');
			setFormArgs('');
			setFormEnv('');
		}
		setFormJsonConfig(JSON.stringify(cfg, null, 2));
		setUseJsonEditor(false);
		setShowForm(true);
	};

	// Cancel form
	const cancelForm = () => {
		setShowForm(false);
		setEditingSource(null);
		resetForm();
	};

	return (
		<div className="p-6">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<Plug className="h-5 w-5 text-[var(--primary)]" />
					<h2 className="text-xl font-semibold text-[var(--foreground)]">MCP Sources</h2>
					<span className="text-xs text-[var(--muted-foreground)]">Model Context Protocol server connections</span>
				</div>
				{!showForm && (
					<Button size="sm" onClick={() => setShowForm(true)}>
						<Plus className="h-4 w-4 mr-1" />
						New Source
					</Button>
				)}
			</div>
			{/* Create/Edit Form */}
			{showForm && (
				<Card className="p-4 mb-6 border-[var(--primary)]/30">
					<div className="flex items-center justify-between mb-3">
						<h3 className="text-sm font-medium text-[var(--foreground)]">
							{editingSource ? 'Edit Source' : 'New Source'}
						</h3>
						<button
							type="button"
							onClick={() => {
								setUseJsonEditor(!useJsonEditor);
								if (!useJsonEditor) {
									setFormJsonConfig(JSON.stringify(buildConfig(), null, 2));
								}
							}}
							className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline"
						>
							{useJsonEditor ? 'Use form fields' : 'Edit as JSON'}
						</button>
					</div>
					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-3">
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
									value={formName}
									onChange={(e) => setFormName(e.target.value)}
									className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
									placeholder="e.g., My MCP Server"
								/>
							</div>
							<div>
								<label
									className="text-xs text-[var(--muted-foreground)] mb-1 block"
									htmlFor={typeInputId}
								>
									Type
								</label>
								<select
									id={typeInputId}
									value={formType}
									onChange={(e) => setFormType(e.target.value as SourceType)}
									className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
								>
									{SOURCE_TYPES.map((t) => (
										<option key={t.value} value={t.value}>
											{t.label} — {t.description}
										</option>
									))}
								</select>
							</div>
						</div>

						{useJsonEditor ? (
							<div>
								<label
									className="text-xs text-[var(--muted-foreground)] mb-1 block"
									htmlFor={jsonConfigId}
								>
									Config (JSON)
								</label>
								<textarea
									id={jsonConfigId}
									value={formJsonConfig}
									onChange={(e) => setFormJsonConfig(e.target.value)}
									className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] font-mono min-h-[120px] resize-y"
									placeholder='{ "command": "npx", "args": ["-y", "@mcp/server"] }'
								/>
							</div>
						) : formType === 'stdio' ? (
							<>
								<div>
									<label
										className="text-xs text-[var(--muted-foreground)] mb-1 block"
										htmlFor={commandInputId}
									>
										Command
									</label>
									<input
										id={commandInputId}
										type="text"
										value={formCommand}
										onChange={(e) => setFormCommand(e.target.value)}
										className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] font-mono"
										placeholder="e.g., npx"
									/>
								</div>
								<div>
									<label
										className="text-xs text-[var(--muted-foreground)] mb-1 block"
										htmlFor={argsInputId}
									>
										Arguments (comma-separated)
									</label>
									<input
										id={argsInputId}
										type="text"
										value={formArgs}
										onChange={(e) => setFormArgs(e.target.value)}
										className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] font-mono"
										placeholder="e.g., -y, @modelcontextprotocol/server-filesystem, /tmp"
									/>
								</div>
								<div>
									<label
										className="text-xs text-[var(--muted-foreground)] mb-1 block"
										htmlFor={envInputId}
									>
										Environment variables (KEY=VALUE per line)
									</label>
									<textarea
										id={envInputId}
										value={formEnv}
										onChange={(e) => setFormEnv(e.target.value)}
										className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] font-mono min-h-[60px] resize-y"
										placeholder={'API_KEY=sk-...\nDEBUG=true'}
									/>
								</div>
							</>
						) : (
							<div>
								<label
									className="text-xs text-[var(--muted-foreground)] mb-1 block"
									htmlFor={urlInputId}
								>
									URL
								</label>
								<input
									id={urlInputId}
									type="text"
									value={formUrl}
									onChange={(e) => setFormUrl(e.target.value)}
									className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] font-mono"
									placeholder="e.g., https://mcp.example.com/sse"
								/>
							</div>
						)}

						<div className="flex gap-2 justify-end">
							<Button variant="ghost" size="sm" onClick={cancelForm}>
								Cancel
							</Button>
							<Button size="sm" onClick={handleSave} disabled={saving || !canSave()}>
								{saving ? 'Saving...' : editingSource ? 'Update' : 'Create'}
							</Button>
						</div>
					</div>
				</Card>
			)}

			{/* Sources List */}
			{loading ? (
				<div className="text-sm text-[var(--muted-foreground)]">Loading sources...</div>
			) : sources.length === 0 ? (
				<div className="text-center py-12">
					<Plug className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
					<p className="text-sm text-[var(--muted-foreground)]">No MCP sources yet</p>
					<p className="text-xs text-[var(--muted-foreground)] mt-1">
						Connect to Model Context Protocol servers to extend your agent's capabilities
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{sources.map((source) => (
						<Card key={source.id} className={`p-4 ${!source.enabled ? 'opacity-50' : ''}`}>
							<div className="flex items-start justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="text-sm font-medium text-[var(--foreground)]">{source.name}</h3>
										<Badge variant="outline" className="text-[10px] font-mono">
											{source.type}
										</Badge>
										<Badge variant={source.enabled ? 'default' : 'secondary'} className="text-[10px]">
											{source.enabled ? 'Active' : 'Disabled'}
										</Badge>
									</div>
									<p className="mt-1 text-xs text-[var(--muted-foreground)] font-mono truncate">
										{configPreview(source.config)}
									</p>
								</div>
								<div className="flex items-center gap-1 ml-4 shrink-0">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() => handleToggle(source)}
										title={source.enabled ? 'Disable' : 'Enable'}
									>
										{source.enabled ? (
											<ToggleRight className="h-4 w-4 text-green-500" />
										) : (
											<ToggleLeft className="h-4 w-4" />
										)}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() => startEdit(source)}
										title="Edit"
									>
										<Pencil className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-red-500"
										onClick={() => handleDelete(source.id)}
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
		</div>
	);
}
