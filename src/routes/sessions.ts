/**
 * Session CRUD routes with sandbox lifecycle.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions, sandboxSnapshots, skills, sources, userSettings } from '../db/schema';
import { eq, desc } from '@agentuity/drizzle';
import {
	createSandbox,
	createSandboxFromSnapshot,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
} from '../opencode';
import type { SandboxContext } from '../opencode';
import {
	isSandboxHealthy,
	getCachedHealthTimestamp,
	setCachedHealthTimestamp,
	recordHealthResult,
	shouldMarkTerminated,
	SANDBOX_STATUS_TTL_MS,
} from '../lib/sandbox-health';
import { decrypt } from '../lib/encryption';
import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import { COMMAND_TO_AGENT } from '../lib/agent-commands';

const api = createRouter();

interface CreateSessionBody {
	repoUrl?: string;
	branch?: string;
	prompt?: string;
	agent?: string;
	model?: string;
	snapshotId?: string;
}

// POST /api/workspaces/:wid/sessions — create session with sandbox
api.post('/', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;

	c.var.session.metadata.action = 'create-session';
	c.var.session.metadata.userId = user.id;
	c.var.session.metadata.workspaceId = workspaceId;
	const body: CreateSessionBody = await c.req.json<CreateSessionBody>().catch(() => ({}));

	// Fetch workspace skills, sources, and user settings for config
	const [workspaceSkills, workspaceSources, [userSettingsRow]] = await Promise.all([
		db.select().from(skills).where(eq(skills.workspaceId, workspaceId)),
		db.select().from(sources).where(eq(sources.workspaceId, workspaceId)),
		db.select().from(userSettings).where(eq(userSettings.userId, user.id)),
	]);

	// Generate OpenCode config
	const opencodeConfig = generateOpenCodeConfig(
		{ model: body.model, defaultCommand: userSettingsRow?.defaultCommand },
		workspaceSources.map((s) => ({
			name: s.name,
			type: s.type,
			config: (s.config || {}) as Record<string, unknown>,
			enabled: s.enabled ?? true,
		})),
	);

	const enabledSkills = workspaceSkills.filter((s) => s.enabled ?? true);
	const customSkills = enabledSkills
		.filter((s) => s.type !== 'registry')
		.map((s) => ({ name: s.name, content: s.content }));
	const registrySkills = enabledSkills
		.filter((s) => s.type === 'registry' && s.repo)
		.map((s) => ({ repo: s.repo as string, skillName: s.name }));

	// Look up snapshot if creating from one
	let snapshotRecord: typeof sandboxSnapshots.$inferSelect | undefined;
	if (body.snapshotId) {
		const [snap] = await db
			.select()
			.from(sandboxSnapshots)
			.where(eq(sandboxSnapshots.id, body.snapshotId));
		if (snap) {
			snapshotRecord = snap;
		}
	}

	// Auto-title: prefer snapshot name, then initial prompt, then null
	const title = snapshotRecord?.name
		? snapshotRecord.name
		: body.prompt
			? body.prompt.length > 60
				? body.prompt.slice(0, 57) + '...'
				: body.prompt
			: null;

	// Create session record first (status: creating)
	// Generate UUID client-side for idempotent INSERT with onConflictDoNothing.
	const sessionId = randomUUID();
	const insertedRows = await db
		.insert(chatSessions)
		.values({
			id: sessionId,
			workspaceId,
			createdBy: user.id,
			status: 'creating',
			title,
			agent: body.agent ?? null,
			model: body.model ?? null,
			metadata: { repoUrl: body.repoUrl, branch: body.branch },
		})
		.onConflictDoNothing()
		.returning();

	// If retry caused the insert to be a no-op (PK already existed), fetch the existing row
	let session = insertedRows[0];
	if (!session) {
		const [existing] = await db
			.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId))
			.limit(1);
		session = existing;
	}

	// Capture context variables before async block (c may not be valid after response)
	const sandbox = c.var.sandbox;
	const logger = c.var.logger;
	const thread = c.var.thread;
	const tracer = c.var.tracer;

	// Tag thread metadata for dashboard querying
	{
		const existingMeta = await c.var.thread.getMetadata();
		await c.var.thread.setMetadata({
			...existingMeta,
			userId: user.id,
			workspaceId,
			sessionDbId: session!.id,
			...(body.model ? { model: body.model } : {}),
			...(body.agent ? { agent: body.agent } : {}),
		});
	}

	// Return session immediately so UI can show "Starting session..."
	// Do sandbox setup in background (fire-and-forget)
	(async () => {
		await tracer.startActiveSpan('session.create-sandbox', async (parentSpan) => {
			parentSpan.setAttribute('sessionDbId', session!.id);
			parentSpan.setAttribute('workspaceId', workspaceId);
			if (snapshotRecord) {
				parentSpan.setAttribute('snapshotId', snapshotRecord.snapshotId);
			}
			try {
				const sandboxCtx: SandboxContext = {
					sandbox: sandbox as any,
					logger,
				};
				let githubToken: string | undefined;
				try {
					if (userSettingsRow?.githubPat) {
						githubToken = decrypt(userSettingsRow.githubPat);
					}
				} catch {
					logger.warn('Failed to load GitHub token for sandbox', { userId: user.id });
				}

				let sandboxId: string;
				let sandboxUrl: string;
				let cloneError: string | undefined;

				if (snapshotRecord) {
					// ── Snapshot-based creation (skip clone, use snapshot filesystem) ──
					const snapMeta = (snapshotRecord.metadata ?? {}) as Record<string, unknown>;
					const workDir = typeof snapMeta.workDir === 'string' ? snapMeta.workDir : '/home/agentuity/project';
					const result = await createSandboxFromSnapshot(sandboxCtx, {
						snapshotId: snapshotRecord.snapshotId,
						workDir,
						githubToken,
						opencodeConfigJson: serializeOpenCodeConfig(opencodeConfig),
					});
					sandboxId = result.sandboxId;
					sandboxUrl = result.sandboxUrl;
				} else {
					// ── Normal creation (clone repo) ──
					const result = await createSandbox(sandboxCtx, {
						repoUrl: body.repoUrl,
						branch: body.branch,
						opencodeConfigJson: serializeOpenCodeConfig(opencodeConfig),
						customSkills,
						registrySkills,
						githubToken,
					});
					sandboxId = result.sandboxId;
					sandboxUrl = result.sandboxUrl;
					cloneError = result.cloneError;
				}

				if (cloneError) {
					logger.warn('Git clone failed during session creation', {
						sessionId: session!.id,
						cloneError,
					});
				}

				const client = getOpencodeClient(sandboxId, sandboxUrl);
				let opencodeSessionId: string | null = null;

				for (let attempt = 1; attempt <= 5; attempt++) {
					try {
						const opencodeSession = await client.session.create({ body: {} });
						// Log the full response structure for debugging
						logger.info(`session.create attempt ${attempt} response`, {
							responseType: typeof opencodeSession,
							keys: opencodeSession && typeof opencodeSession === 'object' ? Object.keys(opencodeSession) : [],
							hasData: !!(opencodeSession as any)?.data,
						});
						opencodeSessionId =
							(opencodeSession as any)?.data?.id ||
							(opencodeSession as any)?.id ||
							(opencodeSession as any)?.sessionId ||
							(opencodeSession as any)?.session?.id ||
							null;
						if (opencodeSessionId) break;
						logger.warn(`session.create attempt ${attempt}: no session ID returned`, {
							response: JSON.stringify(opencodeSession).slice(0, 500),
						});
					} catch (err) {
						logger.warn(`session.create attempt ${attempt} failed`, { error: String(err) });
					}
					// Exponential backoff: 1s, 2s, 4s, 8s
					if (attempt < 5) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
				}

				const newStatus = opencodeSessionId ? 'active' : 'creating';

				await db
					.update(chatSessions)
					.set({
						sandboxId,
						sandboxUrl,
						opencodeSessionId,
						status: newStatus,
						updatedAt: new Date(),
						...(cloneError
							? {
									metadata: {
										repoUrl: body.repoUrl,
										branch: body.branch,
										cloneError,
									},
								}
							: {}),
					})
					.where(eq(chatSessions.id, session!.id));

				// Store rich session context in thread state
				const { updateThreadContext } = await import('../lib/thread-context');
				await updateThreadContext(thread, {
					sessionDbId: session!.id,
					title: title ?? null,
					model: body.model ?? null,
					agent: body.agent ?? null,
					workspaceId,
					userId: user.id,
					sandboxId,
					repoUrl: body.repoUrl,
					branch: body.branch,
					status: newStatus,
					createdAt: session!.createdAt?.toISOString() ?? new Date().toISOString(),
					lastActivityAt: new Date().toISOString(),
				});

				// Send initial prompt async (fire-and-forget)
				if (body.prompt && opencodeSessionId) {
					try {
						// Resolve agent command slug to OpenCode agent display name
						const commandSlug = body.agent ? body.agent.replace(/^\//, '') : null;
						const agentName = commandSlug
							? (COMMAND_TO_AGENT[commandSlug] || commandSlug)
							: undefined;

						await client.session.promptAsync({
							path: { id: opencodeSessionId },
							body: {
								parts: [{ type: 'text', text: body.prompt }],
								...(agentName ? { agent: agentName } : {}),
							},
						});
					} catch (err) {
						logger.warn('Failed to send initial prompt', { error: err });
					}
				}

				parentSpan.setStatus({ code: SpanStatusCode.OK });
			} catch (error) {
				const errorMsg = String(error);
				parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });

				// Surface actionable hints for common failures
				const isConnectionError = /websocket|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(errorMsg);
				const isAuthError = /unauthorized|401|403|api.key|auth/i.test(errorMsg);
				let hint = '';
				if (isAuthError) {
					hint = ' — This may indicate missing API keys. Ensure ANTHROPIC_API_KEY and OPENAI_API_KEY org secrets are configured via "agentuity cloud env set".';
				} else if (isConnectionError) {
					hint = ' — Sandbox connection failed. This may indicate the OpenCode server did not start. Check that org secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY) are set and the sandbox has network access.';
				}
				logger.error(`Session creation failed: ${errorMsg}${hint}`, {
					sessionId: session!.id,
					workspaceId,
				});

				await db
					.update(chatSessions)
					.set({
						status: 'error',
						metadata: { repoUrl: body.repoUrl, branch: body.branch, error: `${errorMsg}${hint}` },
						updatedAt: new Date(),
					})
					.where(eq(chatSessions.id, session!.id));
			}
		});
	})();

	return c.json(session, 201);
});

// GET /api/workspaces/:wid/sessions — list sessions
api.get('/', async (c) => {
	const workspaceId = c.req.param('wid') as string;

	c.var.session.metadata.action = 'list-sessions';
	c.var.session.metadata.workspaceId = workspaceId;

	const result = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.workspaceId, workspaceId))
		.orderBy(desc(chatSessions.createdAt));

	const now = Date.now();
	const updatedSessions = await Promise.all(
		result.map(async (session) => {
			if (!session.sandboxId || !session.sandboxUrl) return session;
			if (session.status !== 'active') return session;
			const lastChecked = getCachedHealthTimestamp(session.id) ?? 0;
			if (now - lastChecked < SANDBOX_STATUS_TTL_MS) return session;

			setCachedHealthTimestamp(session.id, now);
			const healthy = await isSandboxHealthy(session.sandboxUrl);
			recordHealthResult(session.id, healthy);

			if (healthy) return session;

			// Only mark as terminated after multiple consecutive failures
			// to avoid false positives from transient network issues.
			if (!shouldMarkTerminated(session.id)) return session;

			const [updated] = await db
				.update(chatSessions)
				.set({ status: 'terminated', updatedAt: new Date() })
				.where(eq(chatSessions.id, session.id))
				.returning();

			return updated ?? { ...session, status: 'terminated' };
		}),
	);

	return c.json(updatedSessions);
});

export default api;
