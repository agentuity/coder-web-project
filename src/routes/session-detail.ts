/**
 * Individual session operations.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions, sandboxSnapshots, skills, sources, userSettings } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { randomUUID } from 'node:crypto';
import {
	createSandbox,
	forkSandbox,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
	removeOpencodeClient,
	destroySandbox,
	buildBasicAuthHeader,
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
import { decrypt, encrypt } from '../lib/encryption';
import { parseMetadata } from '../lib/parse-metadata';
import { SpanStatusCode } from '@opentelemetry/api';

/** Extract and decrypt the OpenCode server password from session metadata. */
function getSessionPassword(session: { metadata?: unknown }): string | undefined {
	const meta = (session.metadata ?? {}) as Record<string, unknown>;
	if (typeof meta.opencodePassword === 'string') {
		try {
			return decrypt(meta.opencodePassword);
		} catch {
			// Decryption failed — password may be corrupted or from a different key
		}
	}
	return undefined;
}

const api = createRouter();

// GET /api/sessions/:id — get session with messages
api.get('/:id', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	c.var.session.metadata.action = 'get-session';
	c.var.session.metadata.sessionDbId = session.id;

	let effectiveSession = session;
	// Only health-check 'active' sessions — NOT 'creating' (sandbox is still booting)
	if (session.sandboxId && session.sandboxUrl && session.status === 'active') {
		const now = Date.now();
		const lastChecked = getCachedHealthTimestamp(session.id) ?? 0;
		if (now - lastChecked >= SANDBOX_STATUS_TTL_MS) {
			setCachedHealthTimestamp(session.id, now);
			const pw = getSessionPassword(session);
			const healthy = await isSandboxHealthy(session.sandboxUrl, pw ? buildBasicAuthHeader(pw) : undefined);
			recordHealthResult(session.id, healthy);
			if (!healthy && shouldMarkTerminated(session.id)) {
				const [updated] = await db
					.update(chatSessions)
					.set({ status: 'terminated', updatedAt: new Date() })
					.where(eq(chatSessions.id, session.id))
					.returning();
				effectiveSession = updated ?? { ...session, status: 'terminated' };
			}
		}
	}

	// Fetch messages from OpenCode if sandbox is active
	let messages: unknown[] = [];
	if (
		effectiveSession.status !== 'terminated' &&
		effectiveSession.sandboxId &&
		effectiveSession.sandboxUrl &&
		effectiveSession.opencodeSessionId
	) {
		try {
			const client = getOpencodeClient(effectiveSession.sandboxId, effectiveSession.sandboxUrl, getSessionPassword(effectiveSession));
			const result = await client.session.messages({ path: { id: effectiveSession.opencodeSessionId } });
			messages = (result as any)?.data || [];
		} catch {
			// Sandbox may be down — return session without messages
		}
	}

	return c.json({ ...effectiveSession, messages });
});

// PATCH /api/sessions/:id — update session
api.patch('/:id', async (c) => {
	c.var.session.metadata.action = 'update-session';
	c.var.session.metadata.sessionDbId = c.req.param('id');

	const body = await c.req.json<{
		title?: string;
		status?: string;
		flagged?: boolean;
		agent?: string;
		model?: string;
	}>();
	const [session] = await db
		.update(chatSessions)
		.set({ ...body, updatedAt: new Date() })
		.where(eq(chatSessions.id, c.req.param('id')))
		.returning();
	if (!session) return c.json({ error: 'Session not found' }, 404);
	return c.json(session);
});

// POST /api/sessions/:id/retry — retry establishing OpenCode session
api.post('/:id/retry', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	c.var.session.metadata.action = 'retry-session';
	c.var.session.metadata.sessionDbId = session.id;

	if (session.opencodeSessionId) {
		return c.json({ error: 'Session already has an OpenCode session', session }, 400);
	}

	if (!session.sandboxId || !session.sandboxUrl) {
		return c.json({ error: 'Session has no sandbox — cannot retry' }, 400);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl, getSessionPassword(session));
	let opencodeSessionId: string | null = null;

	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			const opencodeSession = await client.session.create({ body: {} });
			opencodeSessionId =
				(opencodeSession as any)?.data?.id ||
				(opencodeSession as any)?.id ||
				(opencodeSession as any)?.sessionId ||
				(opencodeSession as any)?.session?.id ||
				null;
			if (opencodeSessionId) break;
			c.var.logger.warn(`retry session.create attempt ${attempt}: no session ID`, {
				response: JSON.stringify(opencodeSession).slice(0, 500),
			});
		} catch (err) {
			c.var.logger.warn(`retry session.create attempt ${attempt} failed`, { error: String(err) });
		}
		if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
	}

	if (!opencodeSessionId) {
		return c.json({ error: 'Failed to create OpenCode session after retries' }, 503);
	}

	const [updated] = await db
		.update(chatSessions)
		.set({ opencodeSessionId, status: 'active', updatedAt: new Date() })
		.where(eq(chatSessions.id, session.id))
		.returning();

	return c.json(updated);
});

