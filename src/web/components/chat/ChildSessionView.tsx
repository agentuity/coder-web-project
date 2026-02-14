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
import { TextPartView } from "./TextPartView";
import { ToolCallCard } from "./ToolCallCard";
import type {
  Message,
  Part,
  ReasoningPart,
  ToolPart,
} from "../../types/opencode";
import type { ChildSessionData } from "../../hooks/useChildSessions";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import { MessageResponse } from "../ai-elements/message";
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
}: ChildSessionViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ChildSessionData | null>(
    initialData ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch child session data when expanded for the first time
  useEffect(() => {
    if (!isExpanded || data || isLoading) return;

    let isMounted = true;

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

        if (isMounted) {
          setData(result);
          if (!result) setError("No data returned");
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load child session",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, [
    isExpanded,
    data,
    isLoading,
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
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading sub-agent conversation...
            </div>
          )}

          {error && (
            <div className="py-3 text-xs text-red-400">
              Failed to load: {error}
            </div>
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

                // Determine if this is the last assistant message being streamed
                const isLastAssistant =
                  isLive &&
                  message.role === "assistant" &&
                  msgIndex === messages.length - 1;

                return (
                  <div key={message.id}>
                    {/* Agent/role indicator */}
                    {message.role === "assistant" && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0"
                        >
                          {(message as { agent?: string }).agent
                            ? getAgentBadge(
                                (message as { agent: string }).agent,
                              )
                            : "Assistant"}
                        </Badge>
                        {(message as { cost?: number }).cost != null &&
                          (message as { cost: number }).cost > 0 && (
                            <span className="text-[9px] text-[var(--muted-foreground)]">
                              ${(message as { cost: number }).cost.toFixed(4)}
                            </span>
                          )}
                      </div>
                    )}
                    {message.role === "user" && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0"
                        >
                          User
                        </Badge>
                      </div>
                    )}

                    {/* Render parts */}
                    {parts.map((part) => {
                      switch (part.type) {
                        case "text":
                          return (
                            <MessageResponse key={part.id}>
                              <TextPartView
                                part={part}
                                isStreaming={isLastAssistant}
                              />
                            </MessageResponse>
                          );
                        case "reasoning":
                          return (
                            <Reasoning
                              key={part.id}
                              defaultOpen={isLastAssistant}
                              duration={
                                (part as ReasoningPart).time?.end
                                  ? Math.max(
                                      1,
                                      Math.ceil(
                                        ((part as ReasoningPart).time.end! -
                                          (part as ReasoningPart).time.start) /
                                          1000,
                                      ),
                                    )
                                  : undefined
                              }
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>
                                {(part as ReasoningPart).text}
                              </ReasoningContent>
                            </Reasoning>
                          );
                        case "tool":
                          return (
                            <ToolCallCard
                              key={part.id}
                              part={part as ToolPart}
                            />
                          );
                        default:
                          return null;
                      }
                    })}
                  </div>
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
        </div>
      )}
    </div>
  );
}
