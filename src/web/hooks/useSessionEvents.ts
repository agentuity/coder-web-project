/**
 * SSE subscription hook for OpenCode session events.
 *
 * Connects to GET /api/sessions/:id/events, dispatches incoming events into a
 * reducer, and exposes sorted messages, parts, permissions, questions, todos,
 * and connection state.
 */
import { useEffect, useReducer, useRef, useCallback, useMemo } from 'react';
import type {
	Message,
	Part,
	SessionStatus,
	PermissionRequest,
	QuestionRequest,
	Todo,
	ChatEvent,
} from '../types/opencode';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionEventState {
	messages: Map<string, Message>;
	partsByMessage: Map<string, Map<string, Part>>;
	sessionStatus: SessionStatus;
	pendingPermissions: Map<string, PermissionRequest>;
	pendingQuestions: Map<string, QuestionRequest>;
	todos: Todo[];
	isConnected: boolean;
	error: string | null;
	revertState: { messageID: string; partID?: string } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
	| { type: 'MESSAGE_UPDATED'; message: Message }
	| { type: 'MESSAGE_REMOVED'; messageID: string }
	| { type: 'PART_UPDATED'; part: Part }
	| { type: 'PART_REMOVED'; messageID: string; partID: string }
	| { type: 'SESSION_STATUS'; status: SessionStatus }
	| { type: 'PERMISSION_ASKED'; request: PermissionRequest }
	| { type: 'PERMISSION_REPLIED'; requestID: string }
	| { type: 'QUESTION_ASKED'; request: QuestionRequest }
	| { type: 'QUESTION_REPLIED'; requestID: string }
	| { type: 'TODO_UPDATED'; todos: Todo[] }
	| { type: 'SESSION_UPDATED'; payload: { revert?: { messageID: string; partID?: string } } }
	| { type: 'CONNECTED' }
	| { type: 'DISCONNECTED'; error?: string }
	| { type: 'CLEAR' }
	| { type: 'INIT_MESSAGES'; messages: Message[]; parts: Part[] };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: SessionEventState = {
	messages: new Map(),
	partsByMessage: new Map(),
	sessionStatus: { type: 'idle' },
	pendingPermissions: new Map(),
	pendingQuestions: new Map(),
	todos: [],
	isConnected: false,
	error: null,
	revertState: null,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: SessionEventState, action: Action): SessionEventState {
	switch (action.type) {
		case 'MESSAGE_UPDATED': {
			const messages = new Map(state.messages);
			messages.set(action.message.id, action.message);
			return { ...state, messages };
		}

		case 'MESSAGE_REMOVED': {
			const messages = new Map(state.messages);
			messages.delete(action.messageID);
			const partsByMessage = new Map(state.partsByMessage);
			partsByMessage.delete(action.messageID);
			return { ...state, messages, partsByMessage };
		}

		case 'PART_UPDATED': {
			const partsByMessage = new Map(state.partsByMessage);
			const existing = partsByMessage.get(action.part.messageID);
			const msgParts = new Map(existing ?? []);
			msgParts.set(action.part.id, action.part);
			partsByMessage.set(action.part.messageID, msgParts);
			return { ...state, partsByMessage };
		}

		case 'PART_REMOVED': {
			const partsByMessage = new Map(state.partsByMessage);
			const existing = partsByMessage.get(action.messageID);
			const msgParts = new Map(existing ?? []);
			msgParts.delete(action.partID);
			partsByMessage.set(action.messageID, msgParts);
			return { ...state, partsByMessage };
		}

		case 'SESSION_STATUS':
			return { ...state, sessionStatus: action.status };

		case 'PERMISSION_ASKED': {
			const pendingPermissions = new Map(state.pendingPermissions);
			pendingPermissions.set(action.request.id, action.request);
			return { ...state, pendingPermissions };
		}

		case 'PERMISSION_REPLIED': {
			const pendingPermissions = new Map(state.pendingPermissions);
			pendingPermissions.delete(action.requestID);
			return { ...state, pendingPermissions };
		}

		case 'QUESTION_ASKED': {
			const pendingQuestions = new Map(state.pendingQuestions);
			pendingQuestions.set(action.request.id, action.request);
			return { ...state, pendingQuestions };
		}

		case 'QUESTION_REPLIED': {
			const pendingQuestions = new Map(state.pendingQuestions);
			pendingQuestions.delete(action.requestID);
			return { ...state, pendingQuestions };
		}

		case 'TODO_UPDATED':
			return { ...state, todos: action.todos };

		case 'SESSION_UPDATED': {
			return {
				...state,
				revertState: action.payload.revert || null,
			};
		}

		case 'CONNECTED':
			return { ...state, isConnected: true, error: null };

		case 'DISCONNECTED':
			return { ...state, isConnected: false, error: action.error ?? null };

		case 'CLEAR':
			return { ...initialState };

		case 'INIT_MESSAGES': {
			const messages = new Map<string, Message>();
			const partsByMessage = new Map<string, Map<string, Part>>();
			for (const msg of action.messages) {
				messages.set(msg.id, msg);
			}
			for (const part of action.parts) {
				const msgParts = partsByMessage.get(part.messageID) ?? new Map<string, Part>();
				msgParts.set(part.id, part);
				partsByMessage.set(part.messageID, msgParts);
			}
			return { ...state, messages, partsByMessage };
		}

		default:
			return state;
	}
}

// ---------------------------------------------------------------------------
// SSE event → reducer dispatch mapping
// ---------------------------------------------------------------------------

function dispatchChatEvent(dispatch: React.Dispatch<Action>, event: ChatEvent): void {
	switch (event.type) {
		case 'message.updated':
			dispatch({ type: 'MESSAGE_UPDATED', message: event.properties.info });
			break;
		case 'message.removed':
			dispatch({ type: 'MESSAGE_REMOVED', messageID: event.properties.messageID });
			break;
		case 'message.part.updated':
			dispatch({ type: 'PART_UPDATED', part: event.properties.part });
			break;
		case 'message.part.removed':
			dispatch({
				type: 'PART_REMOVED',
				messageID: event.properties.messageID,
				partID: event.properties.partID,
			});
			break;
		case 'session.status':
			dispatch({ type: 'SESSION_STATUS', status: event.properties.status });
			break;
		case 'session.idle':
			dispatch({ type: 'SESSION_STATUS', status: { type: 'idle' } });
			break;
		case 'permission.asked':
			dispatch({ type: 'PERMISSION_ASKED', request: event.properties });
			break;
		case 'permission.replied':
			dispatch({ type: 'PERMISSION_REPLIED', requestID: event.properties.requestID });
			break;
		case 'question.asked':
			dispatch({ type: 'QUESTION_ASKED', request: event.properties });
			break;
		case 'question.replied':
			dispatch({ type: 'QUESTION_REPLIED', requestID: event.properties.requestID });
			break;
		case 'question.rejected':
			dispatch({ type: 'QUESTION_REPLIED', requestID: event.properties.requestID });
			break;
		case 'todo.updated':
			dispatch({ type: 'TODO_UPDATED', todos: event.properties.todos });
			break;
		case 'session.error':
			dispatch({ type: 'DISCONNECTED', error: event.properties.error });
			break;
		case 'session.updated': {
			const sessionInfo = (event as any).properties?.info;
			dispatch({
				type: 'SESSION_UPDATED',
				payload: { revert: sessionInfo?.revert || null },
			});
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Reconnect delay in milliseconds. */
const RECONNECT_DELAY_MS = 2_000;

/** Maximum number of consecutive SSE reconnection attempts before giving up. */
const MAX_RETRIES = 15;

export function useSessionEvents(sessionId: string | undefined) {
	const [state, dispatch] = useReducer(reducer, initialState);
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryCountRef = useRef(0);
	const shouldReconnectRef = useRef(true);

	// -----------------------------------------------------------------------
	// SSE connection lifecycle
	// -----------------------------------------------------------------------
	useEffect(() => {
		if (!sessionId) return;

		// Reset retry counter on fresh mount / sessionId change
		retryCountRef.current = 0;
		shouldReconnectRef.current = true;

		// Hydrate existing messages on mount
		fetch(`/api/sessions/${sessionId}/messages`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: unknown) => {
				const messages: Message[] = [];
				const parts: Part[] = [];

				const record = data as Record<string, unknown>;

				if (record?.messages && Array.isArray(record.messages)) {
					// Shape: { messages: Array<{ info: Message; parts: Part[] }> }
					for (const item of record.messages as Array<Record<string, unknown>>) {
						if (item.info) messages.push(item.info as Message);
						if (Array.isArray(item.parts)) parts.push(...(item.parts as Part[]));
					}
				} else if (Array.isArray(data)) {
					// Shape: Array<{ info?: Message; role?: string; parts?: Part[] }>
					for (const item of data as Array<Record<string, unknown>>) {
						if (item.info) messages.push(item.info as Message);
						else if (item.role) messages.push(item as unknown as Message);
						if (Array.isArray(item.parts)) parts.push(...(item.parts as Part[]));
					}
				}

				if (messages.length > 0) {
					dispatch({ type: 'INIT_MESSAGES', messages, parts });
				}
			})
			.catch(() => {
				// Silent — initial hydration is best-effort (e.g. 503 while session starts)
			});

		// -------------------------------------------------------------------
		// EventSource setup with exponential-backoff reconnect
		// -------------------------------------------------------------------
		function scheduleReconnect(reason?: string) {
			if (!shouldReconnectRef.current) return;
			if (reconnectTimerRef.current) return;
			retryCountRef.current += 1;
			if (retryCountRef.current <= MAX_RETRIES) {
				dispatch({ type: 'DISCONNECTED', error: reason });
				const delay = Math.min(
					RECONNECT_DELAY_MS * Math.pow(1.5, retryCountRef.current - 1),
					10_000,
				);
				reconnectTimerRef.current = setTimeout(() => {
					reconnectTimerRef.current = null;
					connect();
				}, delay);
			} else {
				dispatch({
					type: 'DISCONNECTED',
					error: reason ?? 'Max reconnection attempts reached',
				});
			}
		}

		function connect() {
			const es = new EventSource(`/api/sessions/${sessionId}/events`);
			eventSourceRef.current = es;

			es.onopen = () => {
				retryCountRef.current = 0; // Reset on successful connection
				if (reconnectTimerRef.current) {
					clearTimeout(reconnectTimerRef.current);
					reconnectTimerRef.current = null;
				}
				dispatch({ type: 'CONNECTED' });
			};

			es.onmessage = (e: MessageEvent) => {
				try {
					const event = JSON.parse(e.data as string) as ChatEvent;
					if (event.type === 'session.error') {
						dispatchChatEvent(dispatch, event);
						es.close();
						scheduleReconnect(event.properties?.error ?? 'Session error');
						return;
					}
					dispatchChatEvent(dispatch, event);
				} catch {
					// Ignore malformed SSE payloads
				}
			};

			es.onerror = () => {
				if (eventSourceRef.current !== es) return;
				es.close();
				scheduleReconnect('Connection lost');
			};
		}

		connect();

		return () => {
			shouldReconnectRef.current = false;
			eventSourceRef.current?.close();
			eventSourceRef.current = null;
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
			dispatch({ type: 'CLEAR' });
		};
	}, [sessionId]);

	// -----------------------------------------------------------------------
	// Derived helpers
	// -----------------------------------------------------------------------

	/** Messages sorted by creation time (ascending). */
	const sortedMessages = useMemo(
		() => Array.from(state.messages.values()).sort(
			(a, b) => a.time.created - b.time.created,
		),
		[state.messages],
	);

	/** Get all parts belonging to a given message. */
	const getPartsForMessage = useCallback(
		(messageID: string): Part[] => {
			const parts = state.partsByMessage.get(messageID);
			return parts ? Array.from(parts.values()) : [];
		},
		[state.partsByMessage],
	);

	const memoizedPermissions = useMemo(
		() => Array.from(state.pendingPermissions.values()),
		[state.pendingPermissions],
	);

	const memoizedQuestions = useMemo(
		() => Array.from(state.pendingQuestions.values()),
		[state.pendingQuestions],
	);

	return useMemo(() => ({
		messages: sortedMessages,
		getPartsForMessage,
		sessionStatus: state.sessionStatus,
		pendingPermissions: memoizedPermissions,
		pendingQuestions: memoizedQuestions,
		todos: state.todos,
		isConnected: state.isConnected,
		error: state.error,
		revertState: state.revertState,
	}), [sortedMessages, getPartsForMessage, state.sessionStatus, memoizedPermissions, memoizedQuestions, state.todos, state.isConnected, state.error, state.revertState]);
}
