import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
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
					<div>
						<div className="text-xs uppercase tracking-wide text-blue-500">Question</div>
						<div className="text-sm font-semibold text-[var(--foreground)]">
							{request.questions[0]?.header ?? 'Input requested'}
						</div>
						{request.questions[0]?.question && (
							<div className="text-xs text-[var(--muted-foreground)] mt-1">
								{request.questions[0]?.question}
							</div>
						)}
					</div>
					{request.questions.map((q, qi) => (
						<div key={`${request.id}-${q.header}-${q.question}`}> 
							<div className="text-sm font-medium text-[var(--foreground)] mb-1">
								{q.header}
							</div>
							<div className="text-xs text-[var(--muted-foreground)] mb-2">
								{q.question}
							</div>
							<div className="flex flex-wrap gap-2">
							{q.options.map((opt) => (
								<Button
									key={`${q.header}-${opt.label}`}
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
				<Collapsible className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40">
					<CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-[10px] text-[var(--muted-foreground)]">
						<span>Show details</span>
						<ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
					</CollapsibleTrigger>
					<CollapsibleContent className="border-t border-[var(--border)] px-3 py-2">
						<pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-[var(--foreground)]">
							{JSON.stringify(request, null, 2)}
						</pre>
					</CollapsibleContent>
				</Collapsible>
				</div>
			</div>
		</div>
	);
}
