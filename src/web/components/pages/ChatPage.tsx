import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Check,
	Copy,
	FileCode,
	GitBranch,
	GitFork,
	Link,
	ListOrdered,
	ListTodo,
	Loader2,
	Paperclip,
	Share2,
	Terminal as TerminalIcon,
	Wifi,
	WifiOff,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { TodoPanel } from '../chat/TodoPanel';
import { FileExplorer } from '../chat/FileExplorer';
import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';
import { TerminalOverlay } from '../chat/TerminalPanel';
import { GitPanel, useGitStatus } from '../chat/GitPanel';
import type { Message as ChatMessage, Part, ReasoningPart } from '../../types/opencode';
import { TextPartView } from '../chat/TextPartView';
import { ToolCallCard } from '../chat/ToolCallCard';
import { FilePartView } from '../chat/FilePartView';
import { SubtaskView } from '../chat/SubtaskView';
import { PermissionCard } from '../chat/PermissionCard';
import { QuestionCard } from '../chat/QuestionCard';
import { ContextIndicator } from '../chat/ContextIndicator';
import { SourcesView, type SourceItem } from '../chat/SourcesView';
import { IDELayout } from '../ide/IDELayout';
import { CodePanel } from '../ide/CodePanel';
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
import { useFileTabs } from '../../hooks/useFileTabs';
import { useCodeComments } from '../../hooks/useCodeComments';

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
	const [isSharing, setIsSharing] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<'chat' | 'ide'>('chat');
	const {
		tabs,
		activeId,
		activeTab,
		setActiveId,
		openFile,
		openRead,
		openWrite,
		openDiff,
		closeTab,
		updateTab,
	} = useFileTabs();
	const {
		commentCount,
		addComment,
		clearComments,
		formatForPrompt,
		getDiffAnnotations,
		getFileComments,
	} = useCodeComments();
	const activeFilePath = activeTab?.filePath ?? null;
	const isBusy = sessionStatus.type === 'busy';
	const { branch: gitBranch, changedCount: gitChangedCount } = useGitStatus(activeSessionId);

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
		const commentsBlock = formatForPrompt();
		const fullMessage = commentsBlock
			? `${messageText}\n\n---\nCode Comments:\n${commentsBlock}`
			: messageText;

		const res = await fetch(`/api/sessions/${sessionId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: fullMessage,
				model: selectedModel,
			}),
		});
		if (!res.ok) {
			throw new Error('Failed to send message');
		}
		if (commentCount > 0) {
			clearComments();
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

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to share session');
      }
      const { url } = await res.json();
      setShareUrl(url);
      toast({ type: 'success', message: 'Share link created!' });
    } catch (error) {
      console.error('Failed to share session:', error);
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to share session' });
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ type: 'success', message: 'Link copied to clipboard!' });
    } catch {
      toast({ type: 'error', message: 'Failed to copy link' });
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

	const sessionUsage = useMemo(() => {
		const totals = {
			tokens: {
				input: 0,
				output: 0,
				reasoning: 0,
				cache: { read: 0, write: 0 },
			},
			cost: 0,
			modelIDs: new Set<string>(),
			providerIDs: new Set<string>(),
		};

		for (const message of messages) {
			if (message.role !== 'assistant') continue;
			totals.cost += message.cost ?? 0;
			totals.tokens.input += message.tokens?.input ?? 0;
			totals.tokens.output += message.tokens?.output ?? 0;
			totals.tokens.reasoning += message.tokens?.reasoning ?? 0;
			totals.tokens.cache.read += message.tokens?.cache?.read ?? 0;
			totals.tokens.cache.write += message.tokens?.cache?.write ?? 0;
			if (message.modelID) totals.modelIDs.add(message.modelID);
			if (message.providerID) totals.providerIDs.add(message.providerID);
		}

		const totalTokens =
			totals.tokens.input +
			totals.tokens.output +
			totals.tokens.reasoning +
			totals.tokens.cache.read +
			totals.tokens.cache.write;

		return {
			...totals,
			totalTokens,
			modelID: totals.modelIDs.size === 1 ? Array.from(totals.modelIDs)[0] : null,
			providerID: totals.providerIDs.size === 1 ? Array.from(totals.providerIDs)[0] : null,
		};
	}, [messages]);

	const queuedCount = useMemo(() => {
		const lastTime = lastAssistantMessage?.time.created ?? 0;
		return messages.filter((message) => message.role === 'user' && message.time.created > lastTime).length;
	}, [messages, lastAssistantMessage]);

	const getSourcesForMessage = useCallback((parts: Part[]): SourceItem[] => {
		const sources: SourceItem[] = [];
		const seen = new Set<string>();

		const addSource = (item: SourceItem) => {
			const key = `${item.type}:${item.label}`;
			if (seen.has(key)) return;
			seen.add(key);
			sources.push(item);
		};

		for (const part of parts) {
			if (part.type !== 'tool') continue;
			const input = part.state.input ?? {};
			const output = 'output' in part.state ? part.state.output : undefined;

			if (typeof (input as { filePath?: unknown }).filePath === 'string') {
				addSource({ type: 'file', label: (input as { filePath: string }).filePath });
			}

			if ((part.tool === 'glob' || part.tool === 'grep') && output) {
				for (const filePath of output.split('\n').map((line) => line.trim()).filter(Boolean)) {
					addSource({ type: 'file', label: filePath });
				}
			}

			if (part.tool === 'webfetch' && typeof (input as { url?: unknown }).url === 'string') {
				const url = (input as { url: string }).url;
				addSource({ type: 'url', label: url, href: url });
			}
		}

		return sources;
	}, []);

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
			return (
				<ToolCallCard
					key={part.id}
					part={part}
					onOpenDiff={openDiff}
					onOpenWrite={openWrite}
					onOpenRead={openRead}
					onOpenFile={openFile}
					onAddComment={addComment}
					getDiffAnnotations={getDiffAnnotations}
					getFileComments={getFileComments}
					onSendMessage={handleSend}
				/>
			);
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

	const conversationView = (
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
					const sources = message.role === 'assistant' ? getSourcesForMessage(parts) : [];

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
								{sources.length > 0 && <SourcesView sources={sources} />}
							</MessageContent>
							{message.role === 'assistant' && (
								<MessageToolbar>
									<ContextIndicator
										tokens={message.tokens}
										cost={message.cost}
										modelID={message.modelID}
										providerID={message.providerID}
										label="Message"
										compact
									/>
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
	);

	const inputArea = (
		<div className="relative z-40 border-t border-[var(--border)] p-3">
			<PromptInputProvider>
				<PromptInput onSubmit={({ text }) => handleSend(text)}>
					<PromptInputTextarea
						value={inputText}
						onChange={(event) => setInputText(event.target.value)}
						placeholder="Message the agent..."
						disabled={session.status !== 'active'}
					/>
					<PromptInputFooter>
						<div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted-foreground)]"
								title="Attach files (coming soon)"
							>
								<Paperclip className="h-3 w-3" />
								Attach
							</button>
						<CommandPicker value={selectedCommand} onChange={setSelectedCommand} />
						<ModelSelector value={selectedModel} onChange={setSelectedModel} />
						<span>Enter to send · Shift+Enter for new line</span>
							{commentCount > 0 && (
								<Badge variant="secondary" className="text-[10px]">
									{commentCount} comment{commentCount > 1 ? 's' : ''}
								</Badge>
							)}
							{commentCount > 0 && (
								<Button
									variant="ghost"
									size="sm"
									className="h-6 text-[10px]"
									type="button"
									onClick={clearComments}
								>
									Clear
								</Button>
							)}
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
	);

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
          {session.status === 'active' && !shareUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="h-7 w-7 p-0"
              title="Share session"
              disabled={isSharing}
            >
              {isSharing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {shareUrl && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyShareUrl}
                className="h-7 gap-1 px-2 text-[10px] text-[var(--primary)]"
                title="Copy share link"
              >
                <Link className="h-3 w-3" />
                Copy Link
              </Button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[var(--primary)] hover:underline"
              >
                Open
              </a>
            </div>
          )}
				<Badge variant="secondary" className="text-[10px]">
					{commandLabel}
				</Badge>
				{sessionUsage.totalTokens > 0 && (
					<ContextIndicator
						tokens={sessionUsage.tokens}
						cost={sessionUsage.cost}
						modelID={sessionUsage.modelID}
						providerID={sessionUsage.providerID}
						label="Session"
					/>
				)}
				{isBusy && (
					<Badge variant="default" className="text-[10px] gap-1">
						<Loader2 className="h-2.5 w-2.5 animate-spin" />
						Working
					</Badge>
				)}
				{isBusy && queuedCount > 1 && (
					<Badge variant="secondary" className="text-[10px] gap-1">
						<ListOrdered className="h-2.5 w-2.5" />
						Queue {queuedCount}
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
          {/* View mode toggle */}
          <div className="flex items-center rounded-md bg-[var(--muted)] p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('chat')}
              className={`h-7 px-2 text-xs ${viewMode === 'chat' ? 'bg-[var(--background)] shadow-sm' : ''}`}
            >
              Chat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('ide')}
              className={`h-7 px-2 text-xs ${viewMode === 'ide' ? 'bg-[var(--background)] shadow-sm' : ''}`}
            >
              IDE
            </Button>
          </div>
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
          {/* Git popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
              >
                <GitBranch className="h-3.5 w-3.5" />
                {gitBranch ? (
                  <span className="font-mono max-w-[100px] truncate">{gitBranch}</span>
                ) : (
                  'Git'
                )}
                {gitChangedCount > 0 && (
                  <Badge variant="destructive" className="text-[9px] h-4 min-w-[16px] px-1">
                    {gitChangedCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              className="w-80 max-h-[500px] overflow-auto p-0"
            >
              <GitPanel sessionId={sessionId} />
            </PopoverContent>
          </Popover>
          {/* Files popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
              >
                <FileCode className="h-3.5 w-3.5" />
                Files
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              className="w-80 max-h-[400px] overflow-auto p-0"
            >
              <FileExplorer sessionId={sessionId} onOpenFile={openFile} activeFilePath={activeFilePath} />
            </PopoverContent>
          </Popover>
          {/* Todo toggle */}
          {todos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTodos(!showTodos);
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

		{/* Body */}
		{viewMode === 'ide' ? (
			<div className="flex flex-1 min-w-0 flex-col">
				<div className="flex-1 min-w-0">
					<IDELayout
						sidebar={
							<FileExplorer sessionId={sessionId} onOpenFile={openFile} activeFilePath={activeFilePath} />
						}
						codePanel={
							<CodePanel
								sessionId={sessionId}
								tabs={tabs}
								activeId={activeId}
								onSelectTab={setActiveId}
								onCloseTab={closeTab}
								onUpdateTab={updateTab}
								onAddComment={addComment}
								getDiffAnnotations={getDiffAnnotations}
								getFileComments={getFileComments}
								onSendMessage={handleSend}
							/>
						}
					/>
				</div>
				{/* Minimal input bar for IDE mode */}
				<div className="relative z-40 border-t border-[var(--border)] px-3 py-2">
					<PromptInputProvider>
						<PromptInput onSubmit={({ text }) => handleSend(text)}>
							<div className="flex items-center gap-2">
								<div className="flex-1 min-w-0">
									<PromptInputTextarea
										value={inputText}
										onChange={(event) => setInputText(event.target.value)}
										placeholder="Message the agent..."
										disabled={session.status !== 'active'}
									/>
								</div>
								{commentCount > 0 && (
									<Badge variant="secondary" className="text-[10px] shrink-0">
										{commentCount} comment{commentCount > 1 ? 's' : ''}
									</Badge>
								)}
								<PromptInputSubmit
									disabled={submitDisabled}
									status={isBusy ? 'streaming' : 'ready'}
									onStop={handleAbort}
								/>
							</div>
						</PromptInput>
					</PromptInputProvider>
				</div>
			</div>
		) : (
			<>
				<div className="flex flex-1 min-w-0 overflow-hidden">
					{conversationView}

					{/* Todo sidebar */}
					{showTodos && todos.length > 0 && (
						<div className="w-48 md:w-64 shrink-0">
							<TodoPanel todos={todos} />
						</div>
					)}
				</div>
				{inputArea}
			</>
		)}

			{/* Terminal full-screen overlay */}
			{showTerminal && (
				<TerminalOverlay
					sessionId={sessionId}
					onClose={() => setShowTerminal(false)}
					onConnectionChange={setTerminalConnected}
				/>
			)}
		</div>
	);
}
