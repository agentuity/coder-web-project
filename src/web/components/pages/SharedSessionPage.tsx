import { useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Loader2, Share2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { TextPartView } from '../chat/TextPartView';
import {
	Conversation,
	ConversationContent,
} from '../ai-elements/conversation';
import {
	Message,
	MessageContent,
	MessageResponse,
} from '../ai-elements/message';
import type { Message as ChatMessage, Part, TextPart, ReasoningPart } from '../../types/opencode';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../ai-elements/reasoning';

interface SharedSession {
	session: {
		id: string;
		title: string;
		agent: string | null;
		model: string | null;
		createdAt: string;
	};
	messages: ChatMessage[];
	sharedAt: string;
}

/**
 * Read-only view for a publicly shared session.
 * Fetches shared session data from the stream URL and renders messages.
 */
export function SharedSessionPage() {
	const { streamId } = useParams({ from: '/shared/$streamId' });
	const streamUrl = `/api/shared/${streamId}`;
	const [data, setData] = useState<SharedSession | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		setError(null);

		fetch(streamUrl)
			.then(async (res) => {
				if (!res.ok) {
					throw new Error('Shared session not found or expired');
				}
				return res.json();
			})
			.then((json) => setData(json))
			.catch((err) => setError(err.message || 'Failed to load shared session'))
			.finally(() => setLoading(false));
	}, [streamUrl]);

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
				<div className="text-center">
					<Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-[var(--primary)]" />
					<p className="text-sm font-medium text-[var(--foreground)]">Loading shared session...</p>
				</div>
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
				<div className="text-center">
					<p className="text-sm font-medium text-[var(--foreground)]">
						{error || 'Session not found'}
					</p>
					<p className="mt-1 text-xs text-[var(--muted-foreground)]">
						This shared session may have expired or been removed.
					</p>
				</div>
			</div>
		);
	}

	const { session, messages, sharedAt } = data;

	// Build a parts map from messages that have inline parts (from OpenCode data format)
	const getPartsForMessage = (messageId: string): Part[] => {
		// OpenCode messages may have parts embedded directly or as separate entries
		// In the shared format, parts come from the messages array
		const partsFromMessages = messages.filter(
			(m: any) => m.messageID === messageId || (m.type && m.messageID === messageId)
		) as unknown as Part[];

		// Also check if parts are stored alongside messages
		const msg = messages.find((m) => m.id === messageId) as any;
		if (msg?.parts && Array.isArray(msg.parts)) {
			return msg.parts;
		}

		return partsFromMessages.length > 0 ? partsFromMessages : [];
	};

	// Separate actual messages (those with role) from parts
	const actualMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');
	// Parts that are not messages themselves
	const allParts = messages.filter((m: any) => m.type && m.messageID) as unknown as Part[];

	const getPartsForMsg = (messageId: string): Part[] => {
		// Try inline parts first
		const msg = messages.find((m) => m.id === messageId) as any;
		if (msg?.parts && Array.isArray(msg.parts)) {
			return msg.parts;
		}
		// Fall back to parts from the flat array
		return allParts.filter((p) => p.messageID === messageId);
	};

	const renderPart = (part: Part) => {
		switch (part.type) {
			case 'text':
				return (
					<MessageResponse key={part.id}>
						<TextPartView part={part as TextPart} />
					</MessageResponse>
				);
			case 'reasoning': {
				const rp = part as ReasoningPart;
				const duration = rp.time?.end
					? Math.max(1, Math.ceil((rp.time.end - rp.time.start) / 1000))
					: undefined;
				return (
					<Reasoning defaultOpen={false} duration={duration} isStreaming={false} key={part.id}>
						<ReasoningTrigger />
						<ReasoningContent>{rp.text}</ReasoningContent>
					</Reasoning>
				);
			}
			case 'tool':
				return (
					<div
						key={part.id}
						className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)]"
					>
						Tool: {(part as any).tool}
						{(part as any).state?.status === 'completed' && ' (completed)'}
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<div className="flex min-h-screen flex-col bg-[var(--background)]">
			{/* Header */}
			<div className="border-b border-[var(--border)] px-4 py-3">
				<div className="mx-auto flex max-w-3xl items-center gap-3">
					<Share2 className="h-4 w-4 text-[var(--primary)]" />
					<div className="flex-1">
						<h1 className="text-sm font-semibold text-[var(--foreground)]">
							{session.title}
						</h1>
						<div className="flex items-center gap-2 mt-0.5">
							<Badge variant="secondary" className="text-[10px]">
								Shared Session
							</Badge>
							{session.agent && (
								<span className="text-[10px] text-[var(--muted-foreground)]">
									Agent: {session.agent}
								</span>
							)}
							{session.model && (
								<span className="text-[10px] text-[var(--muted-foreground)]">
									Model: {session.model}
								</span>
							)}
							<span className="text-[10px] text-[var(--muted-foreground)]">
								Shared {new Date(sharedAt).toLocaleDateString()}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Messages */}
			<div className="mx-auto w-full max-w-3xl flex-1">
				<Conversation className="flex-1 min-w-0">
					<ConversationContent>
						{actualMessages.length === 0 ? (
							<div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
								No messages in this session
							</div>
						) : (
							actualMessages.map((message) => {
								const parts = getPartsForMsg(message.id);
								return (
									<Message
										from={message.role === 'user' ? 'user' : 'assistant'}
										key={message.id}
									>
										<MessageContent>
											{parts.length > 0 ? (
												parts.map((part) => renderPart(part))
											) : (
												<div className="text-sm text-[var(--muted-foreground)] italic">
													(message content)
												</div>
											)}
										</MessageContent>
									</Message>
								);
							})
						)}
					</ConversationContent>
				</Conversation>
			</div>

			{/* Footer */}
			<div className="border-t border-[var(--border)] px-4 py-2 text-center">
				<p className="text-[10px] text-[var(--muted-foreground)]">
					This is a read-only view of a shared session
				</p>
			</div>
		</div>
	);
}
