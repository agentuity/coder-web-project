/**
 * Archive pipeline — downloads OpenCode's SQLite database from a sandbox,
 * parses it with the OpenCodeDBReader, and stores normalized data in
 * PostgreSQL before the sandbox is destroyed.
 *
 * Also provides `syncSessionArchive()` for proactive, event-driven background
 * syncing via `sandboxExecute` (no file download required).
 */
import { unlink } from "node:fs/promises";
import { sandboxReadFile, sandboxExecute } from "@agentuity/server";
import { and, eq, ne, inArray } from "@agentuity/drizzle";
import { db } from "../db";
import {
  chatSessions,
  archivedSessions,
  archivedMessages,
  archivedParts,
  archivedTodos,
} from "../db/schema";
import { OpenCodeDBReader } from "./sqlite";
import type { DBSession, SessionCostSummary } from "./sqlite";

/** Path to OpenCode's SQLite database inside the sandbox. */
const OPENCODE_DB_PATH = "/home/agentuity/.local/share/opencode/opencode.db";

/** Logger interface matching the app's logger shape. */
interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Chat session row type inferred from the schema. */
type ChatSession = typeof chatSessions.$inferSelect;

/**
 * Convert a Unix timestamp (seconds or milliseconds) to a JS Date.
 * OpenCode stores timestamps as seconds since epoch.
 */
function unixToDate(ts: number | null | undefined): Date | null {
  if (!ts) return null;
  // Timestamps < 1e12 are in seconds; >= 1e12 are in milliseconds
  return new Date(ts < 1e12 ? ts * 1000 : ts);
}

/**
 * Archive a session's OpenCode data before sandbox destruction.
 *
 * Downloads the SQLite DB from the sandbox, extracts all sessions/messages/
 * parts/todos, and stores them in PostgreSQL archive tables.
 *
 * This function NEVER throws — archive failures are logged and the
 * archiveStatus is set to 'failed', but the caller can proceed with
 * sandbox destruction regardless.
 */
export async function archiveSession(
  apiClient: unknown,
  chatSession: ChatSession,
  logger: Logger,
): Promise<boolean> {
  const sessionId = chatSession.id;
  const sandboxId = chatSession.sandboxId;

  if (!sandboxId) {
    logger.warn("[archive] No sandbox ID for session, skipping archive", {
      sessionId,
    });
    return false;
  }

  let tmpPath: string | null = null;

  try {
    // 1. Atomically claim the archive — only proceed if status is currently 'none'
    const [claimed] = await db
      .update(chatSessions)
      .set({ archiveStatus: "archiving", updatedAt: new Date() })
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.archiveStatus, "none"),
        ),
      )
      .returning();

    if (!claimed) {
      // Already archiving or archived — skip
      logger.info(
        "[archive] Session already being archived or archived, skipping",
        { sessionId },
      );
      return false;
    }

    logger.info("[archive] Downloading OpenCode DB from sandbox", {
      sessionId,
      sandboxId,
    });

    // 2. Download the SQLite DB file from the sandbox
    const stream = await sandboxReadFile(
      apiClient as Parameters<typeof sandboxReadFile>[0],
      {
        sandboxId,
        path: OPENCODE_DB_PATH,
      },
    );

    // 3. Write stream to temp file (wrap in Response — Bun.write accepts Response)
    tmpPath = `/tmp/archive-${sessionId}.db`;
    await Bun.write(tmpPath, new Response(stream));

    logger.info("[archive] SQLite DB downloaded, opening reader", {
      sessionId,
      tmpPath,
    });

    // 4. Open with the SQLite reader (readonly mode for file DBs)
    const reader = new OpenCodeDBReader({ dbPath: tmpPath });
    if (!reader.open()) {
      throw new Error("Failed to open downloaded SQLite database");
    }

    try {
      // 5. Extract all sessions from the SQLite DB
      const allSessions = reader.getAllSessions();
      logger.info("[archive] Found sessions in SQLite DB", {
        sessionId,
        count: allSessions.length,
      });

      if (allSessions.length === 0) {
        logger.warn("[archive] No sessions found in SQLite DB", { sessionId });
        await db
          .update(chatSessions)
          .set({ archiveStatus: "archived", updatedAt: new Date() })
          .where(eq(chatSessions.id, sessionId));
        return true;
      }

      // 6. Store each OpenCode session and its data in PostgreSQL
      await db.transaction(async (tx) => {
        for (const ocSession of allSessions) {
          await archiveOneSession(tx, sessionId, ocSession, reader, logger);
        }
      });

      logger.info("[archive] Archive complete", {
        sessionId,
        sessionCount: allSessions.length,
      });
    } finally {
      reader.close();
    }

    // 7. Mark as archived
    await db
      .update(chatSessions)
      .set({ archiveStatus: "archived", updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));

    return true;
  } catch (error) {
    logger.error("[archive] Archive failed", {
      sessionId,
      error: String(error),
    });

    // Mark as failed — don't block the delete
    try {
      await db
        .update(chatSessions)
        .set({ archiveStatus: "failed", updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));
    } catch (updateError) {
      logger.error("[archive] Failed to update archive status", {
        sessionId,
        error: String(updateError),
      });
    }

    return false;
  } finally {
    // 8. Clean up temp file
    if (tmpPath) {
      try {
        await unlink(tmpPath);
      } catch {
        // Temp file cleanup is best-effort
      }
      // Also try to clean up WAL/SHM files that SQLite may have created
      try {
        await unlink(`${tmpPath}-wal`);
      } catch {
        // Best-effort
      }
      try {
        await unlink(`${tmpPath}-shm`);
      } catch {
        // Best-effort
      }
    }
  }
}

