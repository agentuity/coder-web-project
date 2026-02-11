/**
 * Database schema — used by both the application at runtime and drizzle-kit
 * for migrations. Imports from drizzle-orm/pg-core so both Bun and Node
 * (drizzle-kit) can resolve it.
 */
import { pgTable, uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

/**
 * Workspaces group sessions, skills, and sources for a single user today.
 *
 * Note: organizationId currently maps to user.id as a stopgap until proper
 * organization support (shared workspaces, teams, and org-level settings)
 * is implemented.
 */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull(),
  title: text('title'),
  status: text('status').notNull().default('active'),
  sandboxId: text('sandbox_id'),
  sandboxUrl: text('sandbox_url'),
  opencodeSessionId: text('opencode_session_id'),
	agent: text('agent'),
	model: text('model'),
  flagged: boolean('flagged').default(false),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('custom'),
  name: text('name').notNull(),
  description: text('description'),
  content: text('content').notNull(),
  repo: text('repo'),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  config: jsonb('config').notNull().default({}),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  githubPat: text('github_pat'),
  voiceEnabled: boolean('voice_enabled').default(false),
  voiceModel: text('voice_model').default('gpt-4o-mini-tts'),
  voiceName: text('voice_name').default('coral'),
  voiceAutoSpeak: boolean('voice_auto_speak').default(true),
  voiceSpeed: text('voice_speed').default('1.0'),
  preferredMic: text('preferred_mic'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