// POST /api/sessions/:id/fork — snapshot-based fork with full state preservation
api.post('/:id/fork', async (c) => {
	const user = c.get('user')!;
	const [sourceSession] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')));
	if (!sourceSession) return c.json({ error: 'Session not found' }, 404);

	c.var.session.metadata.action = 'fork-session';
	c.var.session.metadata.sessionDbId = sourceSession.id;
	c.var.session.metadata.userId = user.id;

	// Validate source session has an active sandbox we can snapshot
	if (!sourceSession.sandboxId || !sourceSession.sandboxUrl) {
		return c.json({ error: 'Source session has no sandbox to fork from' }, 400);
	}
	if (!sourceSession.opencodeSessionId) {
		return c.json({ error: 'Source session has no OpenCode session to fork' }, 400);
	}

	const metadata = parseMetadata(sourceSession);
	const repoUrl = typeof metadata.repoUrl === 'string' ? metadata.repoUrl : undefined;
	const branch = typeof metadata.branch === 'string' ? metadata.branch : undefined;
	const baseTitle = sourceSession.title || 'Untitled Session';
	const title = `Fork of ${baseTitle}`;

	// Derive workDir from repoUrl (same logic as createSandbox)
	const repoName = repoUrl ? repoUrl.split('/').pop()?.replace('.git', '') || 'project' : 'project';
	const workDir = `/home/agentuity/${repoName}`;

	// Client-side UUID for idempotent INSERT (see sessions.ts for explanation)
	const forkSessionId = randomUUID();
	const forkInsertedRows = await db
		.insert(chatSessions)
		.values({
			id: forkSessionId,
			workspaceId: sourceSession.workspaceId,
			createdBy: sourceSession.createdBy || user.id,
			status: 'creating',
			title,
			agent: sourceSession.agent ?? null,
			model: sourceSession.model ?? null,
			forkedFromSessionId: sourceSession.id,
			metadata: { ...metadata, repoUrl, branch },
		})
		.onConflictDoNothing()
		.returning();

	let session = forkInsertedRows[0];
	if (!session) {
		const [existing] = await db
			.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, forkSessionId))
			.limit(1);
		session = existing;
	}

	const sandbox = c.var.sandbox;
	const logger = c.var.logger;
	const tracer = c.var.tracer;

	// Update thread context for fork lineage
	const { updateThreadContext } = await import('../lib/thread-context');
	await updateThreadContext(c.var.thread, {
		sessionDbId: session!.id,
		title,
		model: sourceSession.model ?? null,
		agent: sourceSession.agent ?? null,
		workspaceId: sourceSession.workspaceId,
		userId: user.id,
		forkedFromSessionId: sourceSession.id,
		status: 'creating',
		createdAt: new Date().toISOString(),
		lastActivityAt: new Date().toISOString(),
	});

	// Tag thread metadata
	{
		const existingMeta = await c.var.thread.getMetadata();
		await c.var.thread.setMetadata({
			...existingMeta,
			userId: user.id,
			sessionDbId: session!.id,
			forkedFrom: sourceSession.id,
		});
	}

	// Async: snapshot → new sandbox → OpenCode fork → update DB
	const sourceOpencodeSessionId = sourceSession.opencodeSessionId;
	(async () => {
		await tracer.startActiveSpan('session.fork', async (parentSpan) => {
			parentSpan.setAttribute('sourceSessionId', sourceSession.id);
			parentSpan.setAttribute('forkSessionId', session!.id);
			let snapshotId: string | undefined;
			try {
				const sandboxCtx: SandboxContext = {
					sandbox: sandbox as any,
					logger,
				};

				// 1. Get GitHub token for the new sandbox
				let githubToken: string | undefined;
				try {
					const [settings] = await db
						.select()
						.from(userSettings)
						.where(eq(userSettings.userId, user.id));
					if (settings?.githubPat) {
						githubToken = decrypt(settings.githubPat);
					}
				} catch {
					logger.warn('Failed to load GitHub token for fork sandbox', { userId: user.id });
				}

				// 2. Snapshot source sandbox → create new sandbox from snapshot
				const forkResult = await tracer.startActiveSpan('session.fork.snapshot', async (snap) => {
					snap.setAttribute('sourceSandboxId', sourceSession.sandboxId!);
					const result = await forkSandbox(sandboxCtx, {
						sourceSandboxId: sourceSession.sandboxId!,
						workDir,
						githubToken,
					});
					snap.setStatus({ code: SpanStatusCode.OK });
					return result;
				});
				snapshotId = forkResult.snapshotId;

				// 3. Use OpenCode's fork API to create a new session with full message history
				const forkPassword = forkResult.password;
				const client = getOpencodeClient(forkResult.sandboxId, forkResult.sandboxUrl, forkPassword);
				const opencodeSessionId = await tracer.startActiveSpan('session.fork.opencode', async (oc) => {
					let id: string | null = null;
					for (let attempt = 1; attempt <= 5; attempt++) {
						try {
							const forkedSession = await client.session.fork({
								path: { id: sourceOpencodeSessionId },
								body: {},
							});
							id =
								(forkedSession as any)?.data?.id || (forkedSession as any)?.id || null;
							if (id) break;
							logger.warn(`fork session.fork attempt ${attempt}: no session ID returned`);
						} catch (err) {
							logger.warn(`fork session.fork attempt ${attempt} failed`, { error: err });
						}
						if (attempt < 5) await new Promise((r) => setTimeout(r, 2000));
					}
					oc.setStatus({ code: SpanStatusCode.OK });
					return id;
				});

				const newStatus = opencodeSessionId ? 'active' : 'creating';

				const encryptedForkPassword = encrypt(forkPassword);
				await db
					.update(chatSessions)
					.set({
						sandboxId: forkResult.sandboxId,
						sandboxUrl: forkResult.sandboxUrl,
						opencodeSessionId,
						status: newStatus,
						updatedAt: new Date(),
						metadata: { ...metadata, repoUrl, branch, opencodePassword: encryptedForkPassword },
					})
					.where(eq(chatSessions.id, session!.id));

				// 4. Clean up snapshot (it was only needed for creating the new sandbox)
				try {
					await sandbox.snapshot.delete(snapshotId);
					logger.info(`Cleaned up fork snapshot: ${snapshotId}`);
				} catch {
					logger.warn(`Failed to clean up fork snapshot: ${snapshotId}`);
				}

				parentSpan.setStatus({ code: SpanStatusCode.OK });
			} catch (error) {
				parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
				logger.error('Fork failed', { error });
				await db
					.update(chatSessions)
					.set({
						status: 'error',
						metadata: { ...metadata, repoUrl, branch, error: String(error) },
						updatedAt: new Date(),
					})
					.where(eq(chatSessions.id, session!.id));
				// Try to clean up snapshot on failure too
				if (snapshotId) {
					try {
						await sandbox.snapshot.delete(snapshotId);
					} catch {
						// Ignore
					}
				}
			}
		});
	})();

	return c.json(session, 201);
});

