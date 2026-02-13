import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEventHandler } from 'react';
import {
	Check,
	Clock,
	Code2,
	Copy,
	GitBranch,
	GitFork,
	Camera,
	Circle,
	ListOrdered,
	ListTodo,
	Loader2,
	MessageSquare,
	Paperclip,
	ExternalLink,
	RotateCcw,
	Terminal,

	WifiOff,
	X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { FileExplorer } from '../chat/FileExplorer';
import type { FileTreeNode } from '../ai-elements/file-tree';
import { CommandPicker } from '../chat/AgentSelector';
import { ModelSelector } from '../chat/ModelSelector';
import { GitPanel, useGitStatus } from '../chat/GitPanel';
import type {
	Message as ChatMessage,
	Part,
	ReasoningPart,
	ToolPart,
} from '../../types/opencode';
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
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { useNarratorMode } from '../../hooks/useNarratorMode';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import { VoiceControls } from '../ui/VoiceControls';
import { cn } from '../../lib/utils';
import { apiFetch } from '../../lib/api';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { z } from 'zod';
import { sessionSearchSchema } from '../../router';
import { useAnalytics } from '@agentuity/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useKeybindings } from '../../hooks/useKeybindings';

interface ChatPageProps {
  sessionId: string;
  session: {
    title: string | null;
    status: string;
    agent: string | null;
    model: string | null;
    sandboxId: string | null;
    sandboxUrl: string | null;
    createdAt: string;
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

type SessionSearch = z.infer<typeof sessionSearchSchema>;

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
  const { track } = useAnalytics();
  const [statusStartedAt, setStatusStartedAt] = useState(() => {
    // Use the session's creation timestamp so revisiting a creating session
    // shows the actual elapsed time instead of restarting from zero.
    const created = Date.parse(initialSession.createdAt);
    return Number.isFinite(created) ? created : Date.now();
  });
  const [statusElapsedMs, setStatusElapsedMs] = useState(() => {
    const created = Date.parse(initialSession.createdAt);
    return Number.isFinite(created) ? Math.max(0, Date.now() - created) : 0;
  });
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
    // Use session createdAt so navigating away and back doesn't reset the timer.
    const created = Date.parse(session.createdAt ?? '');
    const start = Number.isFinite(created) ? created : Date.now();
    setStatusStartedAt(start);
    setStatusElapsedMs(Math.max(0, Date.now() - start));
  }, [session.status, sessionId, session.createdAt]);

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

    const controller = new AbortController();
    let aborted = false;

    const poll = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}`, { signal: controller.signal });
        const data = await res.json();
        if (data.status === 'active' && !aborted) {
          setSession((prev) => ({
            ...prev,
            status: 'active',
            sandboxId: data.sandboxId ?? prev.sandboxId,
            sandboxUrl: data.sandboxUrl ?? prev.sandboxUrl,
          }));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Ignore — will retry on next interval
      }
    }, 3000);

    return () => {
      aborted = true;
      controller.abort();
      clearInterval(poll);
    };
  }, [session.status, sessionId]);

  useEffect(() => {
    if (session.status !== 'terminated') {
      setArchivedMessages([]);
      setArchivedParts(new Map());
      setArchiveError(null);
      setIsLoadingArchive(false);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;
    setIsLoadingArchive(true);
    setArchiveError(null);

    apiFetch(`/api/sessions/${sessionId}/messages`, { signal: controller.signal })
      .then((res) => res.json())
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
      .catch((err) => {
        if (!isMounted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setArchiveError('Unable to load chat history');
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingArchive(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
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
		revertState,
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
  // Only initialize from session.agent if it's a real agent (not a template command).
  // Template commands (memory-save, cadence, etc.) are one-shot and shouldn't persist.
  // DB stores without '/' prefix, picker uses with '/' — normalize on load.
  const [selectedCommand, setSelectedCommand] = useState(() => {
    const agent = session.agent || '';
    const templateCommands = new Set(['agentuity-cadence', 'agentuity-memory-save', 'agentuity-memory-share', 'agentuity-cloud', 'agentuity-sandbox']);
    if (!agent || templateCommands.has(agent)) return '';
    return agent.startsWith('/') ? agent : `/${agent}`;
  });
  const [hasManuallySelectedCommand, setHasManuallySelectedCommand] = useState(false);
  const [selectedModel, setSelectedModel] = useState(session.model || 'anthropic/claude-sonnet-4-5');
	const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
	const [showTodos, setShowTodos] = useState(false);
	const [showChanges, setShowChanges] = useState(false);
	const [isForking, setIsForking] = useState(false);
	const [isSharing, setIsSharing] = useState(false);
	const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
	const [snapshotName, setSnapshotName] = useState('');
	const [snapshotDescription, setSnapshotDescription] = useState('');
	const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [shareCopied, setShareCopied] = useState(false);
	const { v: viewMode, tab: sidebarTab } = useSearch({ from: '/session/$sessionId' });
	const navigate = useNavigate({ from: '/session/$sessionId' });
	const [sshCopied, setSshCopied] = useState(false);
	const [sandboxCopied, setSandboxCopied] = useState(false);
	const [attachCopied, setAttachCopied] = useState(false);
	const [passwordCopied, setPasswordCopied] = useState(false);
	const [opencodePassword, setOpencodePassword] = useState<string | null>(null);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editTitle, setEditTitle] = useState(session.title || '');
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const passwordFetchController = useRef<AbortController | null>(null);

	useEffect(() => () => {
		passwordFetchController.current?.abort();
	}, []);

	const handleModelChange = useCallback((model: string) => {
		setSelectedModel(model);
		track('model_changed', { model });
	}, [track]);

	const handleViewModeChange = useCallback((mode: 'chat' | 'ide') => {
		navigate({ search: (prev: SessionSearch) => ({ ...prev, v: mode }) });
		track('view_mode_changed', { mode });
	}, [navigate, track]);

	const focusChatInput = useCallback(() => {
		const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-prompt-input="true"]');
		if (!textarea) return false;
		textarea.focus();
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
		return true;
	}, []);

	const { enqueue: enqueueAudio, clearQueue: clearAudioQueue, isSpeaking } = useAudioPlayback();

	const handleSendRef = useRef<(text: string) => Promise<void>>(undefined);

	const handleNarratorAutoSend = useCallback((text: string) => {
		void handleSendRef.current?.(text);
	}, []);

	const handleNarratorCancel = useCallback(() => {
		toast({ type: 'info', message: 'Cancelled' });
	}, [toast]);

	const handleDictation = useCallback((text: string) => {
		setInputText((prev) => (prev ? `${prev} ${text}` : text));
	}, []);

	const {
		narratorEnabled,
		toggleNarrator,
		isListening,
		isProcessing,
		isSupported: voiceSupported,
		toggleMic,
		accumulatedText,
		interimText,
		cancelCountdown,
		isCountingDown,
		countdownProgress,
		voiceError,
	} = useNarratorMode({
		onAutoSend: handleNarratorAutoSend,
		onCancel: handleNarratorCancel,
		onDictation: handleDictation,
		isSpeaking,
	});

	useEffect(() => {
		if (voiceError) {
			toast({ type: 'error', message: voiceError });
		}
	}, [voiceError, toast]);

	const handleNarratorToggle = useCallback(() => {
		const nextEnabled = !narratorEnabled;
		toggleNarrator();
		track('narrator_toggled', { enabled: nextEnabled });
	}, [narratorEnabled, toggleNarrator, track]);

	const handleMicToggle = useCallback(() => {
		const nextEnabled = !isListening;
		toggleMic();
		track('voice_input_toggled', { enabled: nextEnabled });
	}, [isListening, toggleMic, track]);

	// Stop audio playback when user starts speaking (interruption)
	useEffect(() => {
		if (isListening) clearAudioQueue();
	}, [isListening, clearAudioQueue]);

	// Sync narrator accumulated text into the input field
	useEffect(() => {
		if (!narratorEnabled) return;
		const display = interimText
			? `${accumulatedText} ${interimText}`.trim()
			: accumulatedText;
		setInputText(display);
	}, [narratorEnabled, accumulatedText, interimText]);

	// When user types manually, cancel the silence countdown
	const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInputText(event.target.value);
		if (narratorEnabled) {
			cancelCountdown();
		}
	}, [narratorEnabled, cancelCountdown]);

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
					track('file_attached', { fileType: file.type || ext || 'unknown' });
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
		[attachments.length, toast, track],
	);
	const { getKeys } = useKeybindings();
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

	useHotkeys(
		getKeys('focus-chat'),
		(event) => {
			event.preventDefault();
			if (focusChatInput()) return;
			if (viewMode !== 'chat') {
				handleViewModeChange('chat');
				setTimeout(() => {
					focusChatInput();
				}, 50);
			}
		},
		{ enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'], enableOnContentEditable: true },
		[getKeys('focus-chat'), viewMode]
	);

	useHotkeys(
		getKeys('toggle-view'),
		(event) => {
			event.preventDefault();
			handleViewModeChange(viewMode === 'ide' ? 'chat' : 'ide');
		},
		{ enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'], enableOnContentEditable: true },
		[getKeys('toggle-view'), viewMode]
	);

	useHotkeys(
		getKeys('close-tab'),
		(event) => {
			if (viewMode !== 'ide' || !activeId) return;
			event.preventDefault();
			closeTab(activeId);
		},
		{ enableOnFormTags: false, enableOnContentEditable: false },
		[getKeys('close-tab'), viewMode, activeId]
	);

	useHotkeys(
		getKeys('toggle-sidebar-tab'),
		(event) => {
			if (viewMode !== 'ide') return;
			event.preventDefault();
			const nextTab = sidebarTab === 'files' ? 'git' : 'files';
			navigate({ search: (prev: SessionSearch) => ({ ...prev, tab: nextTab }) });
		},
		{ enableOnFormTags: false, enableOnContentEditable: false },
		[getKeys('toggle-sidebar-tab'), viewMode, sidebarTab]
	);

	useEffect(() => {
		const handler = () => {
			if (viewMode !== 'ide' || !activeId) return;
			closeTab(activeId);
		};
		window.addEventListener('app-close-active-tab', handler);
		return () => window.removeEventListener('app-close-active-tab', handler);
	}, [activeId, closeTab, viewMode]);

	// File tree cache — persists across IDE tab switches (mount/unmount of FileExplorer)
	const [cachedTreeNodes, setCachedTreeNodes] = useState<FileTreeNode[]>([]);
	const [cachedTreeEntryCount, setCachedTreeEntryCount] = useState(0);
	const handleTreeLoaded = useCallback((treeNodes: FileTreeNode[], treeEntryCount: number) => {
		setCachedTreeNodes(treeNodes);
		setCachedTreeEntryCount(treeEntryCount);
	}, []);

	const {
		commentCount,
		addComment,
		clearComments,
		formatForPrompt,
		getDiffAnnotations,
		getFileComments,
	} = useCodeComments();
	const { settings: editorSettings, updateSettings: updateEditorSettings } = useEditorSettings();
	const handleAddComment = useCallback((...args: Parameters<typeof addComment>) => {
		addComment(...args);
		track('code_comment_added');
	}, [addComment, track]);
	useEffect(() => {
		if (!sessionId) return;
		setAttachments([]);
	}, [sessionId]);

	// Load user's default agent preference (once on mount)
	const hasManuallySelectedRef = useRef(false);
	useEffect(() => {
		hasManuallySelectedRef.current = hasManuallySelectedCommand;
	}, [hasManuallySelectedCommand]);

	useEffect(() => {
		if (initialSession.agent) return;
		fetch('/api/user/settings')
			.then((r) => r.json())
			.then((data: { defaultCommand?: string }) => {
				if (!hasManuallySelectedRef.current && data.defaultCommand) {
					setSelectedCommand(data.defaultCommand);
				}
			})
			.catch(() => {});
	}, [initialSession.agent]);


	const activeFilePath = activeTab?.filePath ?? null;
	const isBusy = sessionStatus.type === 'busy';
	const displayMessages = session.status === 'terminated' ? archivedMessages : messages;
	const sshCommand = session.sandboxId ? `agentuity cloud ssh ${session.sandboxId}` : '';
	const attachCommand = session.sandboxUrl
		? `opencode attach ${session.sandboxUrl}${opencodePassword ? ` --password ${opencodePassword}` : ''}`
		: '';
	const getDisplayParts = useCallback(
		(messageID: string) => {
			if (session.status === 'terminated') {
				return archivedParts.get(messageID) ?? [];
			}
			return getPartsForMessage(messageID);
		},
		[archivedParts, getPartsForMessage, session.status],
	);
	const { branch: gitBranch, changedCount: gitChangedCount, hasRepo: isGitRepo, refresh: refreshGitStatus } = useGitStatus(activeSessionId, githubAvailable);

	useEffect(() => {
		if (!isEditingTitle) {
			setEditTitle(session.title || '');
		}
	}, [isEditingTitle, session.title]);

	const promptPlaceholder = session.status === 'active'
		? 'Message the agent...'
		: session.status === 'creating'
			? 'Type your message... (will send when ready)'
			: session.status === 'terminated'
				? 'This session is read-only.'
				: session.status === 'error'
					? 'Session failed to start.'
					: 'Waiting for sandbox to be ready...';
	const attachmentAccept = Array.from(ALLOWED_EXTENSIONS)
		.map((ext) => `.${ext}`)
		.join(',');
	const isSessionInputEnabled = session.status === 'active' || session.status === 'creating';
	const attachmentDisabled = !isSessionInputEnabled || attachments.length >= MAX_ATTACHMENTS;

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
				track('message_sent', {
					hasAttachments: Boolean(payload.attachments?.length),
					attachmentCount: payload.attachments?.length ?? 0,
					command: payload.command ?? null,
					model: payload.model,
				});
			} catch (err) {
				console.error('Failed to send message:', err);
				toast({ type: 'error', message: 'Failed to send message' });
			} finally {
				setIsSending(false);
			}
		},
		[sessionId, toast, track],
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
			command: selectedCommand,
			attachments: nextAttachments,
		};

		setInputText('');
		setAttachments([]);
		if (commentCount > 0) {
			clearComments();
		}

		if (isBusy || isSending || session.status === 'creating') {
			setMessageQueue((prev) => [...prev, payload]);
			return;
		}

		await sendMessage(payload);
	};
	handleSendRef.current = handleSend;

	useEffect(() => {
		if (session.status !== 'active' || isBusy || isSending || messageQueue.length === 0) return;
		const [next, ...rest] = messageQueue;
		if (!next) return;
		setMessageQueue(rest);
		void sendMessage(next);
	}, [session.status, isBusy, isSending, messageQueue, sendMessage]);



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
      track('session_forked');
    } catch (error) {
      console.error('Failed to fork session:', error);
      toast({ type: 'error', message: 'Failed to fork session' });
    } finally {
      setIsForking(false);
    }
  };

	const handleCreateSnapshot = async () => {
		if (isSavingSnapshot || !snapshotName.trim()) return;
		setIsSavingSnapshot(true);
		try {
			const res = await fetch(`/api/sessions/${sessionId}/snapshot`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: snapshotName.trim(), description: snapshotDescription.trim() || undefined }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to save snapshot');
			}
			toast({ type: 'success', message: 'Snapshot saved!' });
			track('snapshot_created');
			setShowSnapshotDialog(false);
			setSnapshotName('');
			setSnapshotDescription('');
		} catch (error) {
			toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save snapshot' });
		} finally {
			setIsSavingSnapshot(false);
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
      track('session_shared');
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

	const handleCopyAttachCommand = useCallback(async () => {
		if (!attachCommand) return;
		try {
			await navigator.clipboard.writeText(attachCommand);
			setAttachCopied(true);
			setTimeout(() => setAttachCopied(false), 2000);
		} catch {
			toast({ type: 'error', message: 'Failed to copy attach command' });
		}
	}, [attachCommand, toast]);

	const handleCopyPassword = useCallback(async () => {
		if (!opencodePassword) return;
		try {
			await navigator.clipboard.writeText(opencodePassword);
			setPasswordCopied(true);
			setTimeout(() => setPasswordCopied(false), 2000);
		} catch {
			toast({ type: 'error', message: 'Failed to copy password' });
		}
	}, [opencodePassword, toast]);

  // Abort
  const handleAbort = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/abort`, { method: 'POST' });
      if (res.ok) {
        track('session_aborted');
      }
    } catch {
      // Ignore abort errors
    }
  };

	const handleRevert = useCallback(async (messageID: string) => {
		if (!sessionId) return;
		try {
			const res = await fetch(`/api/sessions/${sessionId}/revert`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messageID }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				console.error('Revert failed:', data);
				return;
			}
			track('checkpoint_reverted');
			// UI updates come via SSE session.updated event
		} catch (error) {
			console.error('Revert failed:', error);
		}
	}, [sessionId, track]);

	const handleUnrevert = useCallback(async () => {
		if (!sessionId) return;
		try {
			const res = await fetch(`/api/sessions/${sessionId}/unrevert`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				console.error('Unrevert failed:', data);
			}
		} catch (error) {
			console.error('Unrevert failed:', error);
		}
	}, [sessionId]);

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
		!isSessionInputEnabled
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

				if (textContent) {
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

					fetch('/api/voice/narrate', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							text: textContent.slice(0, 5000),
							conversationHistory: recentChat,
						}),
					})
						.then(res => res.json())
						.then((data: { text?: string; audio?: { base64: string; mimeType: string } }) => {
							if (data.audio) enqueueAudio(data.audio);
						})
						.catch(() => {
							// Silent fail — narrator is best-effort
						});
				}
			}
		}

		wasBusyRef.current = isBusy;
	}, [narratorEnabled, isBusy, displayMessages, getDisplayParts, enqueueAudio]);

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

	const renderReasoning = useCallback((part: ReasoningPart, message: ChatMessage) => {
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
	}, [isStreaming, lastAssistantMessage]);

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

	const groupPartsIntoChains = useCallback((parts: Part[]): (Part | ChainGroup)[] => {
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
	}, [extractFilePath, isReadTool, isWriteOrEditTool]);



	const renderPart = useCallback((part: Part, message: ChatMessage) => {
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
					onAddComment={handleAddComment}
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
	}, [isStreaming, lastAssistantMessage, renderReasoning, handleAddComment, getDiffAnnotations, getFileComments, getSourcesForToolPart]);

	const renderedMessages = useMemo(() => {
		if (displayMessages.length === 0) return null;
		return displayMessages.map((message, msgIndex) => {
			const parts = getDisplayParts(message.id);
			const agent = 'agent' in message ? message.agent : undefined;
			const errorInfo = 'error' in message ? message.error : undefined;
			const isAfterRevertPoint = isGitRepo && revertState != null && (() => {
				const revertMsgIndex = displayMessages.findIndex(m => m.id === revertState.messageID);
				return msgIndex > revertMsgIndex;
			})();

			return (
				<div key={message.id} className={isAfterRevertPoint ? 'opacity-30 pointer-events-none' : ''}>
				<Message
					from={message.role === 'user' ? 'user' : 'assistant'}
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
							{isGitRepo && (
								<MessageAction
									label="Restore"
									onClick={() => handleRevert(message.id)}
									title="Restore to this checkpoint"
								>
									<RotateCcw className="h-3.5 w-3.5" />
								</MessageAction>
							)}
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
				</div>
			);
		});
	}, [displayMessages, getDisplayParts, isGitRepo, revertState, groupPartsIntoChains, renderPart, copyMessage, handleRevert]);

	const conversationView = (
		<Conversation className="flex-1 min-w-0">
		<ConversationContent>
		{session.status !== 'active' && session.status === 'creating' && (
			<div className="flex flex-col items-center justify-center py-16 gap-6">
				<div className="relative">
					<div className="h-10 w-10 rounded-full border-2 border-[var(--border)]" />
					<div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-t-[var(--primary)] animate-spin" />
				</div>
				<div className="text-center space-y-2">
					<p className="text-sm font-medium text-[var(--foreground)]">
						{statusElapsedMs > 25000
							? 'Almost ready...'
							: statusElapsedMs > 15000
								? 'Starting AI agent'
								: statusElapsedMs > 8000
									? 'Installing tools & skills'
									: statusElapsedMs > 3000
										? 'Setting up environment'
										: 'Creating sandbox'}
					</p>
					<p className="text-xs text-[var(--muted-foreground)]">
						{statusElapsedMs > 25000
							? 'Verifying the agent is responsive'
							: statusElapsedMs > 15000
								? 'Launching OpenCode server'
								: statusElapsedMs > 8000
									? 'Configuring agent capabilities'
									: statusElapsedMs > 3000
										? 'Cloning repository and preparing workspace'
										: 'Provisioning an isolated sandbox environment'}
					</p>
				</div>
				<div className="flex items-center gap-1.5">
					{[3000, 8000, 15000, 25000].map((threshold) => (
						<div
							key={threshold}
							className={`h-1 w-8 rounded-full transition-colors duration-500 ${
								statusElapsedMs > threshold
									? 'bg-[var(--primary)]'
									: 'bg-[var(--border)]'
							}`}
						/>
					))}
				</div>
				<p className="text-[10px] text-[var(--muted-foreground)]">
					{Math.floor(statusElapsedMs / 1000)}s
				</p>
			</div>
		)}
		{session.status !== 'active' && session.status !== 'creating' && (
			<div
				className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
					session.status === 'error'
						? 'border-red-500/30 bg-red-500/10 text-red-400'
						: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
				}`}
			>
				<div className="flex items-center justify-between gap-3">
					<span>
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
			{typeof (session.metadata as Record<string, unknown> | null)?.cloneError === 'string' && (
				<div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
					<div className="font-medium">⚠️ Repository clone failed</div>
					<p className="mt-1 text-[10px]">{(session.metadata as Record<string, string>).cloneError}</p>
					<p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
						The session started without code. Check your GitHub PAT permissions in Profile settings, or provide the repo URL to the agent.
					</p>
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
				renderedMessages
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
			{revertState && isGitRepo && (
				<div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 mb-2">
					<span>Session reverted to an earlier checkpoint. New messages will continue from this point.</span>
					<button
						type="button"
						onClick={handleUnrevert}
						className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
					>
						Undo Revert
					</button>
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
			<PromptInputProvider>
				<PromptInput onSubmit={({ text }) => handleSend(text)}>
					<PromptInputTextarea
						value={inputText}
						onChange={handleInputChange}
						placeholder={promptPlaceholder}
						disabled={!isSessionInputEnabled}
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
									className="inline-flex h-5 w-5 sm:h-4 sm:w-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
									onClick={() => handleRemoveAttachment(attachment.id)}
									title="Remove attachment"
								>
									<X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
								</button>
							</div>
						))}
					</div>
				)}
				<PromptInputFooter>
					<div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] text-[var(--muted-foreground)]">
					<CommandPicker value={selectedCommand} onChange={(cmd) => {
					setSelectedCommand(cmd);
					setHasManuallySelectedCommand(true);
				}} />
					<ModelSelector value={selectedModel} onChange={handleModelChange} disabled={selectedCommand === '/agentuity-coder' || selectedCommand === '/agentuity-cadence'} />
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
							<VoiceControls
								narratorEnabled={narratorEnabled}
								onNarratorToggle={handleNarratorToggle}
								isListening={isListening}
								onMicToggle={handleMicToggle}
								isProcessing={isProcessing}
								isSupported={voiceSupported}
								isCountingDown={isCountingDown}
								countdownProgress={countdownProgress}
							/>
							)}
							<PromptInputSubmit
								disabled={submitDisabled}
								status={isBusy ? 'streaming' : 'ready'}
								onStop={handleAbort}
							>
								{session.status === 'creating' ? <Clock className="h-4 w-4" /> : undefined}
							</PromptInputSubmit>
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
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Fork & Snapshot">
							<GitFork className="h-3.5 w-3.5" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-48 p-1" align="end">
						<button
							type="button"
							onClick={handleFork}
							disabled={isForking}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--accent)] disabled:opacity-50"
						>
							{isForking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
							Fork Session
						</button>
						<button
							type="button"
							onClick={() => setShowSnapshotDialog(true)}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--accent)]"
						>
							<Camera className="h-3.5 w-3.5" />
							Save Snapshot
						</button>
					</PopoverContent>
				</Popover>
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
	
          {sessionStatus.type === 'retry' && (
            <Badge variant="destructive" className="text-[10px]">
              Retrying ({sessionStatus.attempt})
            </Badge>
          )}
			</div>
			<div className="ml-auto flex items-center gap-2">
				{/* SSH info popover */}
				{session.sandboxId && (
					<Popover onOpenChange={(open) => {
						if (open && !opencodePassword) {
							passwordFetchController.current?.abort();
							const controller = new AbortController();
							passwordFetchController.current = controller;
							apiFetch(`/api/sessions/${sessionId}/password`, { signal: controller.signal })
								.then((r) => r.json())
								.then((data) => { if (data?.password) setOpencodePassword(data.password); })
								.catch((err) => {
									if (err instanceof DOMException && err.name === 'AbortError') return;
								});
						}
					}}>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
							<Terminal className="h-3.5 w-3.5" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						side="bottom"
						className="w-[calc(100vw-2rem)] max-w-[90vw] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] md:w-80"
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
							{attachCommand && (
							<div>
								<p className="text-xs text-[var(--muted-foreground)] mb-1">OpenCode Attach</p>
								<div className="flex items-center gap-2">
									<code className="text-xs bg-[var(--muted)] px-2 py-1 rounded flex-1 block truncate">
										{attachCommand}
									</code>
									<button
										type="button"
										onClick={handleCopyAttachCommand}
										className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
										title="Copy attach command"
									>
										{attachCopied ? (
											<Check className="h-3.5 w-3.5 text-green-500" />
										) : (
											<Copy className="h-3.5 w-3.5" />
										)}
									</button>
								</div>
							</div>
							)}
						{opencodePassword && (
							<div>
								<p className="text-xs text-[var(--muted-foreground)] mb-1">OpenCode Password</p>
								<div className="flex items-center gap-2">
									<code className="text-xs bg-[var(--muted)] px-2 py-1 rounded flex-1 block truncate font-mono">
										{'•'.repeat(opencodePassword.length)}
									</code>
									<button
										type="button"
										onClick={handleCopyPassword}
										className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
										title="Copy password"
									>
										{passwordCopied ? (
											<Check className="h-3.5 w-3.5 text-green-500" />
										) : (
											<Copy className="h-3.5 w-3.5" />
										)}
									</button>
								</div>
							</div>
						)}
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
						onClick={() => handleViewModeChange('chat')}
						className={`h-7 px-2 text-xs ${viewMode === 'chat' ? 'bg-[var(--background)] shadow-sm' : ''}`}
						title="Chat"
					>
						<MessageSquare className="h-3.5 w-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => handleViewModeChange('ide')}
						className={`h-7 px-2 text-xs ${viewMode === 'ide' ? 'bg-[var(--background)] shadow-sm' : ''}`}
						title="Code"
					>
						<Code2 className="h-3.5 w-3.5" />
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
															onClick={() => navigate({ search: (prev: SessionSearch) => ({ ...prev, tab: 'files' }) })}
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
															onClick={() => navigate({ search: (prev: SessionSearch) => ({ ...prev, tab: 'git' }) })}
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
						cachedNodes={cachedTreeNodes}
						cachedEntryCount={cachedTreeEntryCount}
						onTreeLoaded={handleTreeLoaded}
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
						onAddComment={handleAddComment}
						getDiffAnnotations={getDiffAnnotations}
						getFileComments={getFileComments}
						editorSettings={editorSettings}
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
								className="inline-flex h-5 w-5 sm:h-4 sm:w-4 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
								onClick={() => handleRemoveAttachment(attachment.id)}
								title="Remove attachment"
							>
								<X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
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
			<div className="flex items-center gap-1 sm:gap-2">
								<div className="flex-1 min-w-0">
									<PromptInputTextarea
										value={inputText}
										onChange={handleInputChange}
										placeholder={promptPlaceholder}
										disabled={!isSessionInputEnabled}
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
								<VoiceControls
									narratorEnabled={narratorEnabled}
									onNarratorToggle={handleNarratorToggle}
									isListening={isListening}
									onMicToggle={handleMicToggle}
									isProcessing={isProcessing}
									isSupported={voiceSupported}
									isCountingDown={isCountingDown}
									countdownProgress={countdownProgress}
								/>
								)}
								<PromptInputSubmit
									disabled={submitDisabled}
									status={isBusy ? 'streaming' : 'ready'}
									onStop={handleAbort}
								>
									{session.status === 'creating' ? <Clock className="h-4 w-4" /> : undefined}
								</PromptInputSubmit>
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

		{/* Snapshot dialog */}
		{showSnapshotDialog && (
			<div
				className="fixed inset-0 z-50 flex items-center justify-center"
				style={{ backgroundColor: 'color-mix(in oklab, var(--foreground) 50%, transparent)' }}
			>
				<div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
					<h3 className="text-sm font-semibold text-[var(--foreground)]">Save Snapshot</h3>
					<p className="text-xs text-[var(--muted-foreground)] mt-1">
						Save the current state of your sandbox for reuse in new sessions.
					</p>
					<input
						type="text"
						value={snapshotName}
						onChange={(e) => setSnapshotName(e.target.value)}
						placeholder="Snapshot name"
						className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
					/>
					<textarea
						value={snapshotDescription}
						onChange={(e) => setSnapshotDescription(e.target.value)}
						placeholder="Description (optional)"
						rows={2}
						className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)] resize-none"
					/>
					<div className="flex justify-end gap-2 mt-3">
						<Button variant="outline" size="sm" onClick={() => { setShowSnapshotDialog(false); setSnapshotName(''); setSnapshotDescription(''); }}>
							Cancel
						</Button>
						<Button size="sm" onClick={handleCreateSnapshot} disabled={isSavingSnapshot || !snapshotName.trim()}>
							{isSavingSnapshot ? (
								<>
									<Loader2 className="mr-1 h-3 w-3 animate-spin" />
									Saving...
								</>
							) : (
								'Save'
							)}
						</Button>
					</div>
				</div>
			</div>
		)}
		</div>
	);
}
