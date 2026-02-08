import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import type { QuestionRequest } from '../../types/opencode';

interface QuestionCardProps {
	request: QuestionRequest;
	sessionId: string;
}

export function QuestionCard({ request, sessionId }: QuestionCardProps) {
	const [replying, setReplying] = useState(false);
	const [replied, setReplied] = useState(false);
	const [customInputs, setCustomInputs] = useState<Record<number, string>>({});

	const handleReply = async (answers: string[][]) => {
		setReplying(true);
		try {
			await fetch(`/api/sessions/${sessionId}/questions/${request.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ answers }),
			});
			setReplied(true);
		} catch {
			// Failed to reply
		} finally {
			setReplying(false);
		}
	};

	if (replied) return null;

	return (
		<div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
			<div className="flex items-start gap-3">
				<HelpCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
				<div className="flex-1 min-w-0 space-y-3">
					{request.questions.map((q, qi) => (
						<div key={qi}>
							<div className="text-sm font-medium text-[var(--foreground)] mb-1">
								{q.header}
							</div>
							<div className="text-xs text-[var(--muted-foreground)] mb-2">
								{q.question}
							</div>
							<div className="flex flex-wrap gap-2">
								{q.options.map((opt, oi) => (
									<Button
										key={oi}
										size="sm"
										variant="outline"
										className="h-auto py-1.5 px-3 text-xs"
										disabled={replying}
										onClick={() => handleReply(request.questions.map((_, i) => i === qi ? [opt.label] : []))}
										title={opt.description}
									>
										{opt.label}
									</Button>
								))}
							</div>
							{(q.custom !== false) && (
								<div className="flex gap-2 mt-2">
									<input
										type="text"
										placeholder="Custom answer..."
										value={customInputs[qi] || ''}
										onChange={(e) => setCustomInputs(prev => ({ ...prev, [qi]: e.target.value }))}
										className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
										disabled={replying}
									/>
									<Button
										size="sm"
										className="h-7 text-xs"
										disabled={replying || !customInputs[qi]?.trim()}
										onClick={() => {
											const val = customInputs[qi]?.trim();
											if (val) {
												handleReply(request.questions.map((_, i) => i === qi ? [val] : []));
											}
										}}
									>
										Send
									</Button>
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