// POST /api/sessions/:id/snapshot — create a reusable snapshot from a session's sandbox
api.post('/:id/snapshot', async (c) => {
	const user = c.get('user')!;
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	c.var.session.metadata.action = 'create-snapshot';
	c.var.session.metadata.sessionDbId = session.id;

	if (!session.sandboxId) {
		return c.json({ error: 'Session has no active sandbox to snapshot' }, 400);
	}

	const body = await c.req.json<{ name: string; description?: string }>().catch(() => ({ name: '', description: undefined as string | undefined }));
	if (!body.name?.trim()) {
		return c.json({ error: 'Snapshot name is required' }, 400);
	}

	try {
		// Create the sandbox snapshot via Agentuity API
		const snapshotName = body.name.trim();
		const snapshotDesc = body.description?.trim();
		const snapshot = await c.var.sandbox.snapshot.create(session.sandboxId, {
			name: snapshotName,
			description: snapshotDesc,
		});

		// Gather session metadata for recreating later
		const metadata = parseMetadata(session);
		const repoUrl = typeof metadata.repoUrl === 'string' ? metadata.repoUrl : undefined;
		const branch = typeof metadata.branch === 'string' ? metadata.branch : undefined;
		const repoName = repoUrl ? repoUrl.split('/').pop()?.replace('.git', '') || 'project' : 'project';
		const workDir = `/home/agentuity/${repoName}`;

		// Store in DB
		const [snapshotRecord] = await db
			.insert(sandboxSnapshots)
			.values({
				workspaceId: session.workspaceId,
				createdBy: user.id,
				name: snapshotName,
				description: snapshotDesc || null,
				snapshotId: snapshot.snapshotId,
				sourceSessionId: session.id,
				metadata: { repoUrl, branch, workDir },
			})
			.returning();

		c.var.logger.info(`Snapshot created: ${snapshot.snapshotId} for session ${session.id}`);
		return c.json(snapshotRecord, 201);
	} catch (error) {
		c.var.logger.error('Failed to create snapshot', { error, sessionId: session.id });
		return c.json({ error: 'Failed to create snapshot' }, 500);
	}
});

