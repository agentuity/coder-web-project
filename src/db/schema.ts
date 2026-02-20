/**
 * Database schema — used by both the application at runtime and drizzle-kit
 * for migrations. Imports from @agentuity/drizzle/schema which re-exports
 * drizzle-orm/pg-core types without Bun-specific runtime deps, so both
 * Bun and Node (drizzle-kit) can resolve it.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  doublePrecision,
  index,
} from "@agentuity/drizzle/schema";

/**
 * Workspaces group sessions, skills, and sources for a single user today.
 *
 * Note: organizationId currently maps to user.id as a stopgap until proper
 * organization support (shared workspaces, teams, and org-level settings)
 * is implemented.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  title: text("title"),
  status: text("status").notNull().default("active"),
  archiveStatus: text("archive_status").notNull().default("none"),
  sandboxId: text("sandbox_id"),
  sandboxUrl: text("sandbox_url"),
  opencodeSessionId: text("opencode_session_id"),
  agent: text("agent"),
  model: text("model"),
  forkedFromSessionId: uuid("forked_from_session_id"),
  flagged: boolean("flagged").default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  lastArchivedAt: timestamp("last_archived_at", { withTimezone: true }),
});

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("custom"),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  repo: text("repo"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: jsonb("config").notNull().default({}),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const sandboxSnapshots = pgTable("sandbox_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  snapshotId: text("snapshot_id").notNull(),
  sourceSessionId: uuid("source_session_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  secret: text("secret").notNull(),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  githubPat: text("github_pat"),
  voiceEnabled: boolean("voice_enabled").default(false),
  voiceModel: text("voice_model").default("gpt-4o-mini-tts"),
  voiceName: text("voice_name").default("coral"),
  voiceAutoSpeak: boolean("voice_auto_speak").default(true),
  voiceSpeed: text("voice_speed").default("1.0"),
  preferredMic: text("preferred_mic"),
  defaultCommand: text("default_command").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Archive Tables ──────────────────────────────────────────────────────────
// Store normalized data extracted from OpenCode's ephemeral SQLite database
// before sandbox destruction. Linked to chatSessions via chatSessionId.

/** Archived OpenCode sessions (each chat session may have parent+child sessions). */
export const archivedSessions = pgTable(
  "archived_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatSessionId: uuid("chat_session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    opencodeSessionId: text("opencode_session_id").notNull(),
    parentSessionId: text("parent_session_id"),
    title: text("title"),
    projectId: text("project_id"),
    totalCost: doublePrecision("total_cost").default(0),
    totalTokens: integer("total_tokens").default(0),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    reasoningTokens: integer("reasoning_tokens").default(0),
    cacheRead: integer("cache_read").default(0),
    cacheWrite: integer("cache_write").default(0),
    messageCount: integer("message_count").default(0),
    timeCreated: timestamp("time_created", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_archived_sessions_chat_session_id").on(table.chatSessionId),
  ],
);

/** Archived messages from OpenCode sessions. */
export const archivedMessages = pgTable(
  "archived_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    archivedSessionId: uuid("archived_session_id")
      .notNull()
      .references(() => archivedSessions.id, { onDelete: "cascade" }),
    opencodeMessageId: text("opencode_message_id").notNull(),
    role: text("role").notNull(),
    agent: text("agent"),
    model: text("model"),
    cost: doublePrecision("cost"),
    tokens: jsonb("tokens"),
    error: text("error"),
    data: jsonb("data"),
    timeCreated: timestamp("time_created", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
  },
  (table) => [
    index("idx_archived_messages_session_id").on(table.archivedSessionId),
  ],
);

/** Archived message parts (text, tool calls, reasoning). */
export const archivedParts = pgTable(
  "archived_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    archivedMessageId: uuid("archived_message_id")
      .notNull()
      .references(() => archivedMessages.id, { onDelete: "cascade" }),
    archivedSessionId: uuid("archived_session_id")
      .notNull()
      .references(() => archivedSessions.id, { onDelete: "cascade" }),
    opencodePartId: text("opencode_part_id").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    timeCreated: timestamp("time_created", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
  },
  (table) => [
    index("idx_archived_parts_session_id").on(table.archivedSessionId),
    index("idx_archived_parts_message_id").on(table.archivedMessageId),
  ],
);

/** Archived todos from OpenCode sessions. */
export const archivedTodos = pgTable(
  "archived_todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    archivedSessionId: uuid("archived_session_id")
      .notNull()
      .references(() => archivedSessions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: text("status").notNull(),
    priority: text("priority").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("idx_archived_todos_session_id").on(table.archivedSessionId),
  ],
);
