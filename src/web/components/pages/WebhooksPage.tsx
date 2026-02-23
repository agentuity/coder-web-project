import { useCallback, useEffect, useId, useState } from 'react';
import { useAnalytics, useTrackOnMount } from '@agentuity/react';
import { Plus, Zap, Pencil, Trash2, ToggleLeft, ToggleRight, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

interface Webhook {
	id: string;
	name: string;
	description: string | null;
	prompt: string;
	secret: string;
	enabled: boolean | null;
	createdAt: string;
}

interface WebhooksPageProps {
	workspaceId: string;
}

export function WebhooksPage({ workspaceId }: WebhooksPageProps) {
	const { track } = useAnalytics();
	useTrackOnMount({ eventName: 'page_viewed', properties: { page: 'webhooks' } });
	const [webhooks, setWebhooks] = useState<Webhook[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
	const [saving, setSaving] = useState(false);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
	const nameInputId = useId();
	const descriptionInputId = useId();
	const promptInputId = useId();

	// Form state
	const [formName, setFormName] = useState('');
	const [formDescription, setFormDescription] = useState('');
	const [formPrompt, setFormPrompt] = useState('');

	// Fetch webhooks
	const fetchWebhooks = useCallback(async () => {
		try {
			const res = await fetch(`/api/workspaces/${workspaceId}/webhooks`);
			const data = await res.json();
			setWebhooks(Array.isArray(data) ? data : []);
		} catch {
			/* ignore */
		}
		setLoading(false);
	}, [workspaceId]);

	useEffect(() => {
		fetchWebhooks();
	}, [fetchWebhooks]);

	const resetForm = () => {
		setFormName('');
		setFormDescription('');
		setFormPrompt('');
	};

	const canSave = (): boolean => {
		return !!formName.trim() && !!formPrompt.trim();
	};

	// Create/Update
	const handleSave = async () => {
		if (!canSave()) return;
		setSaving(true);
		try {
			if (editingWebhook) {
				const res = await fetch(`/api/webhooks/${editingWebhook.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formName,
						description: formDescription || null,
						prompt: formPrompt,
					}),
				});
				if (res.ok) {
					track('webhook_updated');
				}
			} else {
				const res = await fetch(`/api/workspaces/${workspaceId}/webhooks`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: formName,
						description: formDescription || null,
						prompt: formPrompt,
					}),
				});
				if (res.ok) {
					track('webhook_created');
				}
			}
			setShowForm(false);
			setEditingWebhook(null);
			resetForm();
			fetchWebhooks();
		} catch {
			/* ignore */
		}
		setSaving(false);
	};

	// Toggle enabled
	const handleToggle = async (webhook: Webhook) => {
		await fetch(`/api/webhooks/${webhook.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ enabled: !webhook.enabled }),
		});
		fetchWebhooks();
	};

	// Delete
	const handleDelete = async (id: string) => {
		if (!confirm('Delete this webhook?')) return;
		const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
		if (res.ok) {
			track('webhook_deleted');
		}
		fetchWebhooks();
	};

	// Start editing
	const startEdit = (webhook: Webhook) => {
		setEditingWebhook(webhook);
		setFormName(webhook.name);
		setFormDescription(webhook.description ?? '');
		setFormPrompt(webhook.prompt);
		setShowForm(true);
	};

	// Cancel form
	const cancelForm = () => {
		setShowForm(false);
		setEditingWebhook(null);
		resetForm();
	};

	// Copy to clipboard
	const copyToClipboard = async (text: string, id: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedId(id);
			setTimeout(() => setCopiedId(null), 2000);
		} catch {
			/* ignore */
		}
	};

	// Toggle secret visibility
	const toggleSecretVisibility = (id: string) => {
		setVisibleSecrets((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const getTriggerUrl = (webhookId: string) => {
		return `${window.location.origin}/api/webhooks/${webhookId}/trigger`;
	};

	return (
		<div className="p-6">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<Zap className="h-5 w-5 text-[var(--primary)]" />
					<h2 className="text-xl font-semibold text-[var(--foreground)]">Webhooks</h2>
					<span className="text-xs text-[var(--muted-foreground)]">HTTP endpoints that trigger OpenCode sessions</span>
				</div>
				{!showForm && (
					<Button size="sm" onClick={() => setShowForm(true)}>
						<Plus className="h-4 w-4 mr-1" />
						New Webhook
					</Button>
				)}
			</div>
			{/* Create/Edit Form */}
			{showForm && (
				<Card className="p-4 mb-6 border-[var(--primary)]/30">
					<h3 className="text-sm font-medium text-[var(--foreground)] mb-3">
						{editingWebhook ? 'Edit Webhook' : 'New Webhook'}
					</h3>
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
									placeholder="e.g., Deploy Trigger"
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
									value={formDescription}
									onChange={(e) => setFormDescription(e.target.value)}
									className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
									placeholder="e.g., Triggered on GitHub push events"
								/>
							</div>
						</div>

						<div>
							<label
								className="text-xs text-[var(--muted-foreground)] mb-1 block"
								htmlFor={promptInputId}
							>
								Prompt Template
							</label>
							<textarea
								id={promptInputId}
								value={formPrompt}
								onChange={(e) => setFormPrompt(e.target.value)}
								className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] font-mono min-h-[120px] resize-y"
								placeholder="The prompt to send with the webhook payload. The payload JSON will be appended automatically."
							/>
							<p className="text-[10px] text-[var(--muted-foreground)] mt-1">
								The incoming webhook payload will be appended as a JSON code block after this prompt.
							</p>
						</div>

						<div className="flex gap-2 justify-end">
							<Button variant="ghost" size="sm" onClick={cancelForm}>
								Cancel
							</Button>
							<Button size="sm" onClick={handleSave} disabled={saving || !canSave()}>
								{saving ? 'Saving...' : editingWebhook ? 'Update' : 'Create'}
							</Button>
						</div>
					</div>
				</Card>
			)}

			{/* Webhooks List */}
			{loading ? (
				<div className="text-sm text-[var(--muted-foreground)]">Loading webhooks...</div>
			) : webhooks.length === 0 ? (
				<div className="text-center py-12">
					<Zap className="h-8 w-8 text-[var(--muted-foreground)] mx-auto mb-2" />
					<p className="text-sm text-[var(--muted-foreground)]">No webhooks yet</p>
					<p className="text-xs text-[var(--muted-foreground)] mt-1">
						Create webhooks to trigger OpenCode sessions via HTTP requests
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{webhooks.map((webhook) => (
						<Card key={webhook.id} className={`p-4 ${!webhook.enabled ? 'opacity-50' : ''}`}>
							<div className="flex items-start justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="text-sm font-medium text-[var(--foreground)]">{webhook.name}</h3>
										<Badge variant={webhook.enabled ? 'default' : 'secondary'} className="text-[10px]">
											{webhook.enabled ? 'Active' : 'Disabled'}
										</Badge>
									</div>
									{webhook.description && (
										<p className="mt-1 text-xs text-[var(--muted-foreground)]">
											{webhook.description}
										</p>
									)}

									{/* Trigger URL */}
									<div className="mt-2">
										<p className="text-[10px] text-[var(--muted-foreground)] mb-0.5">Trigger URL</p>
										<div className="flex items-center gap-1">
											<code className="text-xs font-mono text-[var(--foreground)] bg-[var(--muted)] px-2 py-0.5 rounded truncate block max-w-md">
												{getTriggerUrl(webhook.id)}
											</code>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6 shrink-0"
												onClick={() => copyToClipboard(getTriggerUrl(webhook.id), `url-${webhook.id}`)}
												title="Copy trigger URL"
											>
												<Copy className="h-3 w-3" />
											</Button>
											{copiedId === `url-${webhook.id}` && (
												<span className="text-[10px] text-green-500">Copied!</span>
											)}
										</div>
									</div>

									{/* Secret */}
									<div className="mt-2">
										<p className="text-[10px] text-[var(--muted-foreground)] mb-0.5">Secret</p>
										<div className="flex items-center gap-1">
											<code className="text-xs font-mono text-[var(--foreground)] bg-[var(--muted)] px-2 py-0.5 rounded">
												{visibleSecrets.has(webhook.id)
													? webhook.secret
													: '••••••••••••••••'}
											</code>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6 shrink-0"
												onClick={() => toggleSecretVisibility(webhook.id)}
												title={visibleSecrets.has(webhook.id) ? 'Hide secret' : 'Show secret'}
											>
												{visibleSecrets.has(webhook.id) ? (
													<EyeOff className="h-3 w-3" />
												) : (
													<Eye className="h-3 w-3" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6 shrink-0"
												onClick={() => copyToClipboard(webhook.secret, `secret-${webhook.id}`)}
												title="Copy secret"
											>
												<Copy className="h-3 w-3" />
											</Button>
											{copiedId === `secret-${webhook.id}` && (
												<span className="text-[10px] text-green-500">Copied!</span>
											)}
										</div>
									</div>

									{/* Prompt preview */}
									<div className="mt-2">
										<p className="text-[10px] text-[var(--muted-foreground)] mb-0.5">Prompt</p>
										<p className="text-xs text-[var(--foreground)] font-mono truncate max-w-lg">
											{webhook.prompt.length > 100 ? webhook.prompt.slice(0, 97) + '...' : webhook.prompt}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-1 ml-4 shrink-0">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() => handleToggle(webhook)}
										title={webhook.enabled ? 'Disable' : 'Enable'}
									>
										{webhook.enabled ? (
											<ToggleRight className="h-4 w-4 text-green-500" />
										) : (
											<ToggleLeft className="h-4 w-4" />
										)}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() => startEdit(webhook)}
										title="Edit"
									>
										<Pencil className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-red-500"
										onClick={() => handleDelete(webhook.id)}
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