// DELETE /api/sessions/:id — delete session and destroy sandbox
api.delete('/:id', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	c.var.session.metadata.action = 'delete-session';
	c.var.session.metadata.sessionDbId = session.id;

	// Destroy sandbox
	if (session.sandboxId) {
		const sandboxCtx: SandboxContext = {
			sandbox: c.var.sandbox,
			logger: c.var.logger,
		};
		await destroySandbox(sandboxCtx, session.sandboxId);
		removeOpencodeClient(session.sandboxId);
	}

	// Delete from DB
	await db.delete(chatSessions).where(eq(chatSessions.id, session.id));
	return c.json({ success: true });
});

// GET /api/sessions/:id/password — decrypt and return the OpenCode server password
api.get('/:id/password', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	const password = getSessionPassword(session);
	return c.json({ password: password ?? null });
});

// POST /api/sessions/:id/share — create a public share URL via durable stream
api.post('/:id/share', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	c.var.session.metadata.action = 'share-session';
	c.var.session.metadata.sessionDbId = session.id;

	// Fetch messages from OpenCode if sandbox is active
	let messages: unknown[] = [];
	if (session.sandboxId && session.sandboxUrl && session.opencodeSessionId) {
		try {
			const client = getOpencodeClient(session.sandboxId, session.sandboxUrl, getSessionPassword(session));
			const result = await client.session.messages({ path: { id: session.opencodeSessionId } });
			messages = (result as any)?.data || [];
		} catch {
			// Sandbox may be down
		}
	}

	if (messages.length === 0) {
		return c.json({ error: 'No messages to share' }, 400);
	}

	// Check for sensitive data patterns before sharing publicly
	const sensitivePatterns = [
		/\bapi[_-]?key\b/i,
		/\bpassword\b/i,
		/\bsecret\b/i,
		/\btoken\b/i,
		/\bcredentials?\b/i,
		/\bbearer\b/i,
		/sk-[a-zA-Z0-9]{20,}/, // OpenAI-style keys
		/\bAIza[a-zA-Z0-9_-]{35}\b/, // Google API keys
	];
	const messagesStr = JSON.stringify(messages);
	const hasSensitive = sensitivePatterns.some((p) => p.test(messagesStr));

	if (hasSensitive) {
		return c.json(
			{
				error:
					'Session may contain sensitive data (API keys, tokens, passwords). Please review before sharing.',
			},
			400,
		);
	}

	return c.var.tracer.startActiveSpan('session.share', async (span) => {
		span.setAttribute('sessionDbId', session.id);
		span.setAttribute('messageCount', messages.length);
		try {
			const streamService = c.var.stream;
			const shareData = {
				session: {
					id: session.id,
					title: session.title || 'Untitled Session',
					agent: session.agent,
					model: session.model,
					createdAt: session.createdAt,
				},
				messages,
				sharedAt: new Date().toISOString(),
			};

			const stream = await streamService.create('shared-sessions', {
				contentType: 'application/json',
				compress: true,
				ttl: 2592000, // 30 days
				metadata: {
					title: session.title || 'Shared Session',
					sessionId: session.id,
					createdAt: new Date().toISOString(),
				},
			});

			await stream.write(shareData);
			await stream.close();

			// Update thread context with share URL
			const { updateThreadContext } = await import('../lib/thread-context');
			await updateThreadContext(c.var.thread, {
				shareUrl: stream.url,
				lastActivityAt: new Date().toISOString(),
			});

			span.setStatus({ code: SpanStatusCode.OK });
			return c.json({ url: stream.url, id: stream.id });
		} catch (error) {
			span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
			c.var.logger.error('Failed to create share stream', { error });
			return c.json({ error: 'Failed to create share link' }, 500);
		}
	});
});

export default api;
