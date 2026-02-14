/**
 * SSE subscription hook for OpenCode session events.
 *
 * Connects to GET /api/sessions/:id/events, dispatches incoming events into a
 * reducer, and exposes sorted messages, parts, permissions, questions, todos,
 * and connection state.
 */
import { useEffect, useReducer, useRef, useCallback, useMemo } from "react";
import type {
  Message,
  Part,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
  Todo,
  ChatEvent,
} from "../types/opencode";

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
  /** Child session messages keyed by childSessionId → messageId → Message */
  childMessages: Map<string, Map<string, Message>>;
  /** Child session parts keyed by childSessionId → messageId → partId → Part */
  childPartsByMessage: Map<string, Map<string, Map<string, Part>>>;
  /** Child session status keyed by childSessionId */
  childStatus: Map<string, SessionStatus>;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "MESSAGE_UPDATED"; message: Message }
  | { type: "MESSAGE_REMOVED"; messageID: string }
  | { type: "PART_UPDATED"; part: Part }
  | { type: "PART_REMOVED"; messageID: string; partID: string }
  | { type: "SESSION_STATUS"; status: SessionStatus }
  | { type: "PERMISSION_ASKED"; request: PermissionRequest }
  | { type: "PERMISSION_REPLIED"; requestID: string }
  | { type: "QUESTION_ASKED"; request: QuestionRequest }
  | { type: "QUESTION_REPLIED"; requestID: string }
  | { type: "TODO_UPDATED"; todos: Todo[] }
  | {
      type: "SESSION_UPDATED";
      payload: { revert?: { messageID: string; partID?: string } };
    }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED"; error?: string }
  | { type: "SESSION_ERROR"; error: string }
  | { type: "CLEAR" }
  | { type: "INIT_MESSAGES"; messages: Message[]; parts: Part[] }
  | {
      type: "CHILD_MESSAGE_UPDATED";
      childSessionId: string;
      message: Message;
    }
  | {
      type: "CHILD_MESSAGE_REMOVED";
      childSessionId: string;
      messageID: string;
    }
  | { type: "CHILD_PART_UPDATED"; childSessionId: string; part: Part }
  | {
      type: "CHILD_PART_REMOVED";
      childSessionId: string;
      messageID: string;
      partID: string;
    }
  | {
      type: "CHILD_SESSION_STATUS";
      childSessionId: string;
      status: SessionStatus;
    };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: SessionEventState = {
  messages: new Map(),
  partsByMessage: new Map(),
  sessionStatus: { type: "idle" },
  pendingPermissions: new Map(),
  pendingQuestions: new Map(),
  todos: [],
  isConnected: false,
  error: null,
  revertState: null,
  childMessages: new Map(),
  childPartsByMessage: new Map(),
  childStatus: new Map(),
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: SessionEventState, action: Action): SessionEventState {
  switch (action.type) {
    case "MESSAGE_UPDATED": {
      const messages = new Map(state.messages);
      messages.set(action.message.id, action.message);
      return { ...state, messages };
    }

    case "MESSAGE_REMOVED": {
      const messages = new Map(state.messages);
      messages.delete(action.messageID);
      const partsByMessage = new Map(state.partsByMessage);
      partsByMessage.delete(action.messageID);
      return { ...state, messages, partsByMessage };
    }

    case "PART_UPDATED": {
      const partsByMessage = new Map(state.partsByMessage);
      const existing = partsByMessage.get(action.part.messageID);
      const msgParts = new Map(existing ?? []);
      msgParts.set(action.part.id, action.part);
      partsByMessage.set(action.part.messageID, msgParts);
      return { ...state, partsByMessage };
    }

    case "PART_REMOVED": {
      const partsByMessage = new Map(state.partsByMessage);
      const existing = partsByMessage.get(action.messageID);
      const msgParts = new Map(existing ?? []);
      msgParts.delete(action.partID);
      partsByMessage.set(action.messageID, msgParts);
      return { ...state, partsByMessage };
    }

    case "SESSION_STATUS": {
      const updates: Partial<SessionEventState> = {
        sessionStatus: action.status,
      };
      // Clear session error when work resumes (user sent a new message)
      if (action.status.type === "busy") {
        updates.error = null;
      }
      return { ...state, ...updates };
    }

    case "PERMISSION_ASKED": {
      const pendingPermissions = new Map(state.pendingPermissions);
      pendingPermissions.set(action.request.id, action.request);
      return { ...state, pendingPermissions };
    }

    case "PERMISSION_REPLIED": {
      const pendingPermissions = new Map(state.pendingPermissions);
      pendingPermissions.delete(action.requestID);
      return { ...state, pendingPermissions };
    }

    case "QUESTION_ASKED": {
      const pendingQuestions = new Map(state.pendingQuestions);
      pendingQuestions.set(action.request.id, action.request);
      return { ...state, pendingQuestions };
    }

    case "QUESTION_REPLIED": {
      const pendingQuestions = new Map(state.pendingQuestions);
      pendingQuestions.delete(action.requestID);
      return { ...state, pendingQuestions };
    }

    case "TODO_UPDATED":
      return { ...state, todos: action.todos };

    case "SESSION_UPDATED": {
      return {
        ...state,
        revertState: action.payload.revert || null,
      };
    }

    case "CONNECTED":
      return { ...state, isConnected: true, error: null };

    case "DISCONNECTED":
      return { ...state, isConnected: false, error: action.error ?? null };

    case "SESSION_ERROR":
      return { ...state, error: action.error, sessionStatus: { type: "idle" } };

    case "CLEAR":
      return { ...initialState };

    case "INIT_MESSAGES": {
      const messages = new Map<string, Message>();
      const partsByMessage = new Map<string, Map<string, Part>>();
      for (const msg of action.messages) {
        messages.set(msg.id, msg);
      }
      for (const part of action.parts) {
        const msgParts =
          partsByMessage.get(part.messageID) ?? new Map<string, Part>();
        msgParts.set(part.id, part);
        partsByMessage.set(part.messageID, msgParts);
      }
      return { ...state, messages, partsByMessage };
    }

    // -----------------------------------------------------------------
    // Child session events
    // -----------------------------------------------------------------

    case "CHILD_MESSAGE_UPDATED": {
      const childMessages = new Map(state.childMessages);
      const sessionMsgs =
        childMessages.get(action.childSessionId) ?? new Map<string, Message>();
      const updated = new Map(sessionMsgs);
      updated.set(action.message.id, action.message);
      childMessages.set(action.childSessionId, updated);
      return { ...state, childMessages };
    }

    case "CHILD_MESSAGE_REMOVED": {
      const childMessages = new Map(state.childMessages);
      const sessionMsgs = childMessages.get(action.childSessionId);
      if (sessionMsgs) {
        const updated = new Map(sessionMsgs);
        updated.delete(action.messageID);
        childMessages.set(action.childSessionId, updated);
        // Also clean up parts for that message
        const childPartsByMessage = new Map(state.childPartsByMessage);
        const sessionParts = childPartsByMessage.get(action.childSessionId);
        if (sessionParts) {
          const updatedParts = new Map(sessionParts);
          updatedParts.delete(action.messageID);
          childPartsByMessage.set(action.childSessionId, updatedParts);
        }
        return { ...state, childMessages, childPartsByMessage };
      }
      return state;
    }

    case "CHILD_PART_UPDATED": {
      const childPartsByMessage = new Map(state.childPartsByMessage);
      const sessionParts =
        childPartsByMessage.get(action.childSessionId) ??
        new Map<string, Map<string, Part>>();
      const updatedSession = new Map(sessionParts);
      const msgParts =
        updatedSession.get(action.part.messageID) ?? new Map<string, Part>();
      const updatedMsgParts = new Map(msgParts);
      updatedMsgParts.set(action.part.id, action.part);
      updatedSession.set(action.part.messageID, updatedMsgParts);
      childPartsByMessage.set(action.childSessionId, updatedSession);
      return { ...state, childPartsByMessage };
    }

    case "CHILD_PART_REMOVED": {
      const childPartsByMessage = new Map(state.childPartsByMessage);
      const sessionParts = childPartsByMessage.get(action.childSessionId);
      if (sessionParts) {
        const updatedSession = new Map(sessionParts);
        const msgParts = updatedSession.get(action.messageID);
        if (msgParts) {
          const updatedMsgParts = new Map(msgParts);
          updatedMsgParts.delete(action.partID);
          updatedSession.set(action.messageID, updatedMsgParts);
          childPartsByMessage.set(action.childSessionId, updatedSession);
        }
      }
      return { ...state, childPartsByMessage };
    }

    case "CHILD_SESSION_STATUS": {
      const childStatus = new Map(state.childStatus);
      childStatus.set(action.childSessionId, action.status);
      return { ...state, childStatus };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// SSE event → reducer dispatch mapping
// ---------------------------------------------------------------------------

function dispatchChatEvent(
  dispatch: React.Dispatch<Action>,
  event: ChatEvent,
): void {
  switch (event.type) {
    case "message.updated":
      dispatch({ type: "MESSAGE_UPDATED", message: event.properties.info });
      break;
    case "message.removed":
      dispatch({
        type: "MESSAGE_REMOVED",
        messageID: event.properties.messageID,
      });
      break;
    case "message.part.updated":
      dispatch({ type: "PART_UPDATED", part: event.properties.part });
      break;
    case "message.part.removed":
      dispatch({
        type: "PART_REMOVED",
        messageID: event.properties.messageID,
        partID: event.properties.partID,
      });
      break;
    case "session.status":
      dispatch({ type: "SESSION_STATUS", status: event.properties.status });
      break;
    case "session.idle":
      dispatch({ type: "SESSION_STATUS", status: { type: "idle" } });
      break;
    case "permission.asked":
      dispatch({ type: "PERMISSION_ASKED", request: event.properties });
      break;
    case "permission.replied":
      dispatch({
        type: "PERMISSION_REPLIED",
        requestID: event.properties.requestID,
      });
      break;
    case "question.asked":
      dispatch({ type: "QUESTION_ASKED", request: event.properties });
      break;
    case "question.replied":
      dispatch({
        type: "QUESTION_REPLIED",
        requestID: event.properties.requestID,
      });
      break;
    case "question.rejected":
      dispatch({
        type: "QUESTION_REPLIED",
        requestID: event.properties.requestID,
      });
      break;
    case "todo.updated":
      dispatch({ type: "TODO_UPDATED", todos: event.properties.todos });
      break;
    case "session.error": {
      const rawError = event.properties.error;
      const errorStr =
        typeof rawError === "string"
          ? rawError
          : (rawError as any)?.message ||
            (rawError as any)?.name ||
            JSON.stringify(rawError);
      dispatch({ type: "SESSION_ERROR", error: errorStr });
      break;
    }
    case "session.updated": {
      const sessionInfo = (event as any).properties?.info;
      dispatch({
        type: "SESSION_UPDATED",
        payload: { revert: sessionInfo?.revert || null },
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Child SSE event → reducer dispatch mapping
// ---------------------------------------------------------------------------

function dispatchChildEvent(
  dispatch: React.Dispatch<Action>,
  childSessionId: string,
  event: ChatEvent,
): void {
  switch (event.type) {
    case "message.updated":
      dispatch({
        type: "CHILD_MESSAGE_UPDATED",
        childSessionId,
        message: event.properties.info,
      });
      break;
    case "message.removed":
      dispatch({
        type: "CHILD_MESSAGE_REMOVED",
        childSessionId,
        messageID: event.properties.messageID,
      });
      break;
    case "message.part.updated":
      dispatch({
        type: "CHILD_PART_UPDATED",
        childSessionId,
        part: event.properties.part,
      });
      break;
    case "message.part.removed":
      dispatch({
        type: "CHILD_PART_REMOVED",
        childSessionId,
        messageID: event.properties.messageID,
        partID: event.properties.partID,
      });
      break;
    case "session.status":
      dispatch({
        type: "CHILD_SESSION_STATUS",
        childSessionId,
        status: event.properties.status,
      });
      break;
    case "session.idle":
      dispatch({
        type: "CHILD_SESSION_STATUS",
        childSessionId,
        status: { type: "idle" },
      });
      break;
    // We don't forward permission/question/todo/error events for child sessions
    // since those are handled by the parent context
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
          for (const item of record.messages as Array<
            Record<string, unknown>
          >) {
            if (item.info) messages.push(item.info as Message);
            if (Array.isArray(item.parts))
              parts.push(...(item.parts as Part[]));
          }
        } else if (Array.isArray(data)) {
          // Shape: Array<{ info?: Message; role?: string; parts?: Part[] }>
          for (const item of data as Array<Record<string, unknown>>) {
            if (item.info) messages.push(item.info as Message);
            else if (item.role) messages.push(item as unknown as Message);
            if (Array.isArray(item.parts))
              parts.push(...(item.parts as Part[]));
          }
        }

        if (messages.length > 0) {
          dispatch({ type: "INIT_MESSAGES", messages, parts });
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
        dispatch({ type: "DISCONNECTED", error: reason });
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
          type: "DISCONNECTED",
          error: reason ?? "Max reconnection attempts reached",
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
        dispatch({ type: "CONNECTED" });
      };

      es.onmessage = (e: MessageEvent) => {
        try {
          const raw = JSON.parse(e.data as string);
          // Extract _meta tag added by SSE proxy for routing
          const meta = raw?._meta as
            | { sessionId?: string; isParent?: boolean }
            | undefined;

          if (meta && !meta.isParent && meta.sessionId) {
            // Child session event — route to child dispatch
            // Strip _meta before dispatching so downstream code sees a clean ChatEvent
            const { _meta: _, ...cleanEvent } = raw;
            dispatchChildEvent(
              dispatch,
              meta.sessionId,
              cleanEvent as ChatEvent,
            );
          } else {
            // Parent event (or no meta) — normal dispatch
            const { _meta: _, ...cleanEvent } = raw;
            dispatchChatEvent(dispatch, (cleanEvent ?? raw) as ChatEvent);
          }
        } catch {
          // Ignore malformed SSE payloads
        }
      };

      es.onerror = () => {
        if (eventSourceRef.current !== es) return;
        es.close();
        scheduleReconnect("Connection lost");
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
      dispatch({ type: "CLEAR" });
    };
  }, [sessionId]);

  // -----------------------------------------------------------------------
  // Derived helpers
  // -----------------------------------------------------------------------

  /** Messages sorted by creation time (ascending). */
  const sortedMessages = useMemo(
    () =>
      Array.from(state.messages.values()).sort(
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

  /** Get sorted messages for a child session (by creation time). */
  const getChildMessages = useCallback(
    (childSessionId: string): Message[] => {
      const msgs = state.childMessages.get(childSessionId);
      if (!msgs) return [];
      return Array.from(msgs.values()).sort(
        (a, b) => a.time.created - b.time.created,
      );
    },
    [state.childMessages],
  );

  /** Get all parts belonging to a message within a child session. */
  const getChildPartsForMessage = useCallback(
    (childSessionId: string, messageID: string): Part[] => {
      const sessionParts = state.childPartsByMessage.get(childSessionId);
      if (!sessionParts) return [];
      const msgParts = sessionParts.get(messageID);
      return msgParts ? Array.from(msgParts.values()) : [];
    },
    [state.childPartsByMessage],
  );

  /** Get the status of a child session. */
  const getChildStatus = useCallback(
    (childSessionId: string): SessionStatus => {
      return state.childStatus.get(childSessionId) ?? { type: "idle" };
    },
    [state.childStatus],
  );

  /** Set of all child session IDs that have received at least one event. */
  const liveChildSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of state.childMessages.keys()) ids.add(key);
    for (const key of state.childPartsByMessage.keys()) ids.add(key);
    for (const key of state.childStatus.keys()) ids.add(key);
    return ids;
  }, [state.childMessages, state.childPartsByMessage, state.childStatus]);

  return useMemo(
    () => ({
      messages: sortedMessages,
      getPartsForMessage,
      sessionStatus: state.sessionStatus,
      pendingPermissions: memoizedPermissions,
      pendingQuestions: memoizedQuestions,
      todos: state.todos,
      isConnected: state.isConnected,
      error: state.error,
      revertState: state.revertState,
      // Child session live data
      getChildMessages,
      getChildPartsForMessage,
      getChildStatus,
      liveChildSessionIds,
    }),
    [
      sortedMessages,
      getPartsForMessage,
      state.sessionStatus,
      memoizedPermissions,
      memoizedQuestions,
      state.todos,
      state.isConnected,
      state.error,
      state.revertState,
      getChildMessages,
      getChildPartsForMessage,
      getChildStatus,
      liveChildSessionIds,
    ],
  );
}
