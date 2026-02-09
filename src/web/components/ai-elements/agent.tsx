import { Bot } from 'lucide-react';

interface AgentDisplayProps {
  name: string;
  status?: 'active' | 'idle' | 'completed';
}

export function AgentDisplay({ name, status = 'active' }: AgentDisplayProps) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 px-2.5 py-1">
      <Bot className="h-3 w-3 text-[var(--primary)]" />
      <span className="text-xs font-medium text-[var(--primary)]">{name}</span>
      {status === 'active' && (
        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
}
