import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, FileCode, GitFork, ListTodo, Loader2, Terminal as TerminalIcon, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { TodoPanel } from '../chat/TodoPanel';
import { FileExplorer } from '../chat/FileExplorer';
import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';
import { TerminalOverlay } from '../chat/TerminalPanel';
import type { Message as ChatMessage, Part, ReasoningPart } from '../../types/opencode';
import { TextPartView } from '../chat/TextPartView';
import { ToolCallCard } from '../chat/ToolCallCard';
import { FilePartView } from '../chat/FilePartView';
import { SubtaskView } from '../chat/SubtaskView';
import { PermissionCard } from '../chat/PermissionCard';
import { QuestionCard } from '../chat/QuestionCard';
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from '../ai-elements/conversation';
import {
	Message,
	MessageActions,
	MessageAction,
	MessageContent,
	MessageResponse,
	MessageToolbar,
} from '../ai-elements/message';
import {
	PromptInput,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
} from '../ai-elements/prompt-input';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../ai-elements/reasoning';
import { Loader } from '../ai-elements/loader';
import { useToast } from '../ui/toast';

interface ChatPageProps {
  sessionId: string;
  session: {
    title: string | null;
    status: string;
    agent: string | null;
    model: string | null;
    sandboxUrl: string | null;
  };
  onForkedSession?: (session: {
    id: string;
    title: string | null;
    status: string;
    agent: string | null;
    model: string | null;
    sandboxUrl: string | null;
    createdAt: string;
    flagged: boolean | null;
  }) => void;
}