// ─── Proactive Sync via sandboxExecute ────────────────────────────────────────

/** Bun script executed inside the sandbox to dump the OpenCode SQLite DB as JSON. */
const SQLITE_DUMP_SCRIPT = `import{Database}from"bun:sqlite";try{const d=new Database("/home/agentuity/.local/share/opencode/opencode.db",{readonly:true});const r={sessions:d.query("SELECT * FROM session").all(),messages:d.query("SELECT * FROM message").all(),parts:d.query("SELECT * FROM part").all(),todos:d.query("SELECT * FROM todo").all()};d.close();console.log(JSON.stringify(r))}catch(e){console.error(String(e));process.exit(1)}`;

/** Raw row shapes returned from OpenCode SQLite (snake_case). */
interface RawSqliteSession {
  id: string;
  slug?: string;
  parent_id?: string | null;
  title?: string | null;
  project_id?: string | null;
  directory?: string | null;
  version?: string | null;
  summary?: string | null;
  share_url?: string | null;
  time_created?: number | null;
  time_updated?: number | null;
}

interface RawSqliteMessage {
  id: string;
  session_id: string;
  role: string;
  agent?: string | null;
  model?: string | null;
  cost?: number | null;
  tokens?: string | null;
  error?: string | null;
  time_created?: number | null;
  time_updated?: number | null;
}

interface RawSqlitePart {
  id: string;
  message_id: string;
  session_id: string;
  type: string;
  data?: string | null;
  time_created?: number | null;
  time_updated?: number | null;
}

interface RawSqliteTodo {
  id: string;
  session_id: string;
  content: string;
  status: string;
  priority: string;
  position: number;
}

interface SqliteDumpData {
  sessions: RawSqliteSession[];
  messages: RawSqliteMessage[];
  parts: RawSqlitePart[];
  todos: RawSqliteTodo[];
}

/** Parse a JSON string safely, returning null on failure. */
function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Proactively sync a session's OpenCode data from the sandbox SQLite DB
 * into PostgreSQL archive tables using `sandboxExecute`.
 *
 * Uses a full-replace strategy: deletes all existing archive data for the
 * chat session, then inserts fresh data from the SQLite dump.
 *
 * This function NEVER throws — catches all errors, logs them, and sets
 * archiveStatus to 'failed' on error.
 *
 * @returns true on success, false on failure/skip.
 */
