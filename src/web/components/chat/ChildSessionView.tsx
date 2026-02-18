/**
 * ChildSessionView — renders a sub-agent's conversation inline within the
 * parent chat. Fetches child session messages and renders them with the same
 * components used for the main conversation (TextPartView, ToolCallCard, etc.)
 * in a visually-distinguished indented container.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Hash,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Badge } from "../ui/badge";
import type { Message, Part } from "../../types/opencode";
import type { ChildSessionData } from "../../hooks/useChildSessions";
import { MessageView } from "./MessageView";
import { apiFetch } from "../../lib/api";

// ---------------------------------------------------------------------------
// Agent label helper (same as ToolCallCard)
// ---------------------------------------------------------------------------

function getAgentBadge(agent: string): string {
  const normalized = agent.replace("Agentuity Coder ", "").trim();
  const labels: Record<string, string> = {
    Lead: "Lead",
    Scout: "Scout",
    Builder: "Builder",
    Architect: "Architect",
    Reviewer: "Reviewer",
    Memory: "Memory",
    Expert: "Expert",
    Runner: "Runner",
    Product: "Product",
    Monitor: "Monitor",
  };
  return labels[normalized] ?? normalized;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChildSessionViewProps {
  /** The archived child session ID (UUID from archive tables) */
  childSessionId: string;
  /** The parent chat session's DB id */
  parentSessionId: string;
  /** Agent name/type to display */
  agentName?: string;
  /** Description from the tool invocation */
  description?: string;
  /** Whether the parent session is archived */
  archived?: boolean;
  /** Pre-loaded child data (if available from cache) */
  initialData?: ChildSessionData | null;
  /** Callback to fetch child data (from useChildSessions hook) */
  fetchChildData?: (childId: string) => Promise<ChildSessionData | null>;
  /** Live streaming messages for this child session (from useSessionEvents) */
  liveMessages?: Message[];
  /** Callback to get live parts for a message in this child session */
  liveGetParts?: (messageID: string) => Part[];
  /** Live session status for this child (from useSessionEvents) */
  liveStatus?: { type: string };
  /** When true, auto-expand and skip the header/indent styling (used inside a Dialog) */
  isModal?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChildSessionView({
  childSessionId,
  parentSessionId,
  agentName,
  description,
  archived = false,
  initialData,
  fetchChildData,
  liveMessages,
  liveGetParts,
  liveStatus,
  isModal = false,
}: ChildSessionViewProps) {
  const [isExpanded, setIsExpanded] = useState(isModal);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ChildSessionData | null>(
    initialData ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch child session data when expanded for the first time.
  // NOTE: Do NOT use an `isMounted` pattern here — polling-driven re-renders
  // cause React to unmount/remount this component while reusing the fiber
  // (refs persist but effect cleanup sets isMounted=false), which drops the
  // fetch result. React 18 safely ignores setState on unmounted components,
  // so we always call setData/setIsLoading after fetch completes.
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!isExpanded || data || isFetchingRef.current) return;
    isFetchingRef.current = true;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let result: ChildSessionData | null = null;

        if (fetchChildData) {
          result = await fetchChildData(childSessionId);
        } else {
          // Fallback: direct API call
          const url = archived
            ? `/api/sessions/${parentSessionId}/archive/children/${childSessionId}`
            : `/api/sessions/${parentSessionId}/children/${childSessionId}`;
          const res = await apiFetch(url);
          result = (await res.json()) as ChildSessionData;
        }

        if (result) {
          setData(result);
        } else {
          setError("No data returned from server");
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load child session";
        setError(msg);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [
    isExpanded,
    data,
    childSessionId,
    parentSessionId,
    archived,
    fetchChildData,
  ]);

  // Determine if we have live streaming data for this child
  const hasLiveData = liveMessages !== undefined && liveMessages.length > 0;
  const isLive = liveStatus?.type === "busy";

  // Build messages: merge fetched (archived/historical) + live streaming data.
  // Live messages take priority (they're more current).
  const messages = useMemo(() => {
    const msgMap = new Map<string, Message>();

    // First, add fetched (historical) messages
    if (data?.messages) {
      for (const msg of data.messages as Message[]) {
        msgMap.set(msg.id, msg);
      }
    }

    // Then overlay live messages (more recent state wins)
    if (liveMessages) {
      for (const msg of liveMessages) {
        msgMap.set(msg.id, msg);
      }
    }

    return Array.from(msgMap.values()).sort(
      (a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0),
    );
  }, [data?.messages, liveMessages]);

  // Build parts map: merge fetched + live parts
  const partsByMessage = useMemo(() => {
    const map = new Map<string, Part[]>();

    // Add fetched parts
    if (data?.parts) {
      for (const part of data.parts as Part[]) {
        const existing = map.get(part.messageID) ?? [];
        existing.push(part);
        map.set(part.messageID, existing);
      }
    }

    return map;
  }, [data?.parts]);

  const getPartsForMessage = useCallback(
    (messageID: string): Part[] => {
      // Live parts take priority (more current streaming state)
      if (liveGetParts) {
        const liveParts = liveGetParts(messageID);
        if (liveParts.length > 0) return liveParts;
      }
      return partsByMessage.get(messageID) ?? [];
    },
    [partsByMessage, liveGetParts],
  );

  // Auto-scroll to bottom when live-streaming new content
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTrigger = messages.length + (liveMessages?.length ?? 0);
  useEffect(() => {
    if (isExpanded && isLive && scrollRef.current && scrollTrigger > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isExpanded, isLive, scrollTrigger]);

  // Stats
  const stats = data?.session;
  const displayAgent = agentName
    ? getAgentBadge(agentName)
    : stats?.title || "Sub-agent";

  // -------------------------------------------------------------------------
  // Shared content (used by both modal and inline modes)
  // -------------------------------------------------------------------------
  const renderContent = () => (
    <>
      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading sub-agent conversation...
        </div>
      )}

      {error && (
        <div className="py-3 text-xs text-red-400">Failed to load: {error}</div>
      )}

      {!hasLiveData && data && messages.length === 0 && !isLoading && (
        <div className="py-3 text-xs text-[var(--muted-foreground)]">
          No messages in this sub-agent session.
        </div>
      )}

      {messages.length > 0 && (
        <div className="space-y-3 py-2">
          {messages.map((message, msgIndex) => {
            const parts = getPartsForMessage(message.id);
            if (parts.length === 0) return null;

            return (
              <MessageView
                key={message.id}
                message={message}
                parts={parts}
                renderOptions={{
                  isStreaming: isLive,
                  isLastAssistantMessage:
                    message.role === "assistant" &&
                    msgIndex === messages.length - 1,
                  sessionId: parentSessionId,
                  archived,
                }}
                enableChainGrouping
              />
            );
          })}
          {/* Live streaming indicator */}
          {isLive && (
            <div className="flex items-center gap-2 py-1 text-xs text-[var(--muted-foreground)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Sub-agent is working...</span>
            </div>
          )}
        </div>
      )}
    </>
  );

  // -------------------------------------------------------------------------
  // Modal mode: render content directly (no header, no indent, no height cap)
  // -------------------------------------------------------------------------
  if (isModal) {
    return <div ref={scrollRef}>{renderContent()}</div>;
  }

  // -------------------------------------------------------------------------
  // Inline mode: original expand/collapse behaviour
  // -------------------------------------------------------------------------
  return (
    <div className="mt-2 mb-1">
      {/* Collapsed / Expand header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-left transition-colors hover:bg-[var(--muted)]/70"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
        )}
        <Bot className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
        <span className="text-xs font-medium text-[var(--foreground)] truncate">
          {displayAgent}
        </span>
        {(isLive || (hasLiveData && !data)) && (
          <Badge
            variant="secondary"
            className="text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30 animate-pulse"
          >
            <span className="mr-0.5">●</span> Live
          </Badge>
        )}
        {description && (
          <>
            <span className="text-xs text-[var(--muted-foreground)]">·</span>
            <span className="text-xs text-[var(--muted-foreground)] truncate">
              {description}
            </span>
          </>
        )}
        <span className="ml-auto" />
        {/* Stats badges */}
        {stats && (
          <div className="flex items-center gap-2 shrink-0">
            {stats.messageCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--muted-foreground)]">
                <MessageSquare className="h-3 w-3" />
                {stats.messageCount}
              </span>
            )}
            {stats.totalTokens > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--muted-foreground)]">
                <Hash className="h-3 w-3" />
                {stats.totalTokens > 1000
                  ? `${(stats.totalTokens / 1000).toFixed(1)}k`
                  : stats.totalTokens}
              </span>
            )}
            {stats.totalCost > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--muted-foreground)]">
                <DollarSign className="h-3 w-3" />
                {stats.totalCost < 0.01
                  ? stats.totalCost.toFixed(4)
                  : stats.totalCost.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="ml-2 mt-1 rounded-md border-l-2 border-[var(--border)] pl-3 pb-2 max-h-[600px] overflow-y-auto"
        >
          {renderContent()}
        </div>
      )}
    </div>
  );
}