export function ChatPage({ sessionId, session: initialSession, onForkedSession }: ChatPageProps) {
  const [session, setSession] = useState(initialSession);
  const { toast } = useToast();

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  // Poll for session readiness when not yet active
  useEffect(() => {
    if (session.status === 'active') return;

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'active') {
            setSession((prev) => ({
              ...prev,
              status: 'active',
              sandboxUrl: data.sandboxUrl ?? prev.sandboxUrl,
            }));
          }
        }
      } catch {
        // Ignore — will retry on next interval
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [session.status, sessionId]);

  // Only connect SSE when session is active (pass undefined to skip connection)
  const activeSessionId = session.status === 'active' ? sessionId : undefined;
	const {
		messages,
		getPartsForMessage,
		sessionStatus,
		pendingPermissions,
		pendingQuestions,
		todos,
		isConnected,
		error,
	} = useSessionEvents(activeSessionId);

	const [isRetrying, setIsRetrying] = useState(false);

	const handleRetry = async () => {
		setIsRetrying(true);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/retry`, { method: 'POST' });
			if (res.ok) {
				// Reload the page to reconnect
				window.location.reload();
			}
		} catch {
			// Ignore
		} finally {
			setIsRetrying(false);
		}
	};

	const [inputText, setInputText] = useState('');
	const [isSending, setIsSending] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState('/agentuity-coder');
  const [selectedModel, setSelectedModel] = useState(session.model || 'anthropic/claude-sonnet-4-5');
  const [showTodos, setShowTodos] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalConnected, setTerminalConnected] = useState(false);
	const [isForking, setIsForking] = useState(false);
	const isBusy = sessionStatus.type === 'busy';

  // Derive display label from selected command
  const commandLabel = selectedCommand.replace(/^\//, '');

	const handleSend = async (text: string) => {
		if (!text.trim() || isSending || isBusy) return;
		setInputText('');
		setIsSending(true);

    try {
      // Prepend selected command mode to the message
		const messageText = selectedCommand === '/agentuity-coder'
			? text
			: `${selectedCommand} ${text}`;

      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          model: selectedModel,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      toast({ type: 'error', message: 'Failed to send message' });
    } finally {
      setIsSending(false);
    }
  };

  const handleFork = async () => {
    if (isForking) return;
    setIsForking(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/fork`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to fork session');
      }
      const newSession = await res.json();
      onForkedSession?.(newSession);
    } catch (error) {
      console.error('Failed to fork session:', error);
      toast({ type: 'error', message: 'Failed to fork session' });
    } finally {
      setIsForking(false);
    }
  };

  // Abort
  const handleAbort = async () => {
    try {
      await fetch(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
    } catch {
      // Ignore abort errors
    }
  };

	const lastAssistantMessage = useMemo(
		() => [...messages].reverse().find((message) => message.role === 'assistant'),
		[messages]
	);
	const lastAssistantParts = lastAssistantMessage
		? getPartsForMessage(lastAssistantMessage.id)
		: [];
	const hasStreamingContent = lastAssistantParts.length > 0;
	const isStreaming = isBusy;
	const submitDisabled =
		session.status !== 'active' || (!isBusy && (!inputText.trim() || isSending));

	const copyMessage = useCallback(
		(message: ChatMessage) => {
			const parts = getPartsForMessage(message.id);
			const text = parts
				.filter((part) => part.type === 'text')
				.map((part) => (part as { text: string }).text)
				.join('');
			if (text.trim().length === 0) return;
			if (navigator?.clipboard?.writeText) {
				void navigator.clipboard.writeText(text);
			}
		},
		[getPartsForMessage]
	);

	const renderReasoning = (part: ReasoningPart, message: ChatMessage) => {
		const duration = part.time.end
			? Math.max(1, Math.ceil((part.time.end - part.time.start) / 1000))
			: undefined;
		const shouldStream = isStreaming && message.id === lastAssistantMessage?.id;
		return (
			<Reasoning
				defaultOpen={shouldStream}
				duration={duration}
				isStreaming={shouldStream}
				key={part.id}
			>
				<ReasoningTrigger />
				<ReasoningContent>{part.text}</ReasoningContent>
			</Reasoning>
		);
	};

	const renderPart = (part: Part, message: ChatMessage) => {
		switch (part.type) {
			case 'text':
				return (
					<MessageResponse key={part.id}>
						<TextPartView part={part} />
					</MessageResponse>
				);
			case 'reasoning':
				return renderReasoning(part, message);
			case 'tool':
				return <ToolCallCard key={part.id} part={part} />;
			case 'file':
				return <FilePartView key={part.id} part={part} />;
			case 'subtask':
				return <SubtaskView key={part.id} part={part} />;
			case 'agent':
				return (
					<div key={part.id} className="text-xs font-medium text-[var(--primary)]">
						Agent: {part.name}
					</div>
				);
			case 'step-finish':
				return (
					<div
						key={part.id}
						className="mt-1 border-t border-[var(--border)] pt-1 text-[10px] text-[var(--muted-foreground)]"
					>
						Tokens: {part.tokens.input}in / {part.tokens.output}out · Cost: ${part.cost.toFixed(4)}
					</div>
				);
			case 'patch':
				return (
					<div key={part.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
						<div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
							<span>Files changed ({part.files.length})</span>
						</div>
						<div className="mt-1 space-y-0.5">
							{part.files.map((file) => (
								<div key={file} className="text-xs font-mono text-[var(--foreground)]">
									{file}
								</div>
							))}
						</div>
					</div>
				);
			case 'snapshot':
				return (
					<div key={part.id} className="text-[10px] italic text-[var(--muted-foreground)]">
						{'📸'} Context snapshot saved
					</div>
				);
			case 'compaction':
				return (
					<div key={part.id} className="text-[10px] italic text-[var(--muted-foreground)]">
						{'🗜️'} Context compacted{part.auto ? ' (auto)' : ''}
					</div>
				);
			case 'retry':
				return (
					<div key={part.id} className="flex items-center gap-2 text-xs text-yellow-500">
						<span>Retry attempt {part.attempt}: {part.error.message || part.error.type}</span>
					</div>
				);
			case 'step-start':
				return null;
			default:
				return null;
		}
	};

  // Show loading state when session isn't ready
  if (session.status !== 'active') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--foreground)]">Starting session...</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">Setting up sandbox and AI agent</p>
        </div>
      </div>
    );
  }

  return (
		<div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {session.title || 'Untitled Session'}
          </h2>
          {session.status === 'active' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFork}
              className="h-7 w-7 p-0"
              title="Fork session"
              disabled={isForking}
            >
              {isForking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitFork className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {commandLabel}
          </Badge>
          {isBusy && (
            <Badge variant="default" className="text-[10px] gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Working
            </Badge>
          )}
          {sessionStatus.type === 'retry' && (
            <Badge variant="destructive" className="text-[10px]">
              Retrying ({sessionStatus.attempt})
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          {isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-500" />
          )}
          {/* Terminal toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTerminal(!showTerminal)}
            className={`h-7 text-xs gap-1 ${showTerminal ? 'bg-[var(--accent)]' : ''}`}
          >
            <TerminalIcon className={`h-3.5 w-3.5 ${terminalConnected ? 'text-green-500' : ''}`} />
            Terminal
          </Button>
          {/* Changes toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowChanges(!showChanges);
              if (!showChanges) setShowTodos(false);
            }}
            className="h-7 text-xs gap-1"
          >
            <FileCode className="h-3.5 w-3.5" />
            Files
          </Button>
          {/* Todo toggle */}
          {todos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTodos(!showTodos);
                if (!showTodos) setShowChanges(false);
              }}
              className="h-7 text-xs gap-1"
            >
              <ListTodo className="h-3.5 w-3.5" />
              {todos.filter(t => t.status !== 'completed').length}
            </Button>
          )}
          {/* Sandbox link */}
          {session.sandboxUrl && (
            <a
              href={session.sandboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--primary)] hover:underline"
            >
              Sandbox
            </a>
          )}
        </div>
      </div>

      {/* Body: messages + optional todo sidebar */}
			<div className="flex flex-1 min-w-0 overflow-hidden">
				<Conversation className="flex-1 min-w-0">
					<ConversationContent>
						{messages.length === 0 && !isBusy ? (
							<ConversationEmptyState>
								{!isConnected && error ? (
									<div className="text-center">
										<WifiOff className="mx-auto mb-3 h-8 w-8 text-red-500" />
										<p className="text-sm font-medium text-[var(--foreground)]">
											Connection failed
										</p>
										<p className="mb-3 mt-1 text-xs text-[var(--muted-foreground)]">
											Unable to connect to the AI agent
										</p>
										<Button size="sm" onClick={handleRetry} disabled={isRetrying}>
											{isRetrying ? (
												<>
													<Loader2 className="mr-1 h-3 w-3 animate-spin" />
													Retrying...
												</>
											) : (
												'Retry Connection'
											)}
										</Button>
									</div>
								) : (
									<div className="text-center">
										<p className="text-sm text-[var(--muted-foreground)]">
											Start a conversation...
										</p>
										<p className="mt-1 text-xs text-[var(--muted-foreground)]">
											Press Enter to send, Shift+Enter for newline
										</p>
									</div>
								)}
							</ConversationEmptyState>
						) : (
							messages.map((message) => {
								const parts = getPartsForMessage(message.id);
								const agent = 'agent' in message ? message.agent : undefined;
								const errorInfo = 'error' in message ? message.error : undefined;

								return (
									<Message
										from={message.role === 'user' ? 'user' : 'assistant'}
										key={message.id}
									>
										<MessageContent>
											{agent && (
												<div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
													{agent}
												</div>
											)}
											{parts.map((part) => renderPart(part, message))}
											{errorInfo && (
												<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
													Error: {errorInfo.message || errorInfo.type || 'Unknown error'}
												</div>
											)}
										</MessageContent>
										{message.role === 'assistant' && (
											<MessageToolbar>
												<MessageActions>
													<MessageAction
														label="Copy"
														onClick={() => copyMessage(message)}
														title="Copy"
													>
														<Copy className="h-3.5 w-3.5" />
													</MessageAction>
												</MessageActions>
											</MessageToolbar>
										)}
									</Message>
								);
							})
						)}

						{pendingPermissions.map((perm) => (
							<PermissionCard key={perm.id} request={perm} sessionId={sessionId} />
						))}
						{pendingQuestions.map((question) => (
							<QuestionCard key={question.id} request={question} sessionId={sessionId} />
						))}

						{isStreaming && !hasStreamingContent && (
							<Message from="assistant">
								<MessageContent>
									<Loader size={16} />
								</MessageContent>
							</Message>
						)}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>

        {/* Todo sidebar */}
        {showTodos && todos.length > 0 && (
          <div className="w-48 md:w-64 shrink-0">
            <TodoPanel todos={todos} />
          </div>
        )}

        {/* File changes sidebar */}
        {showChanges && (
          <div className="w-80 md:w-[480px] shrink-0 border-l border-[var(--border)]">
            <FileExplorer sessionId={sessionId} />
          </div>
        )}
      </div>

      {/* Terminal full-screen overlay */}
      {showTerminal && (
        <TerminalOverlay
          sessionId={sessionId}
          onClose={() => setShowTerminal(false)}
          onConnectionChange={setTerminalConnected}
        />
      )}

		{/* Input area */}
		<div className="border-t border-[var(--border)] p-3">
			<PromptInputProvider>
				<PromptInput
					onSubmit={({ text }) => handleSend(text)}
				>
					<div className="flex items-center gap-2 px-3 pt-2">
						<CommandPicker value={selectedCommand} onChange={setSelectedCommand} />
						<div className="h-3 w-px bg-[var(--border)]" />
						<ModelSelector value={selectedModel} onChange={setSelectedModel} />
					</div>
					<PromptInputTextarea
						value={inputText}
						onChange={(event) => setInputText(event.target.value)}
						placeholder="Message the agent..."
						disabled={session.status !== 'active'}
					/>
					<PromptInputFooter>
						<div className="text-[10px] text-[var(--muted-foreground)]">
							Enter to send · Shift+Enter for new line
						</div>
					<PromptInputSubmit
						disabled={submitDisabled}
						status={isBusy ? 'streaming' : 'ready'}
						onStop={handleAbort}
					/>
					</PromptInputFooter>
				</PromptInput>
			</PromptInputProvider>
		</div>
    </div>
  );
}
