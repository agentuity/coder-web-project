import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Square, ListTodo, FileCode, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { MessageList } from '../chat/MessageList';
import { TodoPanel } from '../chat/TodoPanel';
import { FileChangesPanel } from '../chat/FileChangesPanel';
import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';

interface ChatPageProps {
  sessionId: string;
  session: {
    title: string | null;
    status: string;
    agent: string | null;
    model: string | null;
    sandboxUrl: string | null;
  };
}

export function ChatPage({ sessionId, session: initialSession }: ChatPageProps) {
  const [session, setSession] = useState(initialSession);

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

  // Derive display label from selected command
  const commandLabel = selectedCommand.replace(/^\//, '');

  // Stick-to-bottom scrolling
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Track if user is at bottom
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  }, []);

  // Auto-scroll on new messages/parts if at bottom.
  // We read messages.length inside to trigger on changes while keeping the
  // linter happy with only scrollToBottom in the dep array. The conditional
  // on isAtBottomRef gates the actual scroll.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (messages.length !== prevCountRef.current) {
      prevCountRef.current = messages.length;
      if (isAtBottomRef.current) {
        scrollToBottom();
      }
    }
  });

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    const text = inputText;
    setInputText('');
    setIsSending(true);

    try {
      // Prepend selected command mode to the message
      const messageText = selectedCommand === '/agentuity-coder'
        ? text  // Default mode: send as plain text (OpenCode plugin handles it)
        : `${selectedCommand} ${text}`;

      await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          model: selectedModel,
        }),
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
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

  // Keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isBusy = sessionStatus.type === 'busy';

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
            Changes
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
      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto"
        >
				{messages.length === 0 && !isBusy && (
					<div className="flex h-full items-center justify-center">
						<div className="text-center">
							{!isConnected && error ? (
								<>
									<WifiOff className="h-8 w-8 text-red-500 mx-auto mb-3" />
									<p className="text-sm font-medium text-[var(--foreground)]">Connection failed</p>
									<p className="text-xs text-[var(--muted-foreground)] mt-1 mb-3">
										Unable to connect to the AI agent
									</p>
									<Button
										size="sm"
										onClick={handleRetry}
										disabled={isRetrying}
									>
										{isRetrying ? (
											<>
												<Loader2 className="h-3 w-3 mr-1 animate-spin" />
												Retrying...
											</>
										) : (
											'Retry Connection'
										)}
									</Button>
								</>
							) : (
								<>
									<p className="text-sm text-[var(--muted-foreground)]">
										Start a conversation...
									</p>
									<p className="text-xs text-[var(--muted-foreground)] mt-1">
										Press Enter to send, Shift+Enter for newline
									</p>
								</>
							)}
						</div>
					</div>
				)}
          <MessageList
            messages={messages}
            getPartsForMessage={getPartsForMessage}
            pendingPermissions={pendingPermissions}
            pendingQuestions={pendingQuestions}
            sessionId={sessionId}
          />
          {/* Busy indicator at bottom */}
          {isBusy && messages.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Agent is working...
            </div>
          )}
        </div>

        {/* Todo sidebar */}
        {showTodos && todos.length > 0 && (
          <div className="w-64 shrink-0">
            <TodoPanel todos={todos} />
          </div>
        )}

        {/* File changes sidebar */}
        {showChanges && (
          <div className="w-80 shrink-0 border-l border-[var(--border)]">
            <FileChangesPanel sessionId={sessionId} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border)] p-3">
        {/* Selectors row */}
        <div className="flex items-center gap-3 mb-2 px-1">
          <CommandPicker value={selectedCommand} onChange={setSelectedCommand} />
          <div className="h-3 w-px bg-[var(--border)]" />
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />
        </div>
        {/* Input row */}
        <div className="flex gap-2">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the agent..."
            className="flex-1 resize-none text-sm min-h-[2.5rem] max-h-32"
            rows={1}
            disabled={session.status !== 'active'}
          />
          {isBusy ? (
            <Button
              onClick={handleAbort}
              variant="destructive"
              size="icon"
              className="h-auto shrink-0"
              title="Stop"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!inputText.trim() || isSending || session.status !== 'active'}
              size="icon"
              className="h-auto shrink-0"
              title="Send (Enter)"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
