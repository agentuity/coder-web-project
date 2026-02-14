/**
 * Archive pipeline — downloads OpenCode's SQLite database from a sandbox,
 * parses it with the OpenCodeDBReader, and stores normalized data in
 * PostgreSQL before the sandbox is destroyed.
 */
import { unlink } from "node:fs/promises";
import { sandboxReadFile } from "@agentuity/server";
import { and, eq, inArray } from "@agentuity/drizzle";
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
