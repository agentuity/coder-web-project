import { useState } from 'react';
import { useAnalytics } from '@agentuity/react';
import { Shield, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { PermissionRequest } from '../../types/opencode';

interface PermissionCardProps {
	request: PermissionRequest;
	sessionId: string;
}

export function PermissionCard({ request, sessionId }: PermissionCardProps) {
	const [replying, setReplying] = useState(false);
	const [replied, setReplied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { track } = useAnalytics();

	const handleReply = async (reply: 'once' | 'always' | 'reject') => {
		setReplying(true);
		setError(null);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/permissions/${request.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reply }),
			});
			if (!res.ok) {
				setError('Failed to send reply. Try again.');
				return;
			}
			track('permission_responded', { action: reply === 'reject' ? 'reject' : 'allow' });
			setReplied(true);
		} catch {
			setError('Network error. Try again.');
		} finally {
			setReplying(false);
		}
	};

	if (replied) return null;

	return (
		<div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
			<div className="flex items-start gap-3">
				<Shield className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium text-[var(--foreground)] mb-1">
						Permission Required
					</div>
					<div className="text-xs text-[var(--muted-foreground)] mb-2">
						{request.permission}
					</div>
					{request.patterns.length > 0 && (
						<div className="flex flex-wrap gap-1 mb-3">
							{request.patterns.map((pattern, i) => (
								<Badge key={i} variant="outline" className="text-[10px] font-mono">
									{pattern}
								</Badge>
							))}
						</div>
					)}
					<div className="flex gap-2">
						<Button
							size="sm"
							onClick={() => handleReply('once')}
							disabled={replying}
							className="h-7 text-xs"
						>
							<ShieldCheck className="h-3 w-3 mr-1" />
							Allow Once
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={() => handleReply('always')}
							disabled={replying}
							className="h-7 text-xs"
						>
							Always Allow
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => handleReply('reject')}
							disabled={replying}
							className="h-7 text-xs"
						>
							<ShieldX className="h-3 w-3 mr-1" />
							Deny
						</Button>
					</div>
					{error && (
						<div className="text-xs text-red-400 mt-2">{error}</div>
					)}
				</div>
			</div>
		</div>
	);
}