export async function syncSessionArchive(
  apiClient: unknown,
  chatSession: ChatSession,
  logger: Logger,
): Promise<boolean> {
  const sessionId = chatSession.id;
  const sandboxId = chatSession.sandboxId;

  if (!sandboxId) {
    logger.warn("[archive-sync] No sandbox ID for session, skipping", {
      sessionId,
    });
    return false;
  }

  try {
    // 1. Atomic claim — only proceed if not already archiving
    const [claimed] = await db
      .update(chatSessions)
      .set({ archiveStatus: "archiving", updatedAt: new Date() })
      .where(
        and(
          eq(chatSessions.id, sessionId),
          ne(chatSessions.archiveStatus, "archiving"),
        ),
      )
      .returning();

    if (!claimed) {
      logger.info("[archive-sync] Session already being archived, skipping", {
        sessionId,
      });
      return false;
    }

    // 2. Execute bun script inside sandbox to dump SQLite as JSON
    logger.info("[archive-sync] Querying SQLite via sandboxExecute", {
      sessionId,
      sandboxId,
    });

    const execution = await sandboxExecute(
      apiClient as Parameters<typeof sandboxExecute>[0],
      {
        sandboxId,
        options: {
          command: ["bun", "-e", SQLITE_DUMP_SCRIPT],
          timeout: "30s",
        },
      },
    );

    // 3. Read stdout from the execution
    let stdout = "";
    if (execution.stdoutStreamUrl) {
      const res = await fetch(execution.stdoutStreamUrl);
      stdout = await res.text();
    }

    let stderr = "";
    if (execution.stderrStreamUrl) {
      const res = await fetch(execution.stderrStreamUrl);
      stderr = await res.text();
    }

    const exitCode =
      typeof execution.exitCode === "number" ? execution.exitCode : 0;

    if (exitCode !== 0 || !stdout.trim()) {
      logger.warn("[archive-sync] sandboxExecute failed or returned no data", {
        sessionId,
        exitCode,
        stderr: stderr.slice(0, 500),
      });
      // Mark as failed
      await db
        .update(chatSessions)
        .set({ archiveStatus: "failed", updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));
      return false;
    }

    // 4. Parse the JSON output
    const data = JSON.parse(stdout.trim()) as SqliteDumpData;

    if (!data.sessions || data.sessions.length === 0) {
      logger.warn("[archive-sync] No sessions found in SQLite dump", {
        sessionId,
      });
      await db
        .update(chatSessions)
        .set({
          archiveStatus: "archived",
          lastArchivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, sessionId));
      return true;
    }

    // 5. Group messages, parts, and todos by session_id
    const messagesBySession = new Map<string, RawSqliteMessage[]>();
    for (const msg of data.messages) {
      const list = messagesBySession.get(msg.session_id) ?? [];
      list.push(msg);
      messagesBySession.set(msg.session_id, list);
    }

    const partsBySession = new Map<string, RawSqlitePart[]>();
    for (const part of data.parts) {
      const list = partsBySession.get(part.session_id) ?? [];
      list.push(part);
      partsBySession.set(part.session_id, list);
    }

    const todosBySession = new Map<string, RawSqliteTodo[]>();
    for (const todo of data.todos) {
      const list = todosBySession.get(todo.session_id) ?? [];
      list.push(todo);
      todosBySession.set(todo.session_id, list);
    }

    // 6. Full-replace in a single transaction
    await db.transaction(async (tx) => {
      // Delete existing archive data — cascades to messages, parts, todos
      await tx
        .delete(archivedSessions)
        .where(eq(archivedSessions.chatSessionId, sessionId));

      // Insert fresh data for each session
      for (const rawSession of data.sessions) {
        const sessionMessages = messagesBySession.get(rawSession.id) ?? [];
        const sessionParts = partsBySession.get(rawSession.id) ?? [];
        const sessionTodos = todosBySession.get(rawSession.id) ?? [];

        // Compute cost aggregates from messages
        let totalCost = 0;
        let totalTokens = 0;
        let inputTokens = 0;
        let outputTokens = 0;
        let reasoningTokens = 0;
        let cacheRead = 0;
        let cacheWrite = 0;

        for (const msg of sessionMessages) {
          totalCost += msg.cost ?? 0;
          const tokens = safeJsonParse(msg.tokens) as Record<
            string,
            number
          > | null;
          if (tokens) {
            inputTokens += tokens.input ?? 0;
            outputTokens += tokens.output ?? 0;
            reasoningTokens += tokens.reasoning ?? 0;
            cacheRead += tokens.cacheRead ?? 0;
            cacheWrite += tokens.cacheWrite ?? 0;
            totalTokens +=
              (tokens.input ?? 0) +
              (tokens.output ?? 0) +
              (tokens.reasoning ?? 0);
          }
        }

        // Insert archived session
        const [archivedSession] = await tx
          .insert(archivedSessions)
          .values({
            chatSessionId: sessionId,
            opencodeSessionId: rawSession.id,
            parentSessionId: rawSession.parent_id ?? null,
            title: rawSession.title ?? null,
            projectId: rawSession.project_id ?? null,
            totalCost,
            totalTokens,
            inputTokens,
            outputTokens,
            reasoningTokens,
            cacheRead,
            cacheWrite,
            messageCount: sessionMessages.length,
            timeCreated: unixToDate(rawSession.time_created ?? null),
            timeUpdated: unixToDate(rawSession.time_updated ?? null),
            metadata: {
              slug: rawSession.slug,
              directory: rawSession.directory,
              version: rawSession.version,
              summary: rawSession.summary,
              shareUrl: rawSession.share_url,
            },
          })
          .returning();

        if (!archivedSession) continue;

        const archivedSessionId = archivedSession.id;

        // Build opencodeMessageId → archivedMessageId map for linking parts
        const messageIdMap = new Map<string, string>();

        // Insert messages
        for (const msg of sessionMessages) {
          const tokens = safeJsonParse(msg.tokens) as Record<
            string,
            number
          > | null;
          const [archivedMsg] = await tx
            .insert(archivedMessages)
            .values({
              archivedSessionId,
              opencodeMessageId: msg.id,
              role: msg.role,
              agent: msg.agent ?? null,
              model: msg.model ?? null,
              cost: msg.cost ?? null,
              tokens: tokens ?? null,
              error: msg.error ?? null,
              data: {
                role: msg.role,
                agent: msg.agent,
                model: msg.model,
                cost: msg.cost,
                tokens,
                error: msg.error,
                time: {
                  created: msg.time_created,
                  completed:
                    msg.role === "assistant" &&
                    msg.time_updated !== msg.time_created
                      ? msg.time_updated
                      : undefined,
                },
              },
              timeCreated: unixToDate(msg.time_created ?? null),
              timeUpdated: unixToDate(msg.time_updated ?? null),
            })
            .returning();

          if (archivedMsg) {
            messageIdMap.set(msg.id, archivedMsg.id);
          }
        }

        // Insert parts
        for (const part of sessionParts) {
          const archivedMessageId = messageIdMap.get(part.message_id);
          if (!archivedMessageId) continue;

          const partData = safeJsonParse(part.data) as Record<
            string,
            unknown
          > | null;

          await tx.insert(archivedParts).values({
            archivedMessageId,
            archivedSessionId,
            opencodePartId: part.id,
            type: part.type,
            data: partData ?? {},
            timeCreated: unixToDate(part.time_created ?? null),
            timeUpdated: unixToDate(part.time_updated ?? null),
          });
        }

        // Insert todos
        for (const todo of sessionTodos) {
          await tx.insert(archivedTodos).values({
            archivedSessionId,
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            position: todo.position,
          });
        }
      }
    });

    // 7. Mark as archived with timestamp
    await db
      .update(chatSessions)
      .set({
        archiveStatus: "archived",
        lastArchivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, sessionId));

    logger.info("[archive-sync] Sync complete", {
      sessionId,
      sessionCount: data.sessions.length,
      messageCount: data.messages.length,
    });

    return true;
  } catch (error) {
    logger.error("[archive-sync] Sync failed", {
      sessionId,
      error: String(error),
    });

    // Mark as failed — don't throw
    try {
      await db
        .update(chatSessions)
        .set({ archiveStatus: "failed", updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));
    } catch (updateError) {
      logger.error("[archive-sync] Failed to update archive status", {
        sessionId,
        error: String(updateError),
      });
    }

    return false;
  }
}

