import React, { useMemo, useState } from "react";
import type { ToolPart } from "../../types/opencode";
import { FileDiff as PierreDiff } from "@pierre/diffs/react";
import {
  parseDiffFromFile,
  type DiffLineAnnotation,
  type SelectedLineRange,
} from "@pierre/diffs";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { getLangFromPath } from "../../lib/shiki";
import { parseFileOutput } from "../../lib/file-output";
import { CodeWithComments } from "./CodeWithComments";
import type { CodeComment } from "../../hooks/useCodeComments";
import { Commit } from "../ai-elements/commit";
import { Streamdown } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../ai-elements/tool";
import type { ToolState, ToolStatus } from "../ai-elements/tool";
import { SourcesView, type SourceItem } from "./SourcesView";
import { ChildSessionView } from "./ChildSessionView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";

const toolCallCodePlugin = createCodePlugin({
  themes: ["github-dark", "github-light"],
});

/** Chrome DevTools screenshot tool name. */
const SCREENSHOT_TOOL = "chrome-devtools_take_screenshot";

/** Chrome DevTools a11y snapshot tool name. */
const SNAPSHOT_TOOL = "chrome-devtools_take_snapshot";

/** Sub-agent tool names that create child sessions. */
const SUB_AGENT_TOOLS = new Set(["task"]);

interface ToolCallCardProps {
  part: ToolPart;
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
  /** Parent session ID — needed for sub-agent inspection API calls */
  sessionId?: string;
  /** Whether the parent session is archived */
  archived?: boolean;
  /** Child sessions list (from useChildSessions) for matching tool calls to child sessions */
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
  /** Callback to fetch full child session data */
  fetchChildData?: (childId: string) => Promise<unknown>;
  /** Get live streaming messages for a child session ID */
  getChildMessages?: (
    childSessionId: string,
  ) => import("../../types/opencode").Message[];
  /** Get live streaming parts for a child session + message */
  getChildPartsForMessage?: (
    childSessionId: string,
    messageID: string,
  ) => import("../../types/opencode").Part[];
  /** Get live session status for a child session */
  getChildStatus?: (
    childSessionId: string,
  ) => import("../../types/opencode").SessionStatus;
  /** Set of child session IDs that have received live events */
  liveChildSessionIds?: Set<string>;
}

function getToolDisplayName(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Tool-type detection helpers
// ---------------------------------------------------------------------------

function isEditTool(input: Record<string, unknown>): input is Record<
  string,
  unknown
> & {
  filePath: string;
  oldString: string;
  newString: string;
} {
  return (
    typeof input.filePath === "string" &&
    typeof input.oldString === "string" &&
    typeof input.newString === "string"
  );
}

function isBashTool(input: Record<string, unknown>): input is Record<
  string,
  unknown
> & {
  command: string;
} {
  return typeof input.command === "string";
}

function isWebFetchTool(input: Record<string, unknown>): input is Record<
  string,
  unknown
> & {
  url: string;
} {
  return typeof input.url === "string";
}

function isWriteTool(input: Record<string, unknown>): input is Record<
  string,
  unknown
> & {
  filePath: string;
  content: string;
} {
  return (
    typeof input.filePath === "string" &&
    typeof input.content === "string" &&
    typeof input.oldString !== "string"
  );
}

function isReadTool(input: Record<string, unknown>): input is Record<
  string,
  unknown
> & {
  filePath: string;
} {
  return (
    typeof input.filePath === "string" &&
    typeof input.oldString !== "string" &&
    typeof input.content !== "string" &&
    typeof input.command !== "string"
  );
}

function isAgentInvocation(input: Record<string, unknown>): input is Record<
  string,
  unknown
> & {
  subagent_type?: string;
  description?: string;
  prompt?: string;
} {
  return typeof input.subagent_type === "string";
}

/** Extract the agent name from `subagent_type` (task tool). */
function getAgentName(input: Record<string, unknown>): string {
  return (input.subagent_type as string) ?? "unknown";
}

/** Extract the prompt content from `prompt` (task tool). */
function getAgentPrompt(input: Record<string, unknown>): string | undefined {
  return (input.prompt as string) ?? undefined;
}

function isGitCommand(command: string) {
  return command.trim().startsWith("git ") || command.includes(" git ");
}

function parseGitFiles(
  output?: string,
): Array<{ path: string; status: "added" | "modified" | "deleted" }> {
  if (!output) return [];
  const files: Array<{
    path: string;
    status: "added" | "modified" | "deleted";
  }> = [];
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([MADRCU?!]{1,2})\s+(.+)$/);
    if (!match) continue;
    const statusToken = match[1] ?? "";
    const path = match[2] ?? "";
    if (!path) continue;
    const status: "added" | "modified" | "deleted" = statusToken.includes("A")
      ? "added"
      : statusToken.includes("D")
        ? "deleted"
        : "modified";
    files.push({ path, status });
  }
  return files;
}

