/**
 * Cron routes — periodic background tasks.
 */
import { createRouter, cron } from "@agentuity/runtime";
import { db } from "../db";
import { chatSessions } from "../db/schema";
import { and, eq, or, isNull, lt } from "@agentuity/drizzle";
import { syncSessionArchive } from "../lib/archive";

const api = createRouter();

const SYNC_STALE_MS = 5 * 60 * 1000; // 5 minutes

// POST /api/cron/archive-sync — sync stale active sessions
api.post(
  "/archive-sync",
  cron("*/5 * * * *", { auth: true }, async (c) => {
    const logger = c.var.logger;
    const apiClient = (c.var.sandbox as any)?.client;

    if (!apiClient) {
      logger.error("[cron] Sandbox client not available in cron context");
      return { checked: 0, synced: 0, failed: 0 };
    }

    const threshold = new Date(Date.now() - SYNC_STALE_MS);

    // Find active sessions with sandboxes that haven't synced recently
    const staleSessions = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.status, "active"),
          or(
            isNull(chatSessions.lastArchivedAt),
            lt(chatSessions.lastArchivedAt, threshold),
          ),
        ),
      );

    let synced = 0;
    let failed = 0;

    for (const session of staleSessions) {
      if (!session.sandboxId) continue;

      try {
        const result = await syncSessionArchive(apiClient, session, logger);
        if (result) synced++;
      } catch (err) {
        failed++;
        logger.warn("[cron] Archive sync failed", {
          sessionId: session.id,
          error: String(err),
        });
      }
    }

    logger.info("[cron] Archive sync complete", {
      checked: staleSessions.length,
      synced,
      failed,
    });

    return { checked: staleSessions.length, synced, failed };
  }),
);

export default api;