/**
 * Archive a single OpenCode session (with its messages, parts, and todos)
 * into the PostgreSQL archive tables.
 */
async function archiveOneSession(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  chatSessionId: string,
  ocSession: DBSession,
  reader: OpenCodeDBReader,
  logger: Logger,
): Promise<void> {
  // Get cost summary for this session
  const cost: SessionCostSummary = reader.getSessionCost(ocSession.id);

  // Insert archived session
  const [archivedSession] = await tx
    .insert(archivedSessions)
    .values({
      chatSessionId,
      opencodeSessionId: ocSession.id,
      parentSessionId: ocSession.parentId ?? null,
      title: ocSession.title,
      projectId: ocSession.projectId,
      totalCost: cost.totalCost,
      totalTokens: cost.totalTokens,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      reasoningTokens: cost.reasoningTokens,
      cacheRead: cost.cacheRead,
      cacheWrite: cost.cacheWrite,
      messageCount: cost.messageCount,
      timeCreated: unixToDate(ocSession.timeCreated),
      timeUpdated: unixToDate(ocSession.timeUpdated),
      metadata: {
        slug: ocSession.slug,
        directory: ocSession.directory,
        version: ocSession.version,
        summary: ocSession.summary,
        shareUrl: ocSession.shareUrl,
      },
    })
    .returning();

  if (!archivedSession) {
    logger.warn("[archive] Failed to insert archived session", {
      opencodeSessionId: ocSession.id,
    });
    return;
  }

  const archivedSessionId = archivedSession.id;

  // Get all messages for this session
  const messages = reader.getAllMessages(ocSession.id);

  // Build a map of opencodeMessageId → archivedMessageId for linking parts
  const messageIdMap = new Map<string, string>();

  // Insert messages in batches
  for (const msg of messages) {
    const [archivedMsg] = await tx
      .insert(archivedMessages)
      .values({
        archivedSessionId,
        opencodeMessageId: msg.id,
        role: msg.role,
        agent: msg.agent ?? null,
        model: msg.model ?? null,
        cost: msg.cost ?? null,
        tokens: msg.tokens ?? null,
        error: msg.error ?? null,
        data: {
          role: msg.role,
          agent: msg.agent,
          model: msg.model,
          cost: msg.cost,
          tokens: msg.tokens,
          error: msg.error,
          time: {
            created: msg.timeCreated,
            completed:
              msg.role === "assistant" && msg.timeUpdated !== msg.timeCreated
                ? msg.timeUpdated
                : undefined,
          },
        },
        timeCreated: unixToDate(msg.timeCreated),
        timeUpdated: unixToDate(msg.timeUpdated),
      })
      .returning();

    if (archivedMsg) {
      messageIdMap.set(msg.id, archivedMsg.id);
    }
  }

  // Get all parts for this session and insert them
  const parts = reader.getAllParts(ocSession.id);

  for (const part of parts) {
    const archivedMessageId = messageIdMap.get(part.messageId);
    if (!archivedMessageId) {
      // Part references a message we didn't archive — skip it
      continue;
    }

    await tx.insert(archivedParts).values({
      archivedMessageId,
      archivedSessionId,
      opencodePartId: part.id,
      type: part.type,
      data: part.data as Record<string, unknown>,
      timeCreated: unixToDate(part.timeCreated),
      timeUpdated: unixToDate(part.timeUpdated),
    });
  }

  // Get all todos for this session and insert them
  const todos = reader.getTodos(ocSession.id);

  for (const todo of todos) {
    await tx.insert(archivedTodos).values({
      archivedSessionId,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      position: todo.position,
    });
  }

  logger.info("[archive] Archived OpenCode session", {
    opencodeSessionId: ocSession.id,
    archivedSessionId,
    messageCount: messages.length,
    partCount: parts.length,
    todoCount: todos.length,
  });
}

