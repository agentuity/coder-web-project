# Scout Report: OpenCode MCP Tool Results with Images

> **Question:** How does OpenCode handle MCP tool results that contain images (like from chrome-devtools_take_screenshot), and what does the frontend receive?

## Sources

| File | Lines | Relevance |
|------|-------|-----------|
| `src/routes/chat.ts` | 378-549 | **high** — SSE proxy that forwards OpenCode events |
| `src/web/types/opencode.ts` | 84-115 | **high** — Frontend type definitions for ToolPart and ToolState |
| `src/web/hooks/useSessionEvents.ts` | 1-400+ | **high** — SSE event reducer and dispatcher |
| `src/web/components/chat/ToolCallCard.tsx` | 49-1500+ | **high** — Tool result rendering, screenshot handling |
| `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` | — | **high** — OpenCode SDK type definitions (source of truth) |

**Commands run:**
- `grep -r "ToolPart\|ToolResult\|ImageContent" node_modules/@opencode-ai/sdk/dist --include="*.d.ts"`
- `grep -B 5 -A 40 "export type ToolState" node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`
- `grep -n "SCREENSHOT_TOOL\|take_screenshot" src/web/components/chat/ToolCallCard.tsx`

**URLs consulted:**
- None (all information from local codebase and SDK types)

---

## Findings

### 1. **SSE Proxy (chat.ts) — No Filtering or Transformation**

The SSE proxy in `src/routes/chat.ts:378-549` **does NOT filter or transform tool result events**. It:

- Fetches raw SSE stream from OpenCode server at `${session.sandboxUrl}/event`
- Parses each `data: ` line as JSON
- **Passes the entire event object through unchanged** (lines 512-520):
  ```typescript
  await safeWrite({
    data: JSON.stringify({
      ...event,
      _meta: {
        sessionId: eventSessionId || session.opencodeSessionId,
        isParent,
      },
    }),
  });
  ```
- Only adds `_meta` field for session routing; no stripping of image/binary data

**Conclusion:** Image data in tool results flows through the proxy untouched.

---

### 2. **Frontend Type Definitions — Mismatch with SDK**

**CRITICAL FINDING:** The frontend types in `src/web/types/opencode.ts` are **out of sync** with the OpenCode SDK.

**Frontend definition (opencode.ts:84-91):**
```typescript
export interface ToolStateCompleted {
  status: 'completed';
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { start: number; end: number };
}
```

**SDK definition (node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts):**
```typescript
export type ToolStateCompleted = {
  status: "completed";
  input: { [key: string]: unknown };
  output: string;
  title: string;
  metadata: { [key: string]: unknown };
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
  attachments?: Array<FilePart>;  // ← MISSING FROM FRONTEND
};
```

**The SDK includes `attachments?: Array<FilePart>` but the frontend type does NOT.**

This means:
- The frontend **receives** `attachments` in the SSE event (from OpenCode)
- But the TypeScript type doesn't declare it
- Frontend code accessing `part.state.attachments` would be untyped

---

### 3. **How Images Are Currently Handled — Via `output` String**

Since `attachments` is not used, images are currently handled **entirely through the `output` string field**.

**ScreenshotView component (ToolCallCard.tsx:809-886)** extracts images from `output` using multiple patterns:

1. **Direct data URL:** `"data:image/png;base64,..."`
2. **JSON with data field:** `{ "data": "base64...", "mimeType": "image/png" }`
3. **Markdown image syntax:** `![alt](data:image/png;base64,...)`
4. **Data URL anywhere in string:** Regex match for `data:image/...`

Code (lines 820-855):
```typescript
const imageSrc = useMemo(() => {
  if (!output) return null;
  const trimmed = output.trim();

  // 1. Direct data URL
  if (trimmed.startsWith("data:image/")) return trimmed;

  // 2. Try JSON parse
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
    // Not JSON
  }

  // 3. Markdown image syntax
  const mdMatch = trimmed.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
  if (mdMatch) return mdMatch[1];

  // 4. Data URL anywhere in string
  const dataUrlMatch = trimmed.match(/(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)/);
  if (dataUrlMatch) return dataUrlMatch[1];

  return null;
}, [output]);
```

