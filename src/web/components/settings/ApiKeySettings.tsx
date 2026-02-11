import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, Plus, Trash2, Key, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '../ui/dialog';

/** Better Auth API key endpoints live under /api/auth/api-key/* */
const API_BASE = '/api/auth/api-key';

interface ApiKey {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	createdAt: string;
	expiresAt: string | null;
	lastUsedAt: string | null;
	enabled: boolean;
}

function formatDate(date: Date | string | null) {
	if (!date) return 'Never';
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(date: Date | string | null) {
	if (!date) return null;
	const d = typeof date === 'string' ? new Date(date) : date;
	const now = Date.now();
	const diff = now - d.getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return formatDate(date);
}

export function ApiKeySettings() {
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Create dialog state
	const [showCreate, setShowCreate] = useState(false);
	const [newKeyName, setNewKeyName] = useState('');
	const [creating, setCreating] = useState(false);

	// Newly created key (shown once)
	const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Delete state
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	// Visibility toggle for key prefixes
	const [showPrefixes, setShowPrefixes] = useState(false);

	// Cleanup timeout on unmount to avoid React state update warnings
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const fetchKeys = useCallback(async () => {
		try {
			const res = await fetch(`${API_BASE}/list-api-keys`, {
				method: 'GET',
				credentials: 'include',
			});
			if (!res.ok) {
				setError('Failed to load API keys');
				return;
			}
			const data = await res.json();
			setKeys(Array.isArray(data) ? data : []);
		} catch {
			setError('Failed to load API keys');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchKeys();
	}, [fetchKeys]);

	const handleCreate = async () => {
		if (!newKeyName.trim()) return;
		setCreating(true);
		setError(null);
		try {
			const res = await fetch(`${API_BASE}/create-api-key`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newKeyName.trim() }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || data.error || 'Failed to create API key');
				setCreating(false);
				return;
			}
			const data = await res.json();
			const key = data?.key;
			if (key) {
				setNewlyCreatedKey(key);
			} else {
				setError('Key was created but could not be retrieved. Check your keys list.');
			}
			setNewKeyName('');
			setShowCreate(false);
			await fetchKeys();
		} catch {
			setError('Failed to create API key');
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async (id: string) => {
		setDeletingId(id);
		setError(null);
		try {
			const res = await fetch(`${API_BASE}/delete-api-key`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ keyId: id }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || data.error || 'Failed to delete API key');
			} else {
				setConfirmDeleteId(null);
				await fetchKeys();
			}
		} catch {
			setError('Failed to delete API key');
		} finally {
			setDeletingId(null);
		}
	};

	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API unavailable — the code element has select-all styling
			// so users can manually select and copy
			console.warn('Clipboard access denied, user can manually select and copy');
		}
	};

	const handleDismissNewKey = () => {
		setNewlyCreatedKey(null);
		setCopied(false);
	};

	if (loading) {
		return (
			<div className="text-sm text-[var(--muted-foreground)]">Loading API keys...</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Newly created key banner */}
			{newlyCreatedKey && (
				<div className="rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4 space-y-3">
					<div className="flex items-start justify-between gap-2">
						<div className="space-y-1">
							<p className="text-sm font-medium text-[var(--foreground)]">
								API key created
							</p>
							<p className="text-xs text-[var(--muted-foreground)]">
								Copy this key now. You won't be able to see it again.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<code className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-mono text-[var(--foreground)] select-all break-all">
							{newlyCreatedKey}
						</code>
						<Button
							variant="outline"
							size="sm"
							className="shrink-0"
							onClick={() => handleCopy(newlyCreatedKey)}
						>
							{copied ? (
								<Check className="h-3.5 w-3.5 text-green-500" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
						</Button>
					</div>
					<Button variant="ghost" size="sm" onClick={handleDismissNewKey} className="text-xs">
						I've copied it, dismiss
					</Button>
				</div>
			)}

			{/* Key list */}
		{keys.length === 0 && !error ? (
			<div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
					<Key className="h-8 w-8 mx-auto text-[var(--muted-foreground)] mb-3 opacity-50" />
					<p className="text-sm text-[var(--muted-foreground)] mb-1">No API keys yet</p>
					<p className="text-xs text-[var(--muted-foreground)] mb-4">
						Create an API key to use the Tasks API programmatically.
					</p>
					<Button size="sm" onClick={() => setShowCreate(true)}>
						<Plus className="h-3.5 w-3.5 mr-1.5" />
						Create API Key
					</Button>
				</div>
			) : (
				<>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1 transition-colors"
								onClick={() => setShowPrefixes(!showPrefixes)}
							>
								{showPrefixes ? (
									<EyeOff className="h-3 w-3" />
								) : (
									<Eye className="h-3 w-3" />
								)}
								{showPrefixes ? 'Hide' : 'Show'} key prefixes
							</button>
						</div>
						<Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
							<Plus className="h-3.5 w-3.5 mr-1.5" />
							New Key
						</Button>
					</div>

					<div className="space-y-2">
						{keys.map((key) => {
							const isConfirming = confirmDeleteId === key.id;
							const isDeleting = deletingId === key.id;

							return (
								<div
									key={key.id}
									className="group rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:border-[var(--border)]/80"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 space-y-1.5">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-[var(--foreground)] truncate">
													{key.name || 'Unnamed key'}
												</span>
												{!key.enabled && (
													<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
														Disabled
													</Badge>
												)}
											</div>
											<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)]">
												{showPrefixes && (key.start || key.prefix) && (
													<span className="font-mono">
														{key.start || key.prefix}...
													</span>
												)}
												<span>Created {formatDate(key.createdAt)}</span>
												{key.expiresAt && (
													<span>
														Expires {formatDate(key.expiresAt)}
													</span>
												)}
												{key.lastUsedAt && (
													<span>
														Last used {formatRelative(key.lastUsedAt)}
													</span>
												)}
											</div>
										</div>

										<div className="shrink-0 flex items-center gap-1">
											{isConfirming ? (
												<div className="flex items-center gap-1">
													<Button
														variant="destructive"
														size="sm"
														className="h-7 px-2 text-xs"
														onClick={() => handleDelete(key.id)}
														disabled={isDeleting}
													>
														{isDeleting ? 'Deleting...' : 'Confirm'}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														className="h-7 px-2 text-xs"
														onClick={() => setConfirmDeleteId(null)}
														disabled={isDeleting}
													>
														Cancel
													</Button>
												</div>
											) : (
												<Button
													variant="ghost"
													size="sm"
													className="h-7 w-7 p-0 text-[var(--muted-foreground)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
													onClick={() => setConfirmDeleteId(key.id)}
												>
													<Trash2 className="h-3.5 w-3.5" />
												</Button>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}

			{error && (
				<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
					{error}
				</div>
			)}

			{/* Create dialog */}
			<Dialog open={showCreate} onOpenChange={setShowCreate}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Create API Key</DialogTitle>
						<DialogDescription>
							Create a new key to authenticate with the Tasks API. The key will only be shown once after creation.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div>
							<label
								htmlFor="api-key-name"
								className="text-xs text-[var(--muted-foreground)] mb-1.5 block"
							>
								Name
							</label>
							<input
								id="api-key-name"
								type="text"
								value={newKeyName}
								onChange={(e) => setNewKeyName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && newKeyName.trim()) handleCreate();
								}}
								className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-1"
								placeholder="e.g. CI Pipeline, Slack Bot, My Script"
								autoFocus
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={handleCreate}
							disabled={creating || !newKeyName.trim()}
						>
							{creating ? 'Creating...' : 'Create Key'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<p className="text-xs text-[var(--muted-foreground)]">
				Use API keys to authenticate with the{' '}
				<code className="rounded bg-[var(--accent)] px-1 py-0.5 text-[10px]">
					POST /api/v1/tasks
				</code>{' '}
				endpoint. Pass the key as{' '}
				<code className="rounded bg-[var(--accent)] px-1 py-0.5 text-[10px]">
					Authorization: Bearer &lt;key&gt;
				</code>
			</p>
		</div>
	);
}
