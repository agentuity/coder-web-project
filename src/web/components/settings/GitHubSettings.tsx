import { useEffect, useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

type GitHubStatus = {
	configured: boolean;
	username?: string;
	maskedToken?: string;
};

export function GitHubSettings() {
	const [status, setStatus] = useState<GitHubStatus>({ configured: false });
	const [token, setToken] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		setLoading(true);
		fetch('/api/user/github')
			.then((res) => res.json())
			.then((data: GitHubStatus) => {
				if (!active) return;
				setStatus({
					configured: Boolean(data.configured),
					username: data.username,
					maskedToken: data.maskedToken,
				});
			})
			.catch(() => {
				if (!active) return;
				setStatus({ configured: false });
			})
			.finally(() => {
				if (!active) return;
				setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const handleConnect = async () => {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch('/api/user/github', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.error || 'Invalid GitHub token');
				return;
			}
		const data = (await res.json()) as GitHubStatus;
		setStatus({
			configured: true,
			username: data.username,
			maskedToken: data.maskedToken,
		});
		setToken('');
		window.dispatchEvent(new Event('github-status-changed'));
	} catch {
		setError('Failed to connect GitHub token');
	} finally {
		setSaving(false);
	}
	};

	const handleDisconnect = async () => {
		setSaving(true);
		setError(null);
		try {
		await fetch('/api/user/github', { method: 'DELETE' });
		setStatus({ configured: false });
		window.dispatchEvent(new Event('github-status-changed'));
	} catch {
			setError('Failed to disconnect GitHub token');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4">
			{loading ? (
				<div className="text-sm text-[var(--muted-foreground)]">Loading GitHub settings...</div>
			) : status.configured ? (
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">Connected</Badge>
						{status.username && (
							<span className="text-sm text-[var(--foreground)]">@{status.username}</span>
						)}
						{status.maskedToken && (
							<span className="text-xs text-[var(--muted-foreground)]">{status.maskedToken}</span>
						)}
					</div>
					<Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={saving}>
						{saving ? 'Disconnecting...' : 'Disconnect'}
					</Button>
				</div>
			) : (
				<div className="space-y-3">
					<Input
						type="password"
						placeholder="ghp_••••••••••••••••"
						value={token}
						onChange={(e) => setToken(e.target.value)}
					/>
					<Button size="sm" onClick={handleConnect} disabled={saving || !token.trim()}>
						{saving ? 'Connecting...' : 'Connect'}
					</Button>
				</div>
			)}
			{error && <div className="text-sm text-red-500">{error}</div>}
			<div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/50 p-3">
				<p className="text-xs font-medium text-[var(--foreground)]">
					Create a{' '}
					<a
						href="https://github.com/settings/personal-access-tokens/new"
						target="_blank"
						rel="noopener noreferrer"
						className="text-[var(--primary)] underline"
					>
						fine-grained personal access token
					</a>{' '}
					with these permissions:
				</p>
				<div className="space-y-1 text-xs text-[var(--muted-foreground)]">
					<p className="font-medium text-[var(--foreground)]/80">Repository access</p>
					<ul className="ml-4 list-disc space-y-0.5">
						<li><span className="font-medium">Contents</span> — Read and write (clone, push, commit)</li>
						<li><span className="font-medium">Pull requests</span> — Read and write (create/manage PRs)</li>
						<li><span className="font-medium">Metadata</span> — Read-only (required, auto-selected)</li>
					</ul>
					<p className="mt-1.5 font-medium text-[var(--foreground)]/80">Recommended extras</p>
					<ul className="ml-4 list-disc space-y-0.5">
						<li><span className="font-medium">Issues</span> — Read and write (create/reference issues)</li>
						<li><span className="font-medium">Workflows</span> — Read and write (if using GitHub Actions)</li>
					</ul>
				</div>
				<p className="text-[10px] text-[var(--muted-foreground)]">
					Select "All repositories" or pick specific repos you want to use.
				</p>
			</div>
		</div>
	);
}
