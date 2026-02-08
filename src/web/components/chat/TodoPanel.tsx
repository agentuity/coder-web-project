import { CheckCircle2, Circle, Loader2, XCircle, ListTodo } from 'lucide-react';
import { Badge } from '../ui/badge';
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
			<div className="p-2 space-y-1 overflow-auto">
				{todos.map((todo) => (
					<div
						key={todo.id}
						className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--accent)] transition-colors"
					>
						{getStatusIcon(todo.status)}
						<div className="flex-1 min-w-0">
							<div className={`text-xs leading-tight ${
								todo.status === 'completed' ? 'text-[var(--muted-foreground)] line-through' : 'text-[var(--foreground)]'
							}`}>
								{todo.content}
							</div>
						</div>
						{todo.priority === 'high' && (
							<Badge variant={getPriorityColor(todo.priority) as any} className="text-[8px] px-1 py-0 shrink-0">
								{todo.priority}
							</Badge>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
