import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEventHandler } from 'react';
import {
	Check,
	Copy,
	GitBranch,
	GitFork,
	Circle,
	ListOrdered,
	ListTodo,
	Loader2,
	Paperclip,
	ExternalLink,
	Terminal,

	WifiOff,
	X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { FileExplorer } from '../chat/FileExplorer';

import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';
import { GitPanel, useGitStatus } from '../chat/GitPanel';
import type { Message as ChatMessage, Part, ReasoningPart, ToolPart } from '../../types/opencode';
import { TextPartView } from '../chat/TextPartView';
import { ToolCallCard } from '../chat/ToolCallCard';
import { FilePartView } from '../chat/FilePartView';
import { SubtaskView } from '../chat/SubtaskView';
import { PermissionCard } from '../chat/PermissionCard';
import { QuestionCard } from '../chat/QuestionCard';
import { ContextIndicator } from '../chat/ContextIndicator';
import type { SourceItem } from '../chat/SourcesView';
import { IDELayout } from '../ide/IDELayout';
import { CodePanel } from '../ide/CodePanel';
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from '../ai-elements/conversation';
import { ChainOfThought } from '../ai-elements/chain-of-thought';
import { Plan } from '../ai-elements/plan';
import { AgentDisplay } from '../ai-elements/agent';
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
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import { MicButton } from '../ui/MicButton';
import { cn } from '../../lib/utils';
import { useUrlState } from '../../hooks/useUrlState';

interface ChatPageProps {
  sessionId: string;
  session: {
    title: string | null;
    status: string;
    agent: string | null;
    model: string | null;
    sandboxId: string | null;
    sandboxUrl: string | null;
    metadata?: Record<string, unknown> | null;
  };
  onForkedSession?: (session: {
    id: string;
    title: string | null;
    status: string;
    agent: string | null;
    model: string | null;
    sandboxId: string | null;
    sandboxUrl: string | null;
    createdAt: string;
    flagged: boolean | null;
    metadata?: Record<string, unknown> | null;
  }) => void;
  githubAvailable?: boolean;
}

type QueuedMessage = {
	text: string;
	model: string;
	command?: string;
	attachments?: AttachmentItem[];
};

type AttachmentItem = {
	id: string;
	filename: string;
	mime: string;
	size: number;
	content: string;
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
	'txt',
	'md',
	'mdx',
	'json',
	'js',
	'jsx',
	'ts',
	'tsx',
	'py',
	'java',
	'go',
	'rs',
	'rb',
	'php',
	'sh',
	'yaml',
	'yml',
	'toml',
	'csv',
	'log',
]);