/**
 * List archived child sessions (those with a parent) for a given chat session.
 * Returns summary info per child: costs, tokens, message count.
 */
export async function getArchivedChildSessions(chatSessionId: string) {
  const sessions = await db
    .select()
    .from(archivedSessions)
    .where(
      and(
        eq(archivedSessions.chatSessionId, chatSessionId),
        // Only children — those with a parentSessionId
      ),
    )
    .orderBy(archivedSessions.timeCreated);

  // Filter to only child sessions (parentSessionId IS NOT NULL)
  return sessions
    .filter((s) => s.parentSessionId != null)
    .map((s) => ({
      id: s.id,
      opencodeSessionId: s.opencodeSessionId,
      parentSessionId: s.parentSessionId,
      title: s.title,
      totalCost: s.totalCost ?? 0,
      totalTokens: s.totalTokens ?? 0,
      messageCount: s.messageCount ?? 0,
      timeCreated: s.timeCreated,
      metadata: s.metadata,
    }));
}

/**
 * Get full child session data (messages, parts, todos) for a specific archived child.
 * The childId is the archived_sessions.id (UUID), not the opencode session ID.
 */
export async function getArchivedChildSessionData(
  chatSessionId: string,
  childId: string,
) {
  // Verify this child belongs to the chat session
  const [childSession] = await db
    .select()
    .from(archivedSessions)
    .where(
      and(
        eq(archivedSessions.id, childId),
        eq(archivedSessions.chatSessionId, chatSessionId),
      ),
    );

  if (!childSession) return null;

  const opencodeSessionId = childSession.opencodeSessionId;

  // Get messages, parts, todos
  const rawMessages = await db
    .select()
    .from(archivedMessages)
    .where(eq(archivedMessages.archivedSessionId, childSession.id))
    .orderBy(archivedMessages.timeCreated);

  const rawParts = await db
    .select()
    .from(archivedParts)
    .where(eq(archivedParts.archivedSessionId, childSession.id))
    .orderBy(archivedParts.timeCreated);

  const rawTodos = await db
    .select()
    .from(archivedTodos)
    .where(eq(archivedTodos.archivedSessionId, childSession.id))
    .orderBy(archivedTodos.position);

  // Build archivedMessageId → opencodeMessageId lookup
  const msgIdMap = new Map<string, string>();
  for (const msg of rawMessages) {
    msgIdMap.set(msg.id, msg.opencodeMessageId);
  }

  // Transform into frontend-ready format (same pattern as /:id/archive)
  const messages: Record<string, unknown>[] = rawMessages.map((msg) => {
    const data = (msg.data ?? {}) as Record<string, unknown>;
    return {
      ...data,
      id: msg.opencodeMessageId,
      sessionID: opencodeSessionId,
    };
  });

  const parts: Record<string, unknown>[] = rawParts.map((part) => {
    const data = (part.data ?? {}) as Record<string, unknown>;
    const parentMsgId = msgIdMap.get(part.archivedMessageId) ?? "";
    return {
      ...data,
      id: part.opencodePartId,
      sessionID: opencodeSessionId,
      messageID: parentMsgId,
    };
  });

  const todos = rawTodos.map((todo) => ({
    id: todo.id,
    content: todo.content,
    status: todo.status,
    priority: todo.priority,
  }));

  return {
    session: {
      id: childSession.id,
      opencodeSessionId: childSession.opencodeSessionId,
      parentSessionId: childSession.parentSessionId,
      title: childSession.title,
      totalCost: childSession.totalCost ?? 0,
      totalTokens: childSession.totalTokens ?? 0,
      messageCount: childSession.messageCount ?? 0,
      timeCreated: childSession.timeCreated,
      metadata: childSession.metadata,
    },
    messages,
    parts,
    todos,
  };
}

