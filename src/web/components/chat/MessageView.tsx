/**
 * MessageView — shared message renderer used by both ChatPage and
 * ChildSessionView. Renders a single message with optional chain grouping,
 * toolbars, and error display.
 */
import type { ReactNode } from "react";
import type {
  Message as ChatMessage,
  Part,
  ToolPart,
} from "../../types/opencode";
import type { RenderPartOptions } from "./renderPart";
import { renderPart } from "./renderPart";
import { groupPartsIntoChains, type ChainGroup } from "./chainGrouping";
import { ChainOfThought } from "../ai-elements/chain-of-thought";
import {
  Message,
  MessageContent,
  MessageToolbar,
} from "../ai-elements/message";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageViewProps {
  message: ChatMessage;
  parts: Part[];

  /**
   * Rendering context passed through to renderPart. Omit `part` and `message`
   * since MessageView supplies those per-part.
   */
  renderOptions?: Omit<RenderPartOptions, "part" | "message">;

  /** Enable read→edit chain grouping into collapsible sections (default true). */
  enableChainGrouping?: boolean;

  /** Optional toolbar rendered below the message (ChatPage uses Copy/Restore). */
  toolbar?: ReactNode;

  /** Error info from the message (typically `message.error` on assistant messages). */
  errorInfo?: {
    message?: string;
    type?: string;
    data?: Record<string, unknown>;
  };

  /** Additional class names on the wrapper div. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageView({
  message,
  parts,
  renderOptions,
  enableChainGrouping = true,
  toolbar,
  errorInfo,
  className,
}: MessageViewProps) {
  const from = message.role === "user" ? "user" : "assistant";
  const agent =
    "agent" in message ? (message as { agent?: string }).agent : undefined;

  const renderedParts = enableChainGrouping
    ? groupPartsIntoChains(parts)
    : parts;

  return (
    <div className={className}>
      <Message from={from}>
        <MessageContent>
          {agent && from === "assistant" && (
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {agent}
            </div>
          )}
          {from === "user" && !agent && (
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              User
            </div>
          )}
          {renderedParts.map((part) => {
            if ("type" in part && part.type === "chain") {
              const chain = part as ChainGroup;
              return (
                <ChainOfThought
                  key={`chain-${chain.filePath}-${chain.parts[0]?.id ?? "start"}`}
                  filePath={chain.filePath}
                  stepCount={chain.parts.length}
                >
                  {chain.parts.map((chainPart) =>
                    renderPart({
                      part: chainPart,
                      message,
                      ...renderOptions,
                    }),
                  )}
                </ChainOfThought>
              );
            }
            return renderPart({
              part: part as Part,
              message,
              ...renderOptions,
            });
          })}
          {errorInfo && <ErrorDisplay errorInfo={errorInfo} />}
        </MessageContent>
        {toolbar && <MessageToolbar>{toolbar}</MessageToolbar>}
      </Message>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error display (extracted from ChatPage's inline IIFE)
// ---------------------------------------------------------------------------

function ErrorDisplay({
  errorInfo,
}: {
  errorInfo: NonNullable<MessageViewProps["errorInfo"]>;
}) {
  const errAny = errorInfo as Record<string, any>;
  const errorData =
    typeof errAny.data === "object" && errAny.data ? errAny.data : {};
  const errorText =
    errorInfo.message ||
    errorData.message ||
    errAny.name ||
    errorInfo.type ||
    "";
  const isAbort =
    !errorText ||
    (/abort/i.test(errorText) &&
      !/no.access|unauthorized|forbidden|403/i.test(errorText)) ||
    /abort/i.test(errorInfo.type || "");

  if (isAbort) {
    return (
      <div className="rounded-lg border border-zinc-600/30 bg-zinc-700/10 px-3 py-2 text-sm text-zinc-400">
        Response stopped
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
      Error: {errorText}
    </div>
  );
}
