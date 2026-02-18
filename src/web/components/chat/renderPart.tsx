/**
 * Shared renderPart utility — renders a single message Part into a React node.
 *
 * Used by both ChatPage and ChildSessionView so that all 12 part types
 * are handled consistently in one place.
 */
import type { ReactNode } from "react";
import type {
  Message as ChatMessage,
  Part,
  ReasoningPart,
  ToolPart,
} from "../../types/opencode";
import { TextPartView } from "./TextPartView";
import { ToolCallCard } from "./ToolCallCard";
import { FilePartView } from "./FilePartView";
import { SubtaskView } from "./SubtaskView";
import { MessageResponse } from "../ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import { AgentDisplay } from "../ai-elements/agent";
import type { SourceItem } from "./SourcesView";
import type { SelectedLineRange, DiffLineAnnotation } from "@pierre/diffs";
import type { CodeComment } from "../../hooks/useCodeComments";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface RenderPartOptions {
  part: Part;
  message: ChatMessage;
  /** Whether the overall session is actively streaming. */
  isStreaming?: boolean;
  /**
   * Whether `message` is the last assistant message. Combined with
   * `isStreaming` to determine effective streaming state for text /
   * reasoning parts.
   */
  isLastAssistantMessage?: boolean;

  // ChatPage-only features (all optional — ChildSessionView omits these)
  onAddComment?: (
    file: string,
    selection: SelectedLineRange,
    comment: string,
    origin: "diff" | "file",
  ) => void;
  getDiffAnnotations?: (
    file: string,
  ) => DiffLineAnnotation<{ id: string; comment: string }>[];
  getFileComments?: (file: string) => CodeComment[];
  sources?: SourceItem[];
  /** Callback to lazily resolve sources per tool part (alternative to static `sources`). */
  getSourcesForToolPart?: (part: ToolPart) => SourceItem[] | undefined;
  sessionId?: string;
  archived?: boolean;
  childSessions?: Array<{
    id: string;
    opencodeSessionId: string;
    parentSessionId: string | null;
    title: string | null;
    totalCost: number;
    totalTokens: number;
    messageCount: number;
    timeCreated: string | number | null;
    metadata?: Record<string, unknown> | null;
  }>;
  fetchChildData?: (childId: string) => Promise<unknown>;
  getChildMessages?: (
    childSessionId: string,
  ) => import("../../types/opencode").Message[];
  getChildPartsForMessage?: (
    childSessionId: string,
    messageID: string,
  ) => import("../../types/opencode").Part[];
  getChildStatus?: (
    childSessionId: string,
  ) => import("../../types/opencode").SessionStatus;
  liveChildSessionIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderPart(options: RenderPartOptions): ReactNode {
  const {
    part,
    message,
    isStreaming = false,
    isLastAssistantMessage = false,
    onAddComment,
    getDiffAnnotations,
    getFileComments,
    sources,
    getSourcesForToolPart,
    sessionId,
    archived,
    childSessions,
    fetchChildData,
    getChildMessages,
    getChildPartsForMessage,
    getChildStatus,
    liveChildSessionIds,
  } = options;

  /** Effective "this part is being streamed right now" flag. */
  const shouldStream = isStreaming && isLastAssistantMessage;

  switch (part.type) {
    case "text":
      return (
        <MessageResponse key={part.id}>
          <TextPartView part={part} isStreaming={shouldStream} />
        </MessageResponse>
      );

    case "reasoning": {
      const rp = part as ReasoningPart;
      const duration = rp.time.end
        ? Math.max(1, Math.ceil((rp.time.end - rp.time.start) / 1000))
        : undefined;
      return (
        <Reasoning
          key={part.id}
          defaultOpen={shouldStream}
          duration={duration}
          isStreaming={shouldStream}
        >
          <ReasoningTrigger />
          <ReasoningContent>{rp.text}</ReasoningContent>
        </Reasoning>
      );
    }

    case "tool":
      return (
        <ToolCallCard
          key={part.id}
          part={part as ToolPart}
          onAddComment={onAddComment}
          getDiffAnnotations={getDiffAnnotations}
          getFileComments={getFileComments}
          sources={sources ?? getSourcesForToolPart?.(part as ToolPart)}
          sessionId={sessionId}
          archived={archived}
          childSessions={childSessions}
          fetchChildData={fetchChildData}
          getChildMessages={getChildMessages}
          getChildPartsForMessage={getChildPartsForMessage}
          getChildStatus={getChildStatus}
          liveChildSessionIds={liveChildSessionIds}
        />
      );

    case "file":
      return <FilePartView key={part.id} part={part} sessionId={sessionId} />;

    case "subtask":
      return <SubtaskView key={part.id} part={part} />;

    case "agent":
      return <AgentDisplay key={part.id} name={part.name} />;

    case "step-finish":
      return null;

    case "patch":
      return (
        <div
          key={part.id}
          className="rounded-lg border border-[var(--border)] px-3 py-2"
        >
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span>Files changed ({part.files.length})</span>
          </div>
          <div className="mt-1 space-y-0.5">
            {part.files.map((file) => (
              <div
                key={file}
                className="text-xs font-mono text-[var(--foreground)]"
              >
                {file}
              </div>
            ))}
          </div>
        </div>
      );

    case "snapshot":
      return (
        <div
          key={part.id}
          className="text-[10px] italic text-[var(--muted-foreground)]"
        >
          {"📸"} Context snapshot saved
        </div>
      );

    case "compaction":
      return (
        <div
          key={part.id}
          className="text-[10px] italic text-[var(--muted-foreground)]"
        >
          {"🗜️"} Context compacted{part.auto ? " (auto)" : ""}
        </div>
      );

    case "retry":
      return (
        <div
          key={part.id}
          className="flex items-center gap-2 text-xs text-yellow-500"
        >
          <span>
            Retry attempt {part.attempt}:{" "}
            {part.error.message || part.error.type}
          </span>
        </div>
      );

    case "step-start":
      return null;

    default:
      return null;
  }
}
