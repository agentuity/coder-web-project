import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

interface EnvPanelProps {
	sessionId: string;
	disabled?: boolean;
}

export function EnvPanel({ sessionId, disabled = false }: EnvPanelProps) {
	const [envMap, setEnvMap] = useState<Record<string, string>>({});
	const [keyInput, setKeyInput] = useState('');
	const [valueInput, setValueInput] = useState('');
	const [loading, setLoading] = useState(true);
	const [savingKey, setSavingKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);

	const entries = useMemo(
		() => Object.entries(envMap).sort((a, b) => a[0].localeCompare(b[0])),
		[envMap],
	);

	const fetchEnv = useCallback(async () => {
		if (!sessionId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/env`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setEnvMap((data?.env as Record<string, string>) || {});
		} catch {
			setError('Failed to load environment variables');
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		if (disabled) {
			setLoading(false);
			return;
		}
		fetchEnv();
	}, [disabled, fetchEnv]);

	const handleSave = useCallback(async () => {
		const key = keyInput.trim();
		if (!key || disabled) return;
		setSavingKey(key);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/env`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ env: { [key]: valueInput } }),
			});
			const data = await res.json();
			if (!res.ok || !data?.success) {
				throw new Error(data?.error || 'Failed to update env');
			}
			setEnvMap((prev) => ({ ...prev, [key]: data.env?.[key] ?? valueInput }));
			setKeyInput('');
			setValueInput('');
			setLastSavedKey(key);
			setTimeout(() => setLastSavedKey(null), 2000);
		} catch {
			setError('Failed to update environment variables');
		} finally {
			setSavingKey(null);
		}
	}, [disabled, keyInput, sessionId, valueInput]);

	const handleDelete = useCallback(async (key: string) => {
		if (disabled) return;
		setSavingKey(key);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/env`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ env: { [key]: null } }),
			});
			const data = await res.json();
			if (!res.ok || !data?.success) {
				throw new Error(data?.error || 'Failed to update env');
			}
			setEnvMap((prev) => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
		} catch {
			setError('Failed to delete environment variable');
		} finally {
			setSavingKey(null);
		}
	}, [disabled, sessionId]);

	return (
		<div className="bg-[var(--card)]">
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
				<span className="text-xs font-medium text-[var(--foreground)]">Environment</span>
				<Badge variant="secondary" className="text-[10px]">
					{entries.length}
				</Badge>
				<Button
					variant="ghost"
					size="sm"
					onClick={fetchEnv}
					disabled={loading || disabled}
					className="ml-auto h-6 w-6 p-0"
					title="Refresh"
				>
					<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
				</Button>
			</div>
			<div className="px-3 py-2 space-y-3">
				<p className="text-[10px] text-[var(--muted-foreground)]">
				Environment variables are available to commands and tools running in the sandbox.
				Values are visible to the agent and anyone with access to this session.
				</p>
				<div className="flex items-center gap-2">
					<Input
						value={keyInput}
						onChange={(e) => setKeyInput(e.target.value)}
						placeholder="KEY"
						className="h-7 text-xs font-mono"
						disabled={disabled}
					/>
					<Input
						value={valueInput}
						onChange={(e) => setValueInput(e.target.value)}
						placeholder="VALUE"
						className="h-7 text-xs font-mono"
						disabled={disabled}
					/>
					<Button
						size="sm"
						variant="secondary"
						onClick={handleSave}
						disabled={disabled || !keyInput.trim()}
						className="h-7 text-xs shrink-0"
					>
						<Plus className="h-3 w-3 mr-1" />
						Set
					</Button>
				</div>
				{disabled && (
					<div className="text-[10px] text-[var(--muted-foreground)]">
						Sandbox is not ready yet.
					</div>
				)}
				{error && (
					<div className="flex items-center gap-2 text-[10px] text-red-500">
						<AlertCircle className="h-3 w-3" />
						{error}
					</div>
				)}
				{loading && (
					<div className="text-[10px] text-[var(--muted-foreground)]">
						Loading environment variables...
					</div>
				)}
				{entries.length === 0 && !loading && (
					<div className="text-[10px] text-[var(--muted-foreground)]">
						No environment variables set.
					</div>
				)}
				{entries.length > 0 && (
					<div className="space-y-1">
						{entries.map(([key, value]) => (
							<div
								key={key}
								className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1"
							>
								<div className="flex-1 min-w-0">
									<div className="text-[10px] font-semibold text-[var(--foreground)]">{key}</div>
									<div className="truncate text-[10px] font-mono text-[var(--muted-foreground)]" title={value}>
										{value}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleDelete(key)}
									disabled={disabled || savingKey === key}
									className="h-6 w-6 p-0"
									title="Delete"
								>
									{lastSavedKey === key ? (
										<Check className="h-3 w-3 text-green-500" />
									) : (
										<Trash2 className="h-3 w-3" />
									)}
								</Button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
