import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

const AGENT_OPTIONS = [
	{ value: '', label: 'Chat', description: 'Direct AI conversation' },
	{ value: '/agentuity-coder', label: 'Agentuity Coder', description: 'Full agent team' },
	{ value: '/agentuity-cadence', label: 'Cadence', description: 'Autonomous loop' },
];

export function DefaultAgentSetting() {
	const [value, setValue] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		fetch('/api/user/settings')
			.then((r) => r.json())
			.then((data: { defaultCommand?: string }) => setValue(data.defaultCommand ?? ''))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	const handleChange = async (newValue: string) => {
		setValue(newValue);
		setSaving(true);
		try {
			await fetch('/api/user/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ defaultCommand: newValue }),
			});
		} catch {
			/* ignore */
		}
		setSaving(false);
	};

	if (loading) return <div className="text-xs text-[var(--muted-foreground)]">Loading...</div>;

	return (
		<div className="space-y-1">
			{AGENT_OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => handleChange(opt.value)}
					disabled={saving}
					className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
						value === opt.value
							? 'bg-[var(--accent)] border border-[var(--primary)]'
							: 'border border-[var(--border)] hover:bg-[var(--accent)]/50'
					} ${saving ? 'opacity-50' : ''}`}
				>
					<Bot className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
					<div>
						<div className="text-xs font-medium text-[var(--foreground)]">{opt.label}</div>
						<div className="text-[10px] text-[var(--muted-foreground)]">{opt.description}</div>
					</div>
				</button>
			))}
		</div>
	);
}