function parseGitCommitInfo(
  command: string,
  output?: string,
): {
  message: string;
  hash?: string;
  files?: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
} {
  const outputText = output ?? "";
  const commitLineMatch = outputText.match(
    /^\[(.+?)\s+([0-9a-f]{7,40})\]\s+(.+)$/m,
  );
  const messageFromOutput = commitLineMatch?.[3];
  const hashFromOutput =
    commitLineMatch?.[2] ??
    outputText.match(/\bcommit\s+([0-9a-f]{7,40})\b/i)?.[1];
  const messageFromCommand = command.match(/-m\s+["']([^"']+)["']/)?.[1];
  const message = messageFromOutput || messageFromCommand || `Git: ${command}`;
  const files = parseGitFiles(outputText);
  return {
    message,
    hash: hashFromOutput,
    files: files.length > 0 ? files : undefined,
  };
}

// ---------------------------------------------------------------------------
// Language detection helper for @pierre/diffs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Parse read tool output — strip <file> tags and line number prefixes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Specialised sub-views
// ---------------------------------------------------------------------------

function shortenPath(filePath: string): string {
  // Show at most the last 3 segments
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return "…/" + parts.slice(-3).join("/");
}

function getAgentBadge(agent: string) {
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
  };
  return labels[normalized] ?? normalized;
}

/** Format a cost value as currency string (e.g. "$0.05"). Returns empty string if cost is 0 or falsy. */
function formatCost(cost: number | undefined | null): string {
  if (!cost || cost <= 0) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

/** Clean a child session title by removing the "(@Agentuity Coder X subagent)" suffix and truncating. */
function cleanChildTitle(
  title: string | null | undefined,
  maxLen = 50,
): string {
  if (!title) return "";
  const cleaned = title
    .replace(/\s*\(@Agentuity Coder\s+\w+\s+subagent\)/i, "")
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + "\u2026";
}

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (
      !text ||
      typeof window === "undefined" ||
      !navigator?.clipboard?.writeText
    )
      return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy errors
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--foreground)]"
      title={copied ? "Copied" : label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      <span className="sr-only">{copied ? "Copied" : label}</span>
    </button>
  );
}