/**
 * Retrieve archived session data for viewing.
 * Returns the complete archive: sessions with hierarchy, messages, parts, and todos,
 * plus aggregate statistics.
 */
export async function getArchivedData(chatSessionId: string) {
  // Get all archived sessions for this chat session
  const sessions = await db
    .select()
    .from(archivedSessions)
    .where(eq(archivedSessions.chatSessionId, chatSessionId))
    .orderBy(archivedSessions.timeCreated);

  if (sessions.length === 0) {
    return null;
  }

  // Batch fetch all related data in 3 queries total (not 3*N)
  const sessionIds = sessions.map((s) => s.id);

  const allMessages = await db
    .select()
    .from(archivedMessages)
    .where(inArray(archivedMessages.archivedSessionId, sessionIds))
    .orderBy(archivedMessages.timeCreated);

  const allParts = await db
    .select()
    .from(archivedParts)
    .where(inArray(archivedParts.archivedSessionId, sessionIds))
    .orderBy(archivedParts.timeCreated);

  const allTodos = await db
    .select()
    .from(archivedTodos)
    .where(inArray(archivedTodos.archivedSessionId, sessionIds))
    .orderBy(archivedTodos.position);

  // Group by session ID
  const messagesBySession = new Map<string, (typeof allMessages)[number][]>();
  for (const msg of allMessages) {
    const list = messagesBySession.get(msg.archivedSessionId) ?? [];
    list.push(msg);
    messagesBySession.set(msg.archivedSessionId, list);
  }

  const partsBySession = new Map<string, (typeof allParts)[number][]>();
  for (const part of allParts) {
    const list = partsBySession.get(part.archivedSessionId) ?? [];
    list.push(part);
    partsBySession.set(part.archivedSessionId, list);
  }

  const todosBySession = new Map<string, (typeof allTodos)[number][]>();
  for (const todo of allTodos) {
    const list = todosBySession.get(todo.archivedSessionId) ?? [];
    list.push(todo);
    todosBySession.set(todo.archivedSessionId, list);
  }

  // Build session data from grouped results
  const sessionData = sessions.map((session) => ({
    session,
    messages: messagesBySession.get(session.id) ?? [],
    parts: partsBySession.get(session.id) ?? [],
    todos: todosBySession.get(session.id) ?? [],
  }));

  // Build parent-child hierarchy
  const sessionMap = new Map(sessions.map((s) => [s.opencodeSessionId, s]));
  const rootSessions = sessions.filter(
    (s) => !s.parentSessionId || !sessionMap.has(s.parentSessionId),
  );
  const childMap = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (s.parentSessionId && sessionMap.has(s.parentSessionId)) {
      const children = childMap.get(s.parentSessionId) ?? [];
      children.push(s);
      childMap.set(s.parentSessionId, children);
    }
  }

  // Aggregate stats
  const totalCost = sessions.reduce((sum, s) => sum + (s.totalCost ?? 0), 0);
  const totalMessages = sessions.reduce(
    (sum, s) => sum + (s.messageCount ?? 0),
    0,
  );
  const totalTokens = sessions.reduce(
    (sum, s) => sum + (s.totalTokens ?? 0),
    0,
  );

  // Agent breakdown across all messages
  const flatMessages = sessionData.flatMap((sd) => sd.messages);
  const agentBreakdown: Record<string, number> = {};
  for (const msg of flatMessages) {
    if (msg.agent) {
      agentBreakdown[msg.agent] = (agentBreakdown[msg.agent] ?? 0) + 1;
    }
  }

  return {
    chatSessionId,
    sessions: sessionData,
    hierarchy: {
      roots: rootSessions.map((r) => r.opencodeSessionId),
      children: Object.fromEntries(
        [...childMap.entries()].map(([parentId, children]) => [
          parentId,
          children.map((c) => c.opencodeSessionId),
        ]),
      ),
    },
    stats: {
      totalCost,
      totalMessages,
      totalTokens,
      sessionCount: sessions.length,
      agentBreakdown,
    },
  };
}
