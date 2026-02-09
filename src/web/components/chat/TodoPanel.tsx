import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle, ListTodo } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../ui/collapsible';
import type { Todo } from '../../types/opencode';

interface TodoPanelProps {
	todos: Todo[];
}

function getStatusIcon(status: string) {
	switch (status) {
		case 'completed':
			return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
		case 'in_progress':
			return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />;
		case 'cancelled':
			return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
		default:
			return <Circle className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />;
	}
}

function getPriorityColor(priority: string) {
	switch (priority) {
		case 'high':
			return 'destructive';
		case 'medium':
			return 'secondary';
		default:
			return 'outline';
	}
}

export function TodoPanel({ todos }: TodoPanelProps) {
	if (todos.length === 0) return null;

	const completed = todos.filter(t => t.status === 'completed').length;
	const total = todos.length;

	return (
		<div className="border-l border-[var(--border)] bg-[var(--card)] h-full">
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
				<ListTodo className="h-4 w-4 text-[var(--muted-foreground)]" />
				<span className="text-xs font-medium text-[var(--foreground)]">Tasks</span>
				<span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
					{completed}/{total}
				</span>
			</div>
			<div className="p-2 space-y-2 overflow-auto">
				{todos.map((todo) => (
					<Collapsible
						key={todo.id}
						defaultOpen={todo.status === 'in_progress'}
						className="rounded-md border border-[var(--border)] bg-[var(--background)]"
					>
						<CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-[var(--accent)]">
							{getStatusIcon(todo.status)}
							<div className={`flex-1 text-xs leading-tight ${
								todo.status === 'completed' ? 'text-[var(--muted-foreground)] line-through' : 'text-[var(--foreground)]'
							}`}>
								{todo.content}
							</div>
							<ChevronDown className="h-3 w-3 text-[var(--muted-foreground)] transition-transform group-data-[state=open]:rotate-180" />
						</CollapsibleTrigger>
						<CollapsibleContent className="border-t border-[var(--border)] px-2 py-2">
							<div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
								<span>Status: {todo.status.replace('_', ' ')}</span>
								{todo.priority && (
									<Badge variant={getPriorityColor(todo.priority) as any} className="text-[8px] px-1 py-0">
										{todo.priority}
									</Badge>
								)}
							</div>
						</CollapsibleContent>
					</Collapsible>
				))}
			</div>
		</div>
	);
}
