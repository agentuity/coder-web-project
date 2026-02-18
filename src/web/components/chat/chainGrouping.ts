/**
 * Chain grouping utilities — groups consecutive file-related tool calls
 * (read → edit/write on the same file) into collapsible "chain of thought"
 * sections. Pure functions extracted from ChatPage for reuse across views.
 */
import type { Part, ToolPart } from "../../types/opencode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChainGroup = { type: "chain"; filePath: string; parts: ToolPart[] };

type CurrentChain = {
  filePath: string;
  parts: ToolPart[];
  startsWithRead: boolean;
  hasWriteOrEdit: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function extractFilePath(part: ToolPart): string | null {
  const input = part.state?.input;
  if (!input) return null;
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    const candidate = parsed as {
      filePath?: string;
      path?: string;
      file?: string;
    };
    return candidate.filePath || candidate.path || candidate.file || null;
  } catch {
    return null;
  }
}

export function isReadTool(part: ToolPart): boolean {
  const input = part.state?.input;
  if (!input || typeof input !== "object") return false;
  return (
    typeof (input as { filePath?: unknown }).filePath === "string" &&
    typeof (input as { content?: unknown }).content !== "string" &&
    typeof (input as { oldString?: unknown }).oldString !== "string" &&
    typeof (input as { command?: unknown }).command !== "string"
  );
}

export function isWriteOrEditTool(part: ToolPart): boolean {
  const input = part.state?.input;
  if (!input || typeof input !== "object") return false;
  const hasEdit =
    typeof (input as { oldString?: unknown }).oldString === "string" &&
    typeof (input as { newString?: unknown }).newString === "string";
  const hasWrite = typeof (input as { content?: unknown }).content === "string";
  return hasEdit || hasWrite;
}

// ---------------------------------------------------------------------------
// Main grouping function
// ---------------------------------------------------------------------------

export function groupPartsIntoChains(parts: Part[]): (Part | ChainGroup)[] {
  const groups: (Part | ChainGroup)[] = [];
  let currentChain: CurrentChain | null = null;

  const flushChain = () => {
    if (!currentChain) return;
    const shouldChain =
      currentChain.parts.length > 1 &&
      currentChain.startsWithRead &&
      currentChain.hasWriteOrEdit;
    if (shouldChain) {
      groups.push({
        type: "chain",
        filePath: currentChain.filePath,
        parts: currentChain.parts,
      });
    } else {
      groups.push(...currentChain.parts);
    }
    currentChain = null;
  };

  for (const part of parts) {
    if (part.type === "tool") {
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
}
