import { User, Bot, GitCommitHorizontal, AlertTriangle } from 'lucide-react';
import type { Message, Part, PermissionRequest, QuestionRequest } from '../../types/opencode';
import { TextPartView } from './TextPartView';
import { ReasoningView } from './ReasoningView';
import { ToolCallCard } from './ToolCallCard';
import { FilePartView } from './FilePartView';
import { SubtaskView } from './SubtaskView';
import { PermissionCard } from './PermissionCard';
import { QuestionCard } from './QuestionCard';

interface MessageListProps {
  messages: Message[];
  getPartsForMessage: (messageID: string) => Part[];
  pendingPermissions: PermissionRequest[];
  pendingQuestions: QuestionRequest[];
  sessionId: string;
}

function renderPart(part: Part) {
  switch (part.type) {
    case 'text':
      return <TextPartView key={part.id} part={part} />;
    case 'reasoning':
      return <ReasoningView key={part.id} part={part} />;
    case 'tool':
      return <ToolCallCard key={part.id} part={part} />;
    case 'file':
      return <FilePartView key={part.id} part={part} />;
    case 'subtask':
      return <SubtaskView key={part.id} part={part} />;
    case 'agent':
      return (
        <div key={part.id} className="text-xs text-[var(--primary)] font-medium">
          Agent: {part.name}
        </div>
      );
    case 'step-finish':
      return (
        <div key={part.id} className="text-[10px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-1 mt-1">
          Tokens: {part.tokens.input}in / {part.tokens.output}out · Cost: ${part.cost.toFixed(4)}
        </div>
      );
    case 'patch':
      return (
        <div key={part.id} className="border border-[var(--border)] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <GitCommitHorizontal className="h-3.5 w-3.5" />
            <span>Files changed ({part.files.length})</span>
          </div>
          <div className="mt-1 space-y-0.5">
            {part.files.map((f: string) => (
              <div key={f} className="text-xs font-mono text-[var(--foreground)]">{f}</div>
            ))}
          </div>
        </div>
      );
    case 'snapshot':
      return (
        <div key={part.id} className="text-[10px] text-[var(--muted-foreground)] italic">
          {'\uD83D\uDCF8'} Context snapshot saved
        </div>
      );
    case 'compaction':
      return (
        <div key={part.id} className="text-[10px] text-[var(--muted-foreground)] italic">
          {'\uD83D\uDDDC\uFE0F'} Context compacted{part.auto ? ' (auto)' : ''}
        </div>
      );
    case 'retry':
      return (
        <div key={part.id} className="flex items-center gap-2 text-xs text-yellow-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Retry attempt {part.attempt}: {part.error.message || part.error.type}</span>
        </div>
      );
    case 'step-start':
      // Step-start is an empty marker — nothing to render
      return null;
    default:
      return null;
  }
}

function UserMessageView({ message, parts }: { message: Message; parts: Part[] }) {
  const textParts = parts.filter(p => p.type === 'text');
  const text = textParts.map(p => (p as { text: string }).text || '').join('');

  return (
    <div className="flex gap-3 justify-end">
      <div className="max-w-[80%]">
        <div className="rounded-2xl rounded-tr-sm bg-[var(--primary)] px-4 py-2.5 text-sm text-[var(--primary-foreground)]">
          <pre className="whitespace-pre-wrap font-sans">{text || '(empty message)'}</pre>
        </div>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--muted)]">
        <User className="h-4 w-4 text-[var(--muted-foreground)]" />
      </div>
    </div>
  );
}

function AssistantMessageView({ message, parts }: { message: Message; parts: Part[] }) {
  const error = 'error' in message ? message.error : undefined;
  const agent = 'agent' in message ? message.agent : undefined;

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10">
        <Bot className="h-4 w-4 text-[var(--primary)]" />
      </div>
      <div className="max-w-[85%] space-y-2 min-w-0">
        {agent && (
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            {agent}
          </div>
        )}
        {parts.map(renderPart)}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            Error: {error.message || error.type || 'Unknown error'}
          </div>
        )}
      </div>
    </div>
  );
}

export function MessageList({ messages, getPartsForMessage, pendingPermissions, pendingQuestions, sessionId }: MessageListProps) {
  return (
    <div className="space-y-6 px-4 py-4">
      {messages.map((message) => {
        const parts = getPartsForMessage(message.id);

        if (message.role === 'user') {
          return <UserMessageView key={message.id} message={message} parts={parts} />;
        }
        return <AssistantMessageView key={message.id} message={message} parts={parts} />;
      })}

      {/* Pending permissions */}
      {pendingPermissions.map((perm) => (
        <PermissionCard key={perm.id} request={perm} sessionId={sessionId} />
      ))}

      {/* Pending questions */}
      {pendingQuestions.map((q) => (
        <QuestionCard key={q.id} request={q} sessionId={sessionId} />
      ))}
    </div>
  );
}