export function ChatPage({ sessionId, session: initialSession, onForkedSession, githubAvailable = true }: ChatPageProps) {
  const [session, setSession] = useState(initialSession);
  const { toast } = useToast();
  const [statusStartedAt, setStatusStartedAt] = useState(() => Date.now());
  const [statusElapsedMs, setStatusElapsedMs] = useState(0);
  const [archivedMessages, setArchivedMessages] = useState<ChatMessage[]>([]);
  const [archivedParts, setArchivedParts] = useState<Map<string, Part[]>>(new Map());
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    if (!sessionId) return;
    if (session.status === 'active') {
      setStatusElapsedMs(0);
      return;
    }
    setStatusStartedAt(Date.now());
    setStatusElapsedMs(0);
  }, [session.status, sessionId]);

  useEffect(() => {
    if (session.status === 'active') return;
    const interval = setInterval(() => {
      setStatusElapsedMs(Date.now() - statusStartedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [session.status, statusStartedAt]);

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
					sandboxId: data.sandboxId ?? prev.sandboxId,
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

  useEffect(() => {
    if (session.status !== 'terminated') {
      setArchivedMessages([]);
      setArchivedParts(new Map());
      setArchiveError(null);
      setIsLoadingArchive(false);
      return;
    }

    let isMounted = true;
    setIsLoadingArchive(true);
    setArchiveError(null);

    fetch(`/api/sessions/${sessionId}/messages`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load messages');
        return res.json();
      })
      .then((data: unknown) => {
        if (!isMounted) return;
        const messages: ChatMessage[] = [];
        const partsByMessage = new Map<string, Part[]>();

        const addPart = (part: Part) => {
          const existing = partsByMessage.get(part.messageID) ?? [];
          existing.push(part);
          partsByMessage.set(part.messageID, existing);
        };

        const record = data as Record<string, unknown>;

        if (record?.messages && Array.isArray(record.messages)) {
          for (const item of record.messages as Array<Record<string, unknown>>) {
            if (item.info) messages.push(item.info as ChatMessage);
            if (Array.isArray(item.parts)) {
              for (const part of item.parts as Part[]) addPart(part);
            }
          }
        } else if (Array.isArray(data)) {
          for (const item of data as Array<Record<string, unknown>>) {
            if (item.info) messages.push(item.info as ChatMessage);
            else if (item.role) messages.push(item as unknown as ChatMessage);
            if (Array.isArray(item.parts)) {
              for (const part of item.parts as Part[]) addPart(part);
            }
          }
        }

        messages.sort((a, b) => a.time.created - b.time.created);
        setArchivedMessages(messages);
        setArchivedParts(partsByMessage);
      })
      .catch(() => {
        if (!isMounted) return;
        setArchiveError('Unable to load chat history');
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingArchive(false);
      });

    return () => {
      isMounted = false;
    };
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
	const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [selectedCommand, setSelectedCommand] = useState('');
  const [selectedModel, setSelectedModel] = useState(session.model || 'anthropic/claude-sonnet-4-5');
	const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
	const [showTodos, setShowTodos] = useState(false);
	const [showChanges, setShowChanges] = useState(false);
	const [isForking, setIsForking] = useState(false);
	const [isSharing, setIsSharing] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [shareCopied, setShareCopied] = useState(false);
	const [urlState, setUrlState] = useUrlState();
	const viewMode = urlState.v;
	const sidebarTab = urlState.tab;
	const [sshCopied, setSshCopied] = useState(false);
	const [sandboxCopied, setSandboxCopied] = useState(false);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editTitle, setEditTitle] = useState(session.title || '');
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const handleVoiceTranscript = useCallback((text: string) => {
		setInputText((prev) => (prev ? `${prev} ${text}` : text));
	}, []);

	const {
		isListening,
		isProcessing,
		isSupported: voiceSupported,
		toggleListening,
		error: voiceError,
	} = useVoiceInput({
		onTranscript: handleVoiceTranscript,
		continuous: true,
	});

	useEffect(() => {
		if (voiceError) {
			toast({ type: 'error', message: voiceError });
		}
	}, [voiceError, toast]);

	const { enqueue: enqueueAudio, clearQueue: clearAudioQueue } = useAudioPlayback();

	// Narrator toggle
	const [narratorEnabled, setNarratorEnabled] = useState(false);

	const speakTextRef = useRef<(text: string) => Promise<void>>(undefined);
	speakTextRef.current = async (text: string) => {
		if (!text.trim()) return;
		try {
			const res = await fetch('/api/voice/speech', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, voice: 'alloy' }),
			});
			if (!res.ok) return;
			const data = await res.json() as { audio?: { base64: string; mimeType: string } };
			if (data.audio) enqueueAudio(data.audio);
		} catch {
			// Silent fail
		}
	};

	// Stop audio playback when user starts speaking (interruption)
	useEffect(() => {
		if (isListening) clearAudioQueue();
	}, [isListening, clearAudioQueue]);

	const formatFileSize = useCallback((size: number) => {
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}, []);

	const handleOpenAttachmentPicker = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleRemoveAttachment = useCallback((id: string) => {
		setAttachments((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const handleAttachmentChange: ChangeEventHandler<HTMLInputElement> = useCallback(
		async (event) => {
			const files = Array.from(event.target.files || []);
			event.target.value = '';
			if (files.length === 0) return;

			const remainingSlots = MAX_ATTACHMENTS - attachments.length;
			if (remainingSlots <= 0) {
				toast({ type: 'error', message: `You can only attach ${MAX_ATTACHMENTS} files.` });
				return;
			}

			const accepted = files.slice(0, remainingSlots);
			const rejected = files.slice(remainingSlots);
			if (rejected.length > 0) {
				toast({ type: 'error', message: `Only ${MAX_ATTACHMENTS} files can be attached at once.` });
			}

			const invalidFiles: string[] = [];
			const oversizedFiles: string[] = [];

			const readFile = (file: File) =>
				new Promise<AttachmentItem>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => {
						const result = typeof reader.result === 'string' ? reader.result : '';
						const base64 = result.includes(',') ? result.split(',')[1] || '' : '';
						resolve({
							id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
							filename: file.name,
							mime: file.type || 'text/plain',
							size: file.size,
							content: base64,
						});
					};
					reader.onerror = () => reject(new Error('Failed to read file'));
					reader.readAsDataURL(file);
				});

			const newItems: AttachmentItem[] = [];
			for (const file of accepted) {
				const ext = file.name.split('.').pop()?.toLowerCase() || '';
				if (!ALLOWED_EXTENSIONS.has(ext)) {
					invalidFiles.push(file.name);
					continue;
				}
				if (file.size > MAX_ATTACHMENT_SIZE) {
					oversizedFiles.push(file.name);
					continue;
				}
				try {
					const item = await readFile(file);
					newItems.push(item);
				} catch {
					invalidFiles.push(file.name);
				}
			}

			if (invalidFiles.length > 0) {
				toast({
					type: 'error',
					message: `Unsupported file types: ${invalidFiles.slice(0, 3).join(', ')}`,
				});
			}

			if (oversizedFiles.length > 0) {
				toast({
					type: 'error',
					message: `Files over 10MB: ${oversizedFiles.slice(0, 3).join(', ')}`,
				});
			}

			if (newItems.length > 0) {
				setAttachments((prev) => [...prev, ...newItems]);
			}
		},
		[attachments.length, toast],
	);
	const {
		tabs,
		activeId,
		activeTab,
		setActiveId,
		openFile,
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
	useEffect(() => {
		if (!sessionId) return;
		setAttachments([]);
	}, [sessionId]);


	const activeFilePath = activeTab?.filePath ?? null;
	const isBusy = sessionStatus.type === 'busy';
	const displayMessages = session.status === 'terminated' ? archivedMessages : messages;
	const sshCommand = session.sandboxId ? `agentuity cloud ssh ${session.sandboxId}` : '';
	const getDisplayParts = useCallback(
		(messageID: string) => {
			if (session.status === 'terminated') {
				return archivedParts.get(messageID) ?? [];
			}
			return getPartsForMessage(messageID);
		},
		[archivedParts, getPartsForMessage, session.status],
	);
	const { branch: gitBranch, changedCount: gitChangedCount, refresh: refreshGitStatus } = useGitStatus(activeSessionId, githubAvailable);

	useEffect(() => {
		if (!isEditingTitle) {
			setEditTitle(session.title || '');
		}
	}, [isEditingTitle, session.title]);

	const promptPlaceholder = session.status === 'active'
		? 'Message the agent...'
		: session.status === 'terminated'
			? 'This session is read-only.'
			: session.status === 'error'
				? 'Session failed to start.'
				: 'Waiting for sandbox to be ready...';
	const attachmentAccept = Array.from(ALLOWED_EXTENSIONS)
		.map((ext) => `.${ext}`)
		.join(',');
	const attachmentDisabled = session.status !== 'active' || attachments.length >= MAX_ATTACHMENTS;

	const sendMessage = useCallback(
		async (payload: QueuedMessage) => {
			setIsSending(true);
			try {
				if (payload.command && payload.attachments && payload.attachments.length > 0) {
					throw new Error('Attachments are not supported for commands.');
				}
				const res = await fetch(`/api/sessions/${sessionId}/messages`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: payload.text,
					model: payload.model,
					command: payload.command,
					attachments: payload.attachments?.map(({ filename, mime, content }) => ({
						filename,
						mime,
						content,
					})),
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
		},
		[sessionId, toast],
	);

	const handleSend = async (text: string) => {
		if (!text.trim() && attachments.length === 0) return;
		if (selectedCommand && attachments.length > 0) {
			toast({ type: 'error', message: 'Attachments are not supported with commands.' });
			return;
		}
		const commentsBlock = formatForPrompt();
		const baseText = text.trim() || (attachments.length > 0 ? 'Attached files.' : '');
		const fullMessage = commentsBlock
			? `${baseText}\n\n---\nCode Comments:\n${commentsBlock}`
			: baseText;
		const nextAttachments = attachments;
		const payload: QueuedMessage = {
			text: fullMessage,
			model: selectedModel,
			command: selectedCommand || undefined,
			attachments: nextAttachments,
		};

		setInputText('');
		setAttachments([]);
		if (commentCount > 0) {
			clearComments();
		}

		if (isBusy || isSending) {
			setMessageQueue((prev) => [...prev, payload]);
			return;
		}

		await sendMessage(payload);
	};

	useEffect(() => {
		if (isBusy || isSending || messageQueue.length === 0) return;
		const [next, ...rest] = messageQueue;
		if (!next) return;
		setMessageQueue(rest);
		void sendMessage(next);
	}, [isBusy, isSending, messageQueue, sendMessage]);



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

	const handleCopyShareLink = async () => {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setShareCopied(true);
			setTimeout(() => setShareCopied(false), 2000);
		} catch {
			toast({ type: 'error', message: 'Failed to copy link' });
		}
	};

	const saveTitle = async () => {
		const trimmed = editTitle.trim();
		if (!trimmed || trimmed === session.title) return;
		try {
			await fetch(`/api/sessions/${sessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: trimmed }),
			});
			setSession((prev) => ({ ...prev, title: trimmed }));
		} catch {
			// silent
		}
	};

	const handleCopySshCommand = useCallback(async () => {
		if (!sshCommand) return;
		try {
			await navigator.clipboard.writeText(sshCommand);
			setSshCopied(true);
			setTimeout(() => setSshCopied(false), 2000);
		} catch {
			toast({ type: 'error', message: 'Failed to copy SSH command' });
		}
	}, [sshCommand, toast]);

	const handleCopySandboxId = useCallback(async () => {
		if (!session.sandboxId) return;
		try {
			await navigator.clipboard.writeText(session.sandboxId);
			setSandboxCopied(true);
			setTimeout(() => setSandboxCopied(false), 2000);
		} catch {
			toast({ type: 'error', message: 'Failed to copy sandbox ID' });
		}
	}, [session.sandboxId, toast]);

  // Abort
  const handleAbort = async () => {
    try {
      await fetch(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
    } catch {
      // Ignore abort errors
    }
  };

	const lastAssistantMessage = useMemo(
		() => [...displayMessages].reverse().find((message) => message.role === 'assistant'),
		[displayMessages]
	);
	const lastAssistantParts = lastAssistantMessage
		? getDisplayParts(lastAssistantMessage.id)
		: [];
	const hasStreamingContent = lastAssistantParts.length > 0;
	const isStreaming = isBusy;
	const submitDisabled =
		session.status !== 'active'
		|| isSending
		|| (!inputText.trim() && attachments.length === 0);

	// Narrator: on busy→idle transition, speak the assistant's response
	const wasBusyRef = useRef(false);
	const lastNarratedMessageIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!narratorEnabled) {
			wasBusyRef.current = isBusy;
			return;
		}

		// Detect busy → idle transition
		if (wasBusyRef.current && !isBusy) {
			const lastAssistant = displayMessages.length > 0
				? [...displayMessages].reverse().find(m => m.role === 'assistant')
				: null;

			if (lastAssistant && lastAssistant.id !== lastNarratedMessageIdRef.current) {
				lastNarratedMessageIdRef.current = lastAssistant.id;

				const parts = getDisplayParts(lastAssistant.id);
				const textContent = parts
					.filter(p => p.type === 'text')
					.map(p => (p as { text: string }).text || '')
					.join('\n')
					.replace(/```[\s\S]*?```/g, '')
					.replace(/\*\*([^*]+)\*\*/g, '$1')
					.replace(/`([^`]+)`/g, '$1')
					.replace(/#{1,6}\s/g, '')
					.replace(/\n{2,}/g, '. ')
					.replace(/\s{2,}/g, ' ')
					.trim();

				if (!textContent) {
					wasBusyRef.current = isBusy;
					return;
				}

				if (textContent.length < 200) {
					void speakTextRef.current?.(textContent);
				} else {
					const recentChat = displayMessages.slice(-6).map(m => {
						const msgParts = getDisplayParts(m.id);
						const msgText = msgParts
							.filter(p => p.type === 'text')
							.map(p => (p as { text: string }).text || '')
							.join('\n')
							.replace(/```[\s\S]*?```/g, '')
							.trim()
							.slice(0, 500);
						return { role: m.role, text: msgText };
					}).filter(m => m.text.length > 0);

					fetch('/api/voice/condense', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							text: textContent.slice(0, 5000),
							conversationHistory: recentChat,
						}),
					})
						.then(res => res.json())
						.then((data: { text?: string }) => {
							if (data.text) void speakTextRef.current?.(data.text);
						})
						.catch(() => {
							void speakTextRef.current?.(textContent.slice(0, 600));
						});
				}
			}
		}

		wasBusyRef.current = isBusy;
	}, [narratorEnabled, isBusy, displayMessages, getDisplayParts]);

	// Clear audio on session change
	useEffect(() => {
		if (sessionId) {
			clearAudioQueue();
			lastNarratedMessageIdRef.current = null;
		}
	}, [sessionId, clearAudioQueue]);

	const copyMessage = useCallback(
		(message: ChatMessage) => {
			const parts = getDisplayParts(message.id);
			const text = parts
				.filter((part) => part.type === 'text')
				.map((part) => (part as { text: string }).text)
				.join('');
			if (text.trim().length === 0) return;
			if (navigator?.clipboard?.writeText) {
				void navigator.clipboard.writeText(text);
			}
		},
		[getDisplayParts]
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

		for (const message of displayMessages) {
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
	}, [displayMessages]);

	const queuedCount = messageQueue.length;

	const getSourcesForToolPart = useCallback((part: ToolPart): SourceItem[] => {
		const sources: SourceItem[] = [];
		const seen = new Set<string>();

		const addSource = (item: SourceItem) => {
			const key = `${item.type}:${item.label}`;
			if (seen.has(key)) return;
			seen.add(key);
			sources.push(item);
		};

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

	type ChainGroup = { type: 'chain'; filePath: string; parts: ToolPart[] };
	type CurrentChain = {
		filePath: string;
		parts: ToolPart[];
		startsWithRead: boolean;
		hasWriteOrEdit: boolean;
	};

	const extractFilePath = useCallback((part: ToolPart): string | null => {
		const input = part.state?.input;
		if (!input) return null;
		try {
			const parsed = typeof input === 'string' ? JSON.parse(input) : input;
			const candidate = parsed as { filePath?: string; path?: string; file?: string };
			return candidate.filePath || candidate.path || candidate.file || null;
		} catch {
			return null;
		}
	}, []);

	const isReadTool = useCallback((part: ToolPart): boolean => {
		const input = part.state?.input;
		if (!input || typeof input !== 'object') return false;
		return (
			typeof (input as { filePath?: unknown }).filePath === 'string'
			&& typeof (input as { content?: unknown }).content !== 'string'
			&& typeof (input as { oldString?: unknown }).oldString !== 'string'
			&& typeof (input as { command?: unknown }).command !== 'string'
		);
	}, []);

	const isWriteOrEditTool = useCallback((part: ToolPart): boolean => {
		const input = part.state?.input;
		if (!input || typeof input !== 'object') return false;
		const hasEdit =
			typeof (input as { oldString?: unknown }).oldString === 'string'
			&& typeof (input as { newString?: unknown }).newString === 'string';
		const hasWrite = typeof (input as { content?: unknown }).content === 'string';
		return hasEdit || hasWrite;
	}, []);

	const groupPartsIntoChains = (parts: Part[]): (Part | ChainGroup)[] => {
		const groups: (Part | ChainGroup)[] = [];
		let currentChain: CurrentChain | null = null;

		const flushChain = () => {
			if (!currentChain) return;
			const shouldChain =
				currentChain.parts.length > 1
				&& currentChain.startsWithRead
				&& currentChain.hasWriteOrEdit;
			if (shouldChain) {
				groups.push({
					type: 'chain',
					filePath: currentChain.filePath,
					parts: currentChain.parts,
				});
			} else {
				groups.push(...currentChain.parts);
			}
			currentChain = null;
		};

		for (const part of parts) {
			if (part.type === 'tool') {
				const filePath = extractFilePath(part);
				if (filePath) {
					if (currentChain && currentChain.filePath === filePath) {
						currentChain.parts.push(part);
						if (isWriteOrEditTool(part)) currentChain.hasWriteOrEdit = true;
					} else {
						flushChain();
						currentChain = {
							filePath,
							parts: [part],
							startsWithRead: isReadTool(part),
							hasWriteOrEdit: isWriteOrEditTool(part),
						};
					}
					continue;
				}
			}
			flushChain();
			groups.push(part);
		}

		flushChain();
		return groups;
	};



	const renderPart = (part: Part, message: ChatMessage) => {
		switch (part.type) {
		case 'text':
			return (
				<MessageResponse key={part.id}>
					<TextPartView part={part} isStreaming={isStreaming && message.id === lastAssistantMessage?.id} />
				</MessageResponse>
			);
			case 'reasoning':
				return renderReasoning(part, message);
		case 'tool':
			return (
				<ToolCallCard
					key={part.id}
					part={part}
					onAddComment={addComment}
					getDiffAnnotations={getDiffAnnotations}
					getFileComments={getFileComments}
					sources={message.role === 'assistant' ? getSourcesForToolPart(part) : []}
				/>
			);
			case 'file':
				return <FilePartView key={part.id} part={part} />;
			case 'subtask':
				return <SubtaskView key={part.id} part={part} />;
			case 'agent':
				return <AgentDisplay key={part.id} name={part.name} />;
			case 'step-finish':
				return null;
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
			{session.status !== 'active' && (
				<div
					className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
						session.status === 'error'
							? 'border-red-500/30 bg-red-500/10 text-red-400'
							: session.status === 'terminated'
								? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
								: 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
					}`}
				>
					<div className="flex items-center justify-between gap-3">
						<span>
							{session.status === 'creating' && (statusElapsedMs > 20000
								? '🔄 Almost ready...'
								: statusElapsedMs > 10000
									? '🔄 Setting up AI agent...'
									: '🔄 Creating sandbox environment...')}
							{session.status === 'error' && '❌ Failed to create sandbox.'}
							{session.status === 'terminated' && "This session's sandbox has been terminated. Chat history is read-only."}
						</span>
						{session.status === 'error' && (
							<Button size="sm" onClick={handleRetry} disabled={isRetrying}>
								{isRetrying ? (
									<>
										<Loader2 className="mr-1 h-3 w-3 animate-spin" />
										Retrying...
									</>
								) : (
									'Retry'
								)}
							</Button>
						)}
					</div>
					{session.status === 'terminated' && (archiveError || isLoadingArchive) && (
						<p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
							{isLoadingArchive ? 'Loading chat history...' : archiveError}
						</p>
					)}
				</div>
			)}
			{displayMessages.length === 0 && !isBusy ? (
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
							{session.status === 'terminated' ? (
								<p className="text-sm text-[var(--muted-foreground)]">
									No messages available for this session.
								</p>
							) : (
								<>
									<p className="text-sm text-[var(--muted-foreground)]">
										Start a conversation...
									</p>
									<p className="mt-1 text-xs text-[var(--muted-foreground)]">
										Press Enter to send, Shift+Enter for newline
									</p>
								</>
							)}
						</div>
					)}
				</ConversationEmptyState>
			) : (
				displayMessages.map((message) => {
					const parts = getDisplayParts(message.id);
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
							{groupPartsIntoChains(parts).map((part) => {
								if (part.type === 'chain') {
									return (
										<ChainOfThought
											key={`chain-${part.filePath}-${part.parts[0]?.id ?? 'start'}`}
											filePath={part.filePath}
											stepCount={part.parts.length}
										>
											{part.parts.map((chainPart) => renderPart(chainPart, message))}
										</ChainOfThought>
									);
								}
								return renderPart(part, message);
							})}
								{errorInfo && (
									<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
										Error: {errorInfo.message || errorInfo.type || 'Unknown error'}
									</div>
								)}
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

	const attachmentInput = (
		<input
			ref={fileInputRef}
			type="file"
			accept={attachmentAccept}
			multiple
			onChange={handleAttachmentChange}
			className="hidden"
		/>
	);

	const inputArea = (
		<div className="relative z-40 shrink-0 border-t border-[var(--border)] bg-[var(--background)] p-4">
			{messageQueue.length > 0 && (
				<div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-2 space-y-1 mb-2">
					<span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">
						Queued ({messageQueue.length})
					</span>
					{messageQueue.map((msg, i) => (
						<div key={`${msg.text}-${i}`} className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
							<Circle className="h-2 w-2 shrink-0" />
							<span className="truncate">{msg.text.slice(0, 60)}...</span>
						</div>
					))}
				</div>
			)}
			<PromptInputProvider>
				<PromptInput onSubmit={({ text }) => handleSend(text)}>
					<PromptInputTextarea
						value={inputText}
						onChange={(event) => setInputText(event.target.value)}
						placeholder={promptPlaceholder}
						disabled={session.status !== 'active'}
					/>
					{attachments.length > 0 && (
						<div className="flex flex-wrap gap-2 px-3 pb-2">
							{attachments.map((attachment) => (
								<div
									key={attachment.id}
									className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[10px] text-[var(--foreground)]"
								>
									<span className="max-w-[140px] truncate" title={attachment.filename}>
										{attachment.filename}
									</span>
									<span className="text-[10px] text-[var(--muted-foreground)]">
										{formatFileSize(attachment.size)}
									</span>
									<button
										type="button"
										className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
										onClick={() => handleRemoveAttachment(attachment.id)}
										title="Remove attachment"
									>
										<X className="h-3 w-3" />
									</button>
								</div>
							))}
						</div>
					)}
					<PromptInputFooter>
					<div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
						<CommandPicker value={selectedCommand} onChange={setSelectedCommand} />
						<ModelSelector value={selectedModel} onChange={setSelectedModel} />
						<span className="hidden md:inline">Enter to send · Shift+Enter for new line</span>
							{commentCount > 0 && (
								<Badge variant="secondary" className="text-[10px]">
									{commentCount} comment{commentCount > 1 ? 's' : ''}
								</Badge>
							)}
							{queuedCount > 0 && (
								<Badge variant="secondary" className="text-[10px] gap-1">
									<ListOrdered className="h-2.5 w-2.5" />
									Queued {queuedCount}
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
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="icon"
								type="button"
								onClick={handleOpenAttachmentPicker}
								disabled={attachmentDisabled}
								className="h-9 w-9"
								aria-label="Attach files"
								title="Attach files"
							>
								<Paperclip className="h-4 w-4" />
							</Button>
							{session.status === 'active' && (
								<Button
									variant="ghost"
									size="icon"
									type="button"
									onClick={() => setNarratorEnabled(prev => !prev)}
									className={cn("h-9 w-9", narratorEnabled && "text-[var(--primary)]")}
									aria-label={narratorEnabled ? 'Disable voice narrator' : 'Enable voice narrator'}
									title={narratorEnabled ? 'Voice narrator on' : 'Voice narrator off'}
								>
									<span className={cn(
										"block h-2.5 w-2.5 rounded-full border-2 transition-colors",
										narratorEnabled
											? "border-[var(--primary)] bg-[var(--primary)]"
											: "border-[var(--muted-foreground)] bg-transparent"
									)} />
								</Button>
							)}
							{session.status === 'active' && (
								<MicButton
									isListening={isListening}
									isProcessing={isProcessing}
									isSupported={voiceSupported}
									onClick={toggleListening}
								/>
							)}
							<PromptInputSubmit
								disabled={submitDisabled}
								status={isBusy ? 'streaming' : 'ready'}
								onStop={handleAbort}
							/>
						</div>
					</PromptInputFooter>
				</PromptInput>
			</PromptInputProvider>
		</div>
	);

  return (
		<div className="flex h-full flex-col">
			{attachmentInput}
      {/* Header */}
		<div className="flex items-center border-b border-[var(--border)] px-4 py-2">
			<div className="flex min-w-0 items-center gap-2">
				{isEditingTitle ? (
					<input
						type="text"
						value={editTitle}
						onChange={(event) => setEditTitle(event.target.value)}
						onBlur={() => {
							void saveTitle();
							setIsEditingTitle(false);
						}}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								void saveTitle();
								setIsEditingTitle(false);
							}
							if (event.key === 'Escape') {
								setEditTitle(session.title || '');
								setIsEditingTitle(false);
							}
						}}
						maxLength={100}
						className="max-w-[140px] md:max-w-[200px] border-b border-[var(--border)] bg-transparent text-sm font-semibold text-[var(--foreground)] outline-none"
					/>
				) : (
					<h2 className="max-w-[140px] md:max-w-[200px] text-sm font-semibold text-[var(--foreground)]">
						<button
							type="button"
							className="w-full truncate text-left hover:text-[var(--primary)]"
							onClick={() => {
								setEditTitle(session.title || '');
								setIsEditingTitle(true);
							}}
							title="Click to edit"
						>
							{session.title || 'Untitled Session'}
						</button>
					</h2>
				)}
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
				{shareUrl ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={handleCopyShareLink}
						className="h-7 w-7 p-0"
						title={shareCopied ? 'Copied!' : 'Copy link'}
					>
						{shareCopied ? (
							<Check className="h-3.5 w-3.5 text-green-500" />
						) : (
							<ExternalLink className="h-3.5 w-3.5" />
						)}
					</Button>
				) : (
					session.status === 'active' && (
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
								<ExternalLink className="h-3.5 w-3.5" />
							)}
						</Button>
					)
				)}
				<div className="hidden md:block">
					{sessionUsage.totalTokens > 0 && (
						<ContextIndicator
							tokens={sessionUsage.tokens}
							cost={sessionUsage.cost}
							modelID={sessionUsage.modelID}
							providerID={sessionUsage.providerID}
						/>
					)}
				</div>
				<div className="hidden md:block">
					{queuedCount > 0 && (
						<Badge variant="secondary" className="text-[10px] gap-1">
							<ListOrdered className="h-2.5 w-2.5" />
							Queue {queuedCount}
						</Badge>
					)}
				</div>
          {sessionStatus.type === 'retry' && (
            <Badge variant="destructive" className="text-[10px]">
              Retrying ({sessionStatus.attempt})
            </Badge>
          )}
			</div>
			<div className="ml-auto flex items-center gap-2">
				{/* SSH info popover */}
				{session.sandboxId && (
					<Popover>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
							<Terminal className="h-3.5 w-3.5" />
							<span className="hidden md:inline">SSH</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						side="bottom"
						className="w-[calc(100vw-2rem)] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] md:w-80"
					>
						<div className="space-y-3">
							<div className="flex items-center gap-2 text-xs">
								<span
									className={`h-2 w-2 rounded-full ${
										session.status === 'terminated' ? 'bg-gray-500' : 'bg-green-500'
									}`}
								/>
								<span className="text-[var(--muted-foreground)]">
									{session.status === 'terminated' ? 'Terminated' : 'Active'}
								</span>
							</div>
						<div>
							<p className="text-xs text-[var(--muted-foreground)] mb-1">Sandbox ID</p>
							<div className="flex items-center gap-2">
								<code className="text-xs bg-[var(--muted)] px-2 py-1 rounded flex-1 block truncate">
									{session.sandboxId}
								</code>
								<button
									type="button"
									onClick={handleCopySandboxId}
									className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
									title="Copy sandbox ID"
								>
									{sandboxCopied ? (
										<Check className="h-3.5 w-3.5 text-green-500" />
									) : (
										<Copy className="h-3.5 w-3.5" />
									)}
								</button>
							</div>
						</div>
							<div>
								<p className="text-xs text-[var(--muted-foreground)] mb-1">SSH Command</p>
								<div className="flex items-center gap-2">
									<code className="text-xs bg-[var(--muted)] px-2 py-1 rounded flex-1 block truncate">
										{sshCommand}
									</code>
									<button
										type="button"
										onClick={handleCopySshCommand}
										className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
										title="Copy SSH command"
									>
										{sshCopied ? (
											<Check className="h-3.5 w-3.5 text-green-500" />
										) : (
											<Copy className="h-3.5 w-3.5" />
										)}
									</button>
								</div>
							</div>
						</div>
					</PopoverContent>
					</Popover>
				)}
	
			{/* Git badge */}
			{githubAvailable && gitBranch && (
				<div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
					<GitBranch className="h-3 w-3" />
					<span className="font-mono max-w-[120px] truncate text-[var(--foreground)]">
						{gitBranch}
					</span>
					{gitChangedCount > 0 && (
						<span className="text-[10px] rounded px-1 bg-[var(--muted)] text-[var(--primary)]">
							{gitChangedCount}
						</span>
					)}
				</div>
			)}
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
				{/* View mode toggle */}
				<div className="flex items-center rounded-md bg-[var(--muted)] p-0.5">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setUrlState({ v: 'chat' })}
						className={`h-7 px-2 text-xs ${viewMode === 'chat' ? 'bg-[var(--background)] shadow-sm' : ''}`}
					>
						Chat
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setUrlState({ v: 'ide' })}
						className={`h-7 px-2 text-xs ${viewMode === 'ide' ? 'bg-[var(--background)] shadow-sm' : ''}`}
					>
						IDE
					</Button>
				</div>
				<div
					className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
					title={isConnected ? 'Connected' : 'Disconnected'}
				/>
			</div>
		</div>

		{/* Body */}
		{viewMode === 'ide' ? (
			<div className="flex flex-1 min-w-0 flex-col overflow-hidden">
				<div className="flex-1 min-w-0 overflow-hidden">
					<IDELayout
				sidebar={
					<div className="flex h-full flex-col">
						{githubAvailable ? (
							<div className="flex border-b border-[var(--border)] shrink-0">
								<button
									className={cn(
										"flex-1 px-3 py-2 text-xs font-medium transition-colors",
										sidebarTab === 'files'
											? 'text-[var(--foreground)] border-b-2 border-[var(--primary)]'
											: 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
									)}
									onClick={() => setUrlState({ tab: 'files' })}
									type="button"
								>
									Files
								</button>
								<button
									className={cn(
										"flex-1 px-3 py-2 text-xs font-medium transition-colors",
										sidebarTab === 'git'
											? 'text-[var(--foreground)] border-b-2 border-[var(--primary)]'
											: 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
									)}
									onClick={() => setUrlState({ tab: 'git' })}
									type="button"
								>
									<span>Git</span>
									{gitChangedCount > 0 && (
										<span className="ml-1 rounded px-1 text-[10px] bg-[var(--muted)] text-[var(--primary)]">
											{gitChangedCount}
										</span>
									)}
								</button>
							</div>
						) : (
							<div className="flex border-b border-[var(--border)] shrink-0">
								<span className="flex-1 px-3 py-2 text-xs font-medium text-[var(--foreground)] border-b-2 border-[var(--primary)]">
									Files
								</span>
							</div>
						)}
						<div className="flex-1 overflow-y-auto">
							{githubAvailable && sidebarTab === 'git' ? (
							<GitPanel
								sessionId={sessionId}
								metadata={session.metadata ?? undefined}
								onOpenDiff={(path, oldContent, newContent) =>
									openDiff(path, oldContent, newContent)
								}
								onBranchChange={refreshGitStatus}
							/>
							) : (
					<FileExplorer
						sessionId={sessionId}
						onOpenFile={openFile}
						onOpenDiff={(path) => openDiff(path, '', '')}
						activeFilePath={activeFilePath}
					/>
						)}
						</div>
					</div>
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
							/>
						}
					/>
				</div>
				{/* Minimal input bar for IDE mode */}
				<div className="relative z-40 border-t border-[var(--border)] px-3 py-2">
					<PromptInputProvider>
						<PromptInput onSubmit={({ text }) => handleSend(text)}>
							{attachments.length > 0 && (
								<div className="flex flex-wrap gap-2 px-3 pb-2">
									{attachments.map((attachment) => (
										<div
											key={attachment.id}
											className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[10px] text-[var(--foreground)]"
										>
											<span className="max-w-[140px] truncate" title={attachment.filename}>
												{attachment.filename}
											</span>
											<span className="text-[10px] text-[var(--muted-foreground)]">
												{formatFileSize(attachment.size)}
											</span>
											<button
												type="button"
												className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
												onClick={() => handleRemoveAttachment(attachment.id)}
												title="Remove attachment"
											>
												<X className="h-3 w-3" />
											</button>
										</div>
									))}
								</div>
							)}
							{messageQueue.length > 0 && (
								<div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-2 space-y-1 mb-2">
									<span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">
										Queued ({messageQueue.length})
									</span>
									{messageQueue.map((msg, i) => (
										<div key={`${msg.text}-${i}`} className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
											<Circle className="h-2 w-2 shrink-0" />
											<span className="truncate">{msg.text.slice(0, 60)}...</span>
										</div>
									))}
								</div>
							)}
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
								<Button
									variant="ghost"
									size="icon"
									type="button"
									onClick={handleOpenAttachmentPicker}
									disabled={attachmentDisabled}
									className="h-9 w-9"
									aria-label="Attach files"
									title="Attach files"
								>
									<Paperclip className="h-4 w-4" />
								</Button>
								{session.status === 'active' && (
									<Button
										variant="ghost"
										size="icon"
										type="button"
										onClick={() => setNarratorEnabled(prev => !prev)}
										className={cn("h-9 w-9", narratorEnabled && "text-[var(--primary)]")}
										aria-label={narratorEnabled ? 'Disable voice narrator' : 'Enable voice narrator'}
										title={narratorEnabled ? 'Voice narrator on' : 'Voice narrator off'}
									>
										<span className={cn(
											"block h-2.5 w-2.5 rounded-full border-2 transition-colors",
											narratorEnabled
												? "border-[var(--primary)] bg-[var(--primary)]"
												: "border-[var(--muted-foreground)] bg-transparent"
										)} />
									</Button>
								)}
								{session.status === 'active' && (
									<MicButton
										isListening={isListening}
										isProcessing={isProcessing}
										isSupported={voiceSupported}
										onClick={toggleListening}
									/>
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
<div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
				{conversationView}

					{/* Todo sidebar */}
					{showTodos && todos.length > 0 && (
						<div className="w-48 md:w-64 shrink-0 border-l border-[var(--border)] bg-[var(--card)] h-full">
							<div className="p-2">
								<Plan
									title="Plan"
									items={todos.map((todo) => ({
										text: todo.content,
										status:
											todo.status === 'completed'
												? 'done'
												: todo.status === 'in_progress'
													? 'in-progress'
													: 'pending',
									}))}
								/>
							</div>
						</div>
					)}
				</div>
				{inputArea}
			</>
		)}

		</div>
	);
}
