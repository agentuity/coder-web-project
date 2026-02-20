import { useCallback, useEffect, useState } from 'react';
import { Variable, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

interface WorkspaceEnvVarsProps {
	workspaceId: string;
}

export function WorkspaceEnvVars({ workspaceId }: WorkspaceEnvVarsProps) {
	const [envVars, setEnvVars] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [editKey, setEditKey] = useState<string | null>(null);
	const [formKey, setFormKey] = useState('');
	const [formValue, setFormValue] = useState('');
	const [showValues, setShowValues] = useState<Record<string, boolean>>({});

	const fetchEnvVars = useCallback(async () => {
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/settings/env`);
			if (res.ok) {
				const data = await res.json();
				setEnvVars(data);
			}
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, [workspaceId]);

	useEffect(() => {
		fetchEnvVars();
	}, [fetchEnvVars]);

	const handleSave = async (updatedVars: Record<string, string>) => {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/settings/env`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ envVars: updatedVars }),
			});
			if (!res.ok) throw new Error('Failed to save');
			setEnvVars(updatedVars);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to save environment variables';
			setError(message);
		}
		setSaving(false);
	};

	const handleAdd = () => {
		if (!formKey.trim() || !formValue.trim()) return;
		const updated = { ...envVars, [formKey.trim()]: formValue };
		handleSave(updated);
		setShowForm(false);
		setEditKey(null);
		setFormKey('');
		setFormValue('');
	};

	const handleDelete = (key: string) => {
		const updated = { ...envVars };
		delete updated[key];
		handleSave(updated);
	};

	const startEdit = (key: string) => {
		setEditKey(key);
		setFormKey(key);
		setFormValue(envVars[key] || '');
		setShowForm(true);
	};

	const toggleShow = (key: string) => {
		setShowValues((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	if (loading) {
		return (
			<Card className="p-6">
				<div className="text-sm text-[var(--muted-foreground)]">Loading environment variables...</div>
			</Card>
		);
	}

	return (
		<Card className="p-6">
			<div className="flex items-center justify-between mb-4">
				<div>
					<h3 className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
						<Variable className="h-4 w-4" />
						Environment Variables
					</h3>
					<p className="text-xs text-[var(--muted-foreground)] mt-1">
						Custom environment variables injected into every sandbox session.
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						setShowForm(true);
						setEditKey(null);
						setFormKey('');
						setFormValue('');
					}}
				>
					<Plus className="h-3.5 w-3.5 mr-1" /> Add Variable
				</Button>
			</div>

			{/* Add/Edit form */}
			{showForm && (
				<Card className="p-4 mb-4 border-[var(--primary)]/30">
					<div className="space-y-3">
						<div>
							<label className="text-xs font-medium text-[var(--muted-foreground)]">Key</label>
							<input
								value={formKey}
								onChange={(e) => setFormKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
								placeholder="MY_API_KEY"
								disabled={!!editKey}
								className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm font-mono text-[var(--foreground)]"
							/>
						</div>
						<div>
							<label className="text-xs font-medium text-[var(--muted-foreground)]">Value</label>
							<input
								value={formValue}
								onChange={(e) => setFormValue(e.target.value)}
								placeholder="sk-..."
								type="text"
								className="mt-1 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm font-mono text-[var(--foreground)]"
							/>
						</div>
						<div className="flex gap-2 justify-end">
							<Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
								Cancel
							</Button>
							<Button size="sm" onClick={handleAdd} disabled={!formKey.trim() || !formValue.trim() || saving}>
								{saving ? 'Saving...' : editKey ? 'Update' : 'Add'}
							</Button>
						</div>
					</div>
				</Card>
			)}

			{/* List of env vars */}
			{Object.keys(envVars).length === 0 ? (
				<p className="text-xs text-[var(--muted-foreground)] text-center py-4">
					No environment variables configured.
				</p>
			) : (
				<div className="space-y-2">
					{Object.entries(envVars).map(([key, value]) => (
						<div key={key} className="flex items-center justify-between py-2 px-3 rounded-md bg-[var(--accent)]/30">
							<div className="flex-1 min-w-0">
								<span className="text-sm font-mono font-medium text-[var(--foreground)]">{key}</span>
								<span className="text-sm font-mono text-[var(--muted-foreground)] ml-2">
									= {showValues[key] ? value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
								</span>
							</div>
							<div className="flex items-center gap-1 ml-4 shrink-0">
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7"
									onClick={() => toggleShow(key)}
									title="Toggle visibility"
								>
									{showValues[key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7"
									onClick={() => startEdit(key)}
									title="Edit"
								>
									<Pencil className="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 text-red-500"
									onClick={() => handleDelete(key)}
									title="Delete"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}

			{error && <p className="text-xs text-red-500 mt-2">{error}</p>}
			{saved && <p className="text-xs text-green-500 mt-2">Environment variables saved.</p>}
		</Card>
	);
}