function AgentInvocationView({
  input,
}: {
  input: {
    subagent_type?: string;
    description?: string;
    prompt?: string;
  };
}) {
  const prompt = getAgentPrompt(input);
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <span className="truncate">{input.description ?? "Agent task"}</span>
      </div>
      {prompt && (
        <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-[11px] font-mono text-[var(--foreground)] overflow-hidden leading-relaxed max-h-64 overflow-y-auto [&_h1]:text-[11px] [&_h1]:font-bold [&_h1]:font-mono [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-[11px] [&_h2]:font-bold [&_h2]:font-mono [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:font-mono [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_p]:text-[11px] [&_p]:my-1 [&_li]:text-[11px] [&_ul]:my-1 [&_ol]:my-1 [&_pre]:text-[10px] [&_pre]:my-1 [&_pre]:p-2 [&_code]:text-[10px] [&_table]:text-[10px] [&_th]:text-[10px] [&_th]:px-1.5 [&_th]:py-0.5 [&_td]:text-[10px] [&_td]:px-1.5 [&_td]:py-0.5 [&_blockquote]:text-[11px]">
          <Streamdown plugins={{ code: toolCallCodePlugin }}>
            {prompt}
          </Streamdown>
        </div>
      )}
    </div>
  );
}

function DiffView({
  filePath,
  oldString,
  newString,
  onAddComment,
  annotations,
}: {
  filePath: string;
  oldString: string;
  newString: string;
  onAddComment?: (
    file: string,
    selection: SelectedLineRange,
    comment: string,
    origin: "diff" | "file",
  ) => void;
  annotations?: DiffLineAnnotation<{ id: string; comment: string }>[];
}) {
  const lang = getLangFromPath(filePath) as any;
  const fileName = filePath.split("/").pop() || filePath;
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(
    null,
  );
  const [commentText, setCommentText] = useState("");
  const diffText = useMemo(
    () =>
      `--- ${filePath}\n+++ ${filePath}\n\n--- Original\n${oldString}\n\n+++ Updated\n${newString}`,
    [filePath, oldString, newString],
  );

  const diffData = useMemo(() => {
    try {
      return parseDiffFromFile(
        { name: fileName, contents: oldString, lang },
        { name: fileName, contents: newString, lang },
      );
    } catch {
      return null;
    }
  }, [fileName, oldString, newString, lang]);

  const handleAddComment = () => {
    if (!onAddComment || !selectedRange) return;
    const trimmed = commentText.trim();
    if (!trimmed) return;
    onAddComment(filePath, selectedRange, trimmed, "diff");
    setCommentText("");
    setSelectedRange(null);
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)] group">
        <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
          edit
        </span>
        <span className="font-mono truncate" title={filePath}>
          {shortenPath(filePath)}
        </span>
        <span className="ml-auto" />
        <CopyButton text={diffText} label="Copy diff" />
      </div>
      <div className="rounded-md border border-[var(--border)] overflow-hidden max-h-72 overflow-y-auto overflow-x-auto [&_pre]:!text-[11px] [&_pre]:!leading-[1.6]">
        {diffData ? (
          <PierreDiff
            fileDiff={diffData}
            selectedLines={selectedRange}
            lineAnnotations={annotations}
            renderAnnotation={(annotation) => (
              <div className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] text-[var(--foreground)] shadow-sm">
                {annotation.metadata?.comment ?? "Comment"}
              </div>
            )}
            options={{
              theme: { dark: "github-dark", light: "github-light" },
              themeType: "system",
              disableFileHeader: true,
              diffStyle: "unified",
              diffIndicators: "bars",
              enableLineSelection: true,
              onLineSelected: (range) => setSelectedRange(range),
            }}
          />
        ) : (
          <div className="px-2 py-1 text-xs text-[var(--muted-foreground)]">
            Unable to render diff
          </div>
        )}
      </div>
      {onAddComment && selectedRange && (
        <div className="mt-2 flex gap-2">
          <input
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="Add a comment"
            className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={handleAddComment}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

function BashView({ command, output }: { command: string; output?: string }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {/* Command */}
      <div className="rounded-md bg-[var(--muted)] border border-[var(--border)] px-3 py-2 font-mono text-xs text-green-400 dark:text-green-400 whitespace-pre-wrap break-all">
        <span className="select-none text-[var(--muted-foreground)] mr-1">
          $
        </span>
        {command}
      </div>
      {/* Output */}
      {output && (
        <div className="group">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">
            <span>Output</span>
            <CopyButton text={output} label="Copy output" />
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-64 overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Renders Chrome DevTools screenshot output as an inline image. */
function ScreenshotView({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const output = part.state.status === "completed" ? part.state.output : "";

  const imageSrc = useMemo(() => {
    // 1. Check attachments first (OpenCode sends MCP images as FilePart attachments)
    if (part.state.status === "completed" && part.state.attachments?.length) {
      const imageAttachment = part.state.attachments.find((a) =>
        a.mime?.startsWith("image/")
      );
      if (imageAttachment?.url) return imageAttachment.url;
    }

    // 2. Fall back to parsing the output string
    if (!output) return null;
    const trimmed = output.trim();

    // Direct data URL
    if (trimmed.startsWith("data:image/")) return trimmed;

    // Try JSON parse
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.data && parsed.mimeType?.startsWith("image/")) {
        return `data:${parsed.mimeType};base64,${parsed.data}`;
      }
      if (typeof parsed.image === "string" && parsed.image.startsWith("data:image/")) {
        return parsed.image;
      }
      if (typeof parsed.url === "string" && parsed.url.startsWith("data:image/")) {
        return parsed.url;
      }
    } catch {
      // Not JSON — try other patterns
    }

    // Markdown image syntax: ![alt](data:image/...)
    const mdMatch = trimmed.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];

    // Data URL anywhere in string
    const dataUrlMatch = trimmed.match(/(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)/);
    if (dataUrlMatch) return dataUrlMatch[1];

    return null;
  }, [part.state, output]);

  if (!imageSrc || imgError) {
    // Fallback to text output if we can't extract an image
    return (
      <div className="px-3 py-2">
        <ToolOutput output={output} />
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="block cursor-pointer rounded-lg border border-[var(--border)] overflow-hidden hover:opacity-90 transition-opacity"
      >
        <img
          src={imageSrc}
          alt="Screenshot"
          loading="lazy"
          className={expanded ? "max-w-full" : "max-w-sm max-h-64 object-contain"}
          onError={() => setImgError(true)}
        />
      </button>
      <p className="text-[10px] text-[var(--muted-foreground)]">
        {expanded ? "Click to collapse" : "Click to expand"}
      </p>
    </div>
  );
}

/** Renders Chrome DevTools a11y tree snapshot in a human-readable format. */
function SnapshotView({ output }: { output: string }) {
  const [expanded, setExpanded] = useState(false);

  const nodes = useMemo(() => {
    if (!output) return [];
    // Split on uid= boundaries to get individual nodes
    // Each node looks like: uid=X_Y role "name" attr1 attr2="value" ...
    const nodeRegex = /uid=(\S+)\s+(\w+)(?:\s+"([^"]*)")?([^\n]*?)(?=(?:\s+uid=)|$)/g;
    const results: Array<{
      uid: string;
      role: string;
      name: string;
      attrs: Record<string, string>;
      depth: number;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(output)) !== null) {
      const uid = match[1] ?? "";
      const role = match[2] ?? "";
      const name = match[3] ?? "";
      const attrStr = match[4] ?? "";

      // Parse attributes like url="..." description="..." expandable haspopup="menu"
      const attrs: Record<string, string> = {};
      const attrRegex = /(\w+)(?:="([^"]*)")?/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrStr.trim())) !== null) {
        const key = attrMatch[1];
        if (key) attrs[key] = attrMatch[2] ?? "true";
      }

      // Depth from uid: "1_0" = depth 0, "10_0" = depth 1, "11_0" = depth 1
      // Use the prefix before underscore — single digit = root, double digit = child
      const uidParts = uid.split("_");
      const prefix = uidParts[0] ?? "";
      const depth = prefix.length > 1 ? 1 : 0;

      results.push({ uid, role, name, attrs, depth });
    }
    return results;
  }, [output]);

  // Role badge colors
  const roleColor = (role: string): string => {
    switch (role) {
      case "button": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "link": return "bg-purple-500/15 text-purple-400 border-purple-500/30";
      case "heading": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "textbox":
      case "input": return "bg-green-500/15 text-green-400 border-green-500/30";
      case "image": return "bg-pink-500/15 text-pink-400 border-pink-500/30";
      case "main":
      case "region":
      case "navigation": return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
      case "list":
      case "listitem": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
      case "RootWebArea": return "bg-gray-500/15 text-gray-400 border-gray-500/30";
      default: return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  if (!nodes.length) {
    return (
      <div className="px-3 py-2">
        <ToolOutput output={output} />
      </div>
    );
  }

  const visibleNodes = expanded ? nodes : nodes.slice(0, 20);
  const hasMore = nodes.length > 20;

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
          Page Snapshot — {nodes.length} elements
        </span>
      </div>
      <div className="max-h-80 overflow-auto rounded-md bg-[var(--background)] border border-[var(--border)] p-2 space-y-0.5">
        {visibleNodes.map((node, i) => (
          <div
            key={`${node.uid}-${i}`}
            className="flex items-start gap-1.5 py-0.5"
            style={{ paddingLeft: `${node.depth * 16}px` }}
          >
            <span
              className={`inline-flex items-center shrink-0 px-1.5 py-0 rounded text-[10px] font-mono border ${roleColor(node.role)}`}
            >
              {node.role}
            </span>
            {node.name && (
              <span className="text-xs text-[var(--foreground)] truncate">
                {node.name}
              </span>
            )}
            {node.attrs.url && (
              <span className="text-[10px] text-[var(--muted-foreground)] truncate ml-auto shrink-0 max-w-[200px]">
                {node.attrs.url}
              </span>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
        >
          {expanded ? "Show less" : `Show all ${nodes.length} elements…`}
        </button>
      )}
    </div>
  );
}

function FileListView({ title, output }: { title: string; output?: string }) {
  const items = output ? output.split("\n").filter(Boolean) : [];
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-2">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted-foreground)]">No results</div>
      ) : (
        <ul className="space-y-1 text-xs text-[var(--foreground)] pl-1">
          {items.map((item) => (
            <li key={item} className="font-mono truncate" title={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WebFetchView({ url, output }: { url: string; output?: string }) {
  const preview = output ? output.slice(0, 400) : "";
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-2">
        WebFetch
      </div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-xs font-mono text-[var(--foreground)] break-all">
        {url}
      </div>
      {preview && (
        <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-xs text-[var(--foreground)] whitespace-pre-wrap max-h-48 overflow-auto">
          {preview}
          {output && output.length > preview.length ? "…" : ""}
        </div>
      )}
    </div>
  );
}

function WriteView({
  filePath,
  content,
  output,
  onAddComment,
  comments,
}: {
  filePath: string;
  content: string;
  output?: string;
  onAddComment?: (
    file: string,
    selection: SelectedLineRange,
    comment: string,
    origin: "diff" | "file",
  ) => void;
  comments?: CodeComment[];
}) {
  const lines = content.split("\n");

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)] group">
        <span>📄</span>
        <span className="font-mono truncate" title={filePath}>
          {shortenPath(filePath)}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px]">
          <span>{lines.length} lines</span>
          <CopyButton text={content} label="Copy file" />
        </div>
      </div>
      <CodeWithComments
        code={content}
        filePath={filePath}
        onAddComment={onAddComment}
        comments={comments}
      />
      {output && (
        <div className="mt-2">
          <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">
            Output
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-32 overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

function ReadView({
  filePath,
  output,
  onAddComment,
  comments,
}: {
  filePath: string;
  output?: string;
  onAddComment?: (
    file: string,
    selection: SelectedLineRange,
    comment: string,
    origin: "diff" | "file",
  ) => void;
  comments?: CodeComment[];
}) {
  const parsed = useMemo(
    () => (output ? parseFileOutput(output) : ""),
    [output],
  );

  const lines = parsed.split("\n");

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)] group">
        <span>📖</span>
        <span className="font-mono truncate" title={filePath}>
          Read: {shortenPath(filePath)}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px]">
          <span>{lines.length} lines</span>
          <CopyButton text={parsed} label="Copy read" />
        </div>
      </div>
      {parsed && (
        <CodeWithComments
          code={parsed}
          filePath={filePath}
          onAddComment={onAddComment}
          comments={comments}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Todo tool view
// ---------------------------------------------------------------------------

function TodoView({ input, output }: { input?: string; output?: string }) {
  const data = useMemo(() => {
    try {
      const raw = input || output || "{}";
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed;
    } catch {
      return {};
    }
  }, [input, output]);

  const todos: Array<{
    id?: string;
    content?: string;
    status?: string;
    priority?: string;
  }> = data.todos || (Array.isArray(data) ? data : []);

  if (todos.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
        No todo items
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-1">
      {todos.map((todo, idx) => (
        <div key={todo.id ?? idx} className="flex items-center gap-2 text-xs">
          {todo.status === "completed" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : todo.status === "in_progress" ? (
            <Loader2 className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-spin" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
          )}
          <span
            className={
              todo.status === "completed"
                ? "line-through text-[var(--muted-foreground)]"
                : "text-[var(--foreground)]"
            }
          >
            {todo.content}
          </span>
          {todo.priority === "high" && (
            <span className="text-[10px] font-medium text-red-500">HIGH</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default JSON fallback (original behaviour)
// ---------------------------------------------------------------------------

function DefaultView({
  input,
  output,
}: {
  input: Record<string, unknown>;
  output?: string;
}) {
  return (
    <>
      <div className="px-3 py-2">
        <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">
          Input
        </div>
        <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-48 overflow-auto">
          {JSON.stringify(input, null, 2)}
        </pre>
      </div>
      {output !== undefined && (
        <div className="border-t border-[var(--border)] px-3 py-2">
          <div className="text-[10px] font-medium uppercase text-[var(--muted-foreground)] mb-1">
            Output
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-64 overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ToolCallCard = React.memo(function ToolCallCard({
  part,
  onAddComment,
  getDiffAnnotations,
  getFileComments,
  sources = [],
  sessionId,
  archived,
  childSessions,
  fetchChildData,
  getChildMessages,
  getChildPartsForMessage,
  getChildStatus,
  liveChildSessionIds,
}: ToolCallCardProps) {
  const title =
    "title" in part.state && part.state.title
      ? part.state.title
      : getToolDisplayName(part.tool);
  const duration =
    "time" in part.state && part.state.time && "end" in part.state.time
      ? (
          ((part.state.time as { start: number; end: number }).end -
            part.state.time.start) /
          1000
        ).toFixed(1)
      : null;

  const input = part.state.input;
  const output = "output" in part.state ? part.state.output : undefined;

  const toolState: ToolState =
    part.state.status === "running"
      ? "partial-call"
      : part.state.status === "pending"
        ? "call"
        : "result";
  const toolStatus = part.state.status as ToolStatus;

  // Determine which specialised view to use
  function renderBody() {
    if (isEditTool(input)) {
      return (
        <>
          <DiffView
            filePath={input.filePath}
            oldString={input.oldString}
            newString={input.newString}
            onAddComment={onAddComment}
            annotations={getDiffAnnotations?.(input.filePath)}
          />
          {output && (
            <div className="border-t border-[var(--border)] px-3 py-1">
              <span className="font-mono text-[10px] text-green-500">
                {output}
              </span>
            </div>
          )}
        </>
      );
    }

    if (isBashTool(input)) {
      if (isGitCommand(input.command)) {
        const gitInfo = parseGitCommitInfo(input.command, output);
        return (
          <div className="px-3 py-2 space-y-2">
            <Commit
              message={gitInfo.message}
              hash={gitInfo.hash}
              files={gitInfo.files}
            />
            {output && (
              <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--foreground)] max-h-48 overflow-auto">
                {output}
              </pre>
            )}
          </div>
        );
      }
      return <BashView command={input.command} output={output} />;
    }

    if (isWriteTool(input)) {
      return (
        <WriteView
          filePath={input.filePath}
          content={input.content}
          output={output}
          onAddComment={onAddComment}
          comments={getFileComments?.(input.filePath)}
        />
      );
    }

    if (isReadTool(input)) {
      return (
        <ReadView
          filePath={input.filePath}
          output={output}
          onAddComment={onAddComment}
          comments={getFileComments?.(input.filePath)}
        />
      );
    }

    // Chrome DevTools screenshot — render image inline
    if (part.tool === SCREENSHOT_TOOL) {
      return <ScreenshotView part={part} />;
    }

    // Chrome DevTools snapshot — render accessible tree view
    if (part.tool === SNAPSHOT_TOOL && output) {
      return <SnapshotView output={output} />;
    }

    if (part.tool === "glob" || part.tool === "grep") {
      return <FileListView title={part.tool.toUpperCase()} output={output} />;
    }

    if (part.tool === "webfetch" && isWebFetchTool(input)) {
      return <WebFetchView url={input.url} output={output} />;
    }

    if (SUB_AGENT_TOOLS.has(part.tool) && isAgentInvocation(input)) {
      return <AgentInvocationView input={input} />;
    }

    // Todo tool — render styled checklist instead of raw JSON
    if (
      part.tool === "todowrite" ||
      part.tool === "TodoWrite" ||
      part.tool === "todo_write"
    ) {
      return <TodoView input={JSON.stringify(input)} output={output} />;
    }

    // Fallback: raw JSON (original behaviour)
    return (
      <>
        <ToolInput input={input} />
        {part.state.status === "completed" && <ToolOutput output={output} />}
      </>
    );
  }

  const isEdit = isEditTool(input);
  const isWrite = isWriteTool(input);
  const isMutationByName = [
    "edit",
    "write",
    "create",
    "patch",
    "multi_edit",
  ].includes(part.tool?.toLowerCase() ?? "");
  const shouldOpen =
    part.state.status === "error" || isEdit || isWrite || isMutationByName;
  const agentTitle = useMemo(() => {
    if (SUB_AGENT_TOOLS.has(part.tool) && isAgentInvocation(input)) {
      return `Agent \u00b7 ${getAgentBadge(getAgentName(input))}`;
    }
    return title;
  }, [part.tool, input, title]);

  // Sub-agent inspection: detect if this tool call creates a child session
  const isSubAgentTool = SUB_AGENT_TOOLS.has(part.tool);
  const [inspectOpen, setInspectOpen] = useState(false);

  // Try to find the matching child session from the provided list.
  // For "task" tools, the output often contains a task_id that maps to the child session.
  const matchedChild = useMemo(() => {
    if (!isSubAgentTool || !childSessions || childSessions.length === 0)
      return null;

    // Try to extract task_id from the tool output
    if (output) {
      try {
        const parsed = typeof output === "string" ? JSON.parse(output) : output;
        const outputId = parsed?.task_id ?? parsed?.taskId;
        if (outputId) {
          const match = childSessions.find(
            (c) => c.opencodeSessionId === outputId || c.id === outputId,
          );
          if (match) return match;
        }
      } catch {
        // Output might not be JSON — that's fine
      }
    }

    // Match by agent type from input
    if (isAgentInvocation(input)) {
      const agentType = getAgentName(input).toLowerCase();
      const desc = (input.description as string) ?? "";
      // Find a child whose title or metadata matches
      const match = childSessions.find((c) => {
        const childTitle = (c.title ?? "").toLowerCase();
        const childMeta = c.metadata as Record<string, unknown> | null;
        const childAgent = ((childMeta?.agent as string) ?? "").toLowerCase();
        return (
          childTitle.includes(agentType) ||
          childAgent.includes(agentType) ||
          (desc && childTitle.includes(desc.toLowerCase().slice(0, 20)))
        );
      });
      if (match) return match;
    }

    // Fallback: if there's only one child and one sub-agent tool, assume they match
    return null;
  }, [isSubAgentTool, childSessions, output, input]);

  // Build enhanced meta string for sub-agent tools with matched child data
  const headerMeta = useMemo(() => {
    const parts: string[] = [];
    if (duration) parts.push(`${duration}s`);
    if (isSubAgentTool && matchedChild) {
      if (matchedChild.messageCount > 0) {
        parts.push(
          `${matchedChild.messageCount} msg${matchedChild.messageCount !== 1 ? "s" : ""}`,
        );
      }
      const cost = formatCost(matchedChild.totalCost);
      if (cost) parts.push(cost);
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [duration, isSubAgentTool, matchedChild]);

  return (
    <Tool defaultOpen={shouldOpen}>
      <ToolHeader
        meta={headerMeta}
        state={toolState}
        status={toolStatus}
        title={agentTitle}
        type={`tool-${part.tool}`}
      />
      <ToolContent className="border-t border-[var(--border)] bg-[var(--muted)]">
        {renderBody()}
        {/* Sub-agent inspection button + modal dialog */}
        {isSubAgentTool && sessionId && matchedChild && (
          <div className="border-t border-[var(--border)] px-3 py-2">
            <button
              type="button"
              onClick={() => setInspectOpen(true)}
              className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--primary)] hover:underline w-full text-left"
            >
              <Bot className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {cleanChildTitle(matchedChild.title) || "Inspect Agent Session"}
              </span>
              {matchedChild.messageCount > 0 && (
                <span className="flex items-center gap-0.5 text-[var(--muted-foreground)] font-normal shrink-0">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {matchedChild.messageCount}
                </span>
              )}
              {matchedChild.totalCost > 0 && (
                <span className="text-[var(--muted-foreground)] font-normal shrink-0">
                  {formatCost(matchedChild.totalCost)}
                </span>
              )}
              {liveChildSessionIds?.has(matchedChild.opencodeSessionId) &&
                getChildStatus?.(matchedChild.opencodeSessionId)?.type ===
                  "busy" && (
                  <span className="text-[9px] text-green-400 font-normal animate-pulse shrink-0">
                    ● Live
                  </span>
                )}
            </button>

            <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
              <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b border-[var(--border)] shrink-0">
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-[var(--primary)]" />
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-base">
                        {cleanChildTitle(matchedChild.title, 100) ||
                          "Sub-Agent Session"}
                      </DialogTitle>
                      <DialogDescription asChild>
                        <div className="flex items-center gap-3 mt-1 text-sm text-[var(--muted-foreground)]">
                          <Badge variant="secondary" className="text-[10px]">
                            {isAgentInvocation(input)
                              ? getAgentBadge(getAgentName(input))
                              : "Agent"}
                          </Badge>
                          {matchedChild.messageCount > 0 && (
                            <span className="flex items-center gap-1 text-xs">
                              <MessageSquare className="h-3 w-3" />{" "}
                              {matchedChild.messageCount} messages
                            </span>
                          )}
                          {matchedChild.totalCost > 0 && (
                            <span className="text-xs">
                              {formatCost(matchedChild.totalCost)}
                            </span>
                          )}
                          {matchedChild.totalTokens > 0 && (
                            <span className="text-xs">
                              {matchedChild.totalTokens > 1000
                                ? `${(matchedChild.totalTokens / 1000).toFixed(1)}k tokens`
                                : `${matchedChild.totalTokens} tokens`}
                            </span>
                          )}
                        </div>
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <ChildSessionView
                    childSessionId={matchedChild.id}
                    parentSessionId={sessionId}
                    agentName={
                      isAgentInvocation(input) ? getAgentName(input) : undefined
                    }
                    description={
                      isAgentInvocation(input)
                        ? (input.description as string)
                        : undefined
                    }
                    archived={archived}
                    fetchChildData={
                      fetchChildData as
                        | ((
                            childId: string,
                          ) => Promise<
                            | import("../../hooks/useChildSessions").ChildSessionData
                            | null
                          >)
                        | undefined
                    }
                    liveMessages={
                      getChildMessages
                        ? getChildMessages(matchedChild.opencodeSessionId)
                        : undefined
                    }
                    liveGetParts={
                      getChildPartsForMessage
                        ? (messageID: string) =>
                            getChildPartsForMessage(
                              matchedChild.opencodeSessionId,
                              messageID,
                            )
                        : undefined
                    }
                    liveStatus={
                      getChildStatus
                        ? getChildStatus(matchedChild.opencodeSessionId)
                        : undefined
                    }
                    isModal={true}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
        {/* Show a richer fallback for sub-agent tools without matched children */}
        {isSubAgentTool &&
          sessionId &&
          !matchedChild &&
          !isAgentInvocation(input) && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
                <Bot className="h-3 w-3 shrink-0" />
                <span>Sub-agent task</span>
                <span className="ml-auto italic shrink-0">
                  {childSessions && childSessions.length > 0
                    ? "Session not matched"
                    : toolStatus === "running"
                      ? "Awaiting session data…"
                      : "No session data"}
                </span>
              </div>
            </div>
          )}
        {part.state.status === "error" && (
          <div className="border-t border-[var(--border)] px-3 py-2">
            <div className="mb-1 text-[10px] font-medium uppercase text-red-500">
              Error
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-red-400">
              {part.state.error}
            </pre>
          </div>
        )}
        {sources.length > 0 && (
          <div className="border-t border-[var(--border)]">
            <SourcesView sources={sources} />
          </div>
        )}
      </ToolContent>
    </Tool>
  );
});