**Rendering (lines 866-885):**
```typescript
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
```

---

### 4. **Event Reducer — Full Part Object Preserved**

The SSE event reducer in `src/web/hooks/useSessionEvents.ts:127-134` **preserves the entire Part object**:

```typescript
case "PART_UPDATED": {
  const partsByMessage = new Map(state.partsByMessage);
  const existing = partsByMessage.get(action.part.messageID);
  const msgParts = new Map(existing ?? []);
  msgParts.set(action.part.id, action.part);
  partsByMessage.set(action.part.messageID, msgParts);
  return { ...state, partsByMessage };
}
```

**No filtering, no stripping.** The full `part` object (including `state.attachments` if present) is stored in state.

---

### 5. **FilePart Type — Separate Part Type for File Attachments**

OpenCode defines a separate `FilePart` type (SDK types.gen.d.ts):

```typescript
export type FilePart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
};
```

This is used in two contexts:
1. **As a standalone Part** in the message (rendered by `FilePartView`)
2. **As attachments in ToolStateCompleted** (`attachments?: Array<FilePart>`)

---

### 6. **Attachments Field — NOT Currently Rendered**

**Search result:** No code in the frontend renders `part.state.attachments`.

- `grep -r "\.attachments\|attachments\?" src/web` returns results only for **user-uploaded attachments** (ChatPage.tsx), not tool result attachments
- `grep -n "state.attachments\|part.state.attachments" src/web` returns **no results**

**Conclusion:** The `attachments` field in `ToolStateCompleted` is received from OpenCode but **not rendered by the frontend**.

---

## Gaps

- ❌ **Frontend types out of sync:** `ToolStateCompleted` in `src/web/types/opencode.ts` is missing the `attachments?: Array<FilePart>` field that the SDK includes
- ❌ **No rendering of tool attachments:** Even though OpenCode sends `attachments` in `ToolStateCompleted`, the frontend has no code to render them
- ❓ **Unclear:** Whether OpenCode actually populates `attachments` for `chrome-devtools_take_screenshot` or if it only returns base64 in the `output` string
- ❓ **Unclear:** What the actual MCP protocol returns for tool results with images (whether it's in `content` array or elsewhere)

---

## Observations

1. **Current image handling is robust but string-based:** The `ScreenshotView` component handles 4 different formats of image data in the `output` string, making it flexible to different tool implementations

2. **Type mismatch is a technical debt:** The frontend types diverged from the SDK types. This could cause runtime issues if OpenCode starts populating `attachments` and the frontend tries to access it

3. **Two parallel systems for file attachments:**
   - **User-uploaded attachments** (ChatPage.tsx) — handled before sending message
   - **Tool result attachments** (ToolStateCompleted.attachments) — received from OpenCode but not rendered

4. **SSE proxy is transparent:** The proxy doesn't filter, transform, or compress image data. Large base64 strings in `output` flow through unchanged, which could impact SSE performance for large screenshots

5. **FilePart is the canonical file representation:** Both user attachments and tool result attachments use the `FilePart` type, suggesting a unified file handling model (though not fully implemented on the frontend)

6. **Screenshot tool is special-cased:** Only `chrome-devtools_take_screenshot` gets special rendering. Other tools with image outputs would fall back to text rendering unless they also return base64 in the `output` string

---

## Data Flow Summary

```
OpenCode Server
    ↓
SSE Event Stream (raw, unfiltered)
    ↓
chat.ts SSE Proxy (adds _meta, no transformation)
    ↓
Frontend SSE Client
    ↓
useSessionEvents Reducer (stores full Part object)
    ↓
ToolCallCard Component
    ├─ If tool === "chrome-devtools_take_screenshot"
    │  └─ ScreenshotView (extracts image from output string)
    │     └─ Renders <img> with data: URL
    │
    └─ Other tools
       └─ ToolOutput (renders output as text)
```

**Image data path:** `output` string → ScreenshotView → regex extraction → data: URL → `<img>` tag

**Unused path:** `state.attachments` → received but not rendered
