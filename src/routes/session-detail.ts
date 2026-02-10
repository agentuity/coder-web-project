/**
 * Individual session operations.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions, skills, sources, userSettings } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import {
	createSandbox,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
	removeOpencodeClient,
	destroySandbox,
} from '../opencode';
import type { SandboxContext } from '../opencode';
import {
	isSandboxHealthy,
	getCachedHealthTimestamp,
	setCachedHealthTimestamp,
	SANDBOX_STATUS_TTL_MS,
} from '../lib/sandbox-health';
import { decrypt } from '../lib/encryption';

const api = createRouter();

// GET /api/sessions/:id — get session with messages
api.get('/:id', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	let effectiveSession = session;
	if (session.sandboxId && session.sandboxUrl && ['active', 'creating'].includes(session.status)) {
		const now = Date.now();
		const lastChecked = getCachedHealthTimestamp(session.id) ?? 0;
		if (now - lastChecked >= SANDBOX_STATUS_TTL_MS) {
			setCachedHealthTimestamp(session.id, now);
			const healthy = await isSandboxHealthy(session.sandboxUrl);
			if (!healthy) {
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
			const client = getOpencodeClient(effectiveSession.sandboxId, effectiveSession.sandboxUrl);
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

	if (session.opencodeSessionId) {
		return c.json({ error: 'Session already has an OpenCode session', session }, 400);
	}

	if (!session.sandboxId || !session.sandboxUrl) {
		return c.json({ error: 'Session has no sandbox — cannot retry' }, 400);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	let opencodeSessionId: string | null = null;

	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			const opencodeSession = await client.session.create({ body: {} });
			opencodeSessionId = (opencodeSession as any)?.data?.id || (opencodeSession as any)?.id || null;
			if (opencodeSessionId) break;
		} catch (err) {
			c.var.logger.warn(`retry session.create attempt ${attempt} failed`, { error: err });
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

// POST /api/sessions/:id/fork — create a new session from existing session
api.post('/:id/fork', async (c) => {
	const user = c.get('user')!;
	const [sourceSession] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')));
	if (!sourceSession) return c.json({ error: 'Session not found' }, 404);

	const workspaceId = sourceSession.workspaceId;
	const [workspaceSkills, workspaceSources] = await Promise.all([
		db.select().from(skills).where(eq(skills.workspaceId, workspaceId)),
		db.select().from(sources).where(eq(sources.workspaceId, workspaceId)),
	]);

	const opencodeConfig = generateOpenCodeConfig(
		{ model: sourceSession.model },
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

	const metadata = (sourceSession.metadata || {}) as Record<string, unknown>;
	const repoUrl = typeof metadata.repoUrl === 'string' ? metadata.repoUrl : undefined;
	const branch = typeof metadata.branch === 'string' ? metadata.branch : undefined;
	const baseTitle = sourceSession.title || 'Untitled Session';
	const title = `Fork of ${baseTitle}`;

	const [session] = await db
		.insert(chatSessions)
		.values({
			workspaceId,
			createdBy: sourceSession.createdBy || user.id,
			status: 'creating',
			title,
			agent: sourceSession.agent ?? null,
			model: sourceSession.model ?? null,
			metadata: { ...metadata, repoUrl, branch },
		})
		.returning();

	const sandbox = c.var.sandbox;
	const logger = c.var.logger;

	// Track in thread state
	const thread = c.var.thread;
	if (thread?.state) {
		await thread.state.set('forkedAt', new Date().toISOString());
		await thread.state.set('forkedToSessionId', session!.id);
	}

	(async () => {
		try {
			const sandboxCtx: SandboxContext = { sandbox, logger };
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
				logger.warn('Failed to load GitHub token for sandbox', { userId: user.id });
			}
			const { sandboxId, sandboxUrl } = await createSandbox(sandboxCtx, {
				repoUrl,
				branch,
				opencodeConfigJson: serializeOpenCodeConfig(opencodeConfig),
				customSkills,
				registrySkills,
				githubToken,
			});

			const client = getOpencodeClient(sandboxId, sandboxUrl);
			let opencodeSessionId: string | null = null;
			for (let attempt = 1; attempt <= 5; attempt++) {
				try {
					const opencodeSession = await client.session.create({ body: {} });
					opencodeSessionId =
						(opencodeSession as any)?.data?.id || (opencodeSession as any)?.id || null;
					if (opencodeSessionId) break;
					logger.warn(`fork session.create attempt ${attempt}: no session ID returned`);
				} catch (err) {
					logger.warn(`fork session.create attempt ${attempt} failed`, { error: err });
				}
				if (attempt < 5) await new Promise((r) => setTimeout(r, 2000));
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
				})
				.where(eq(chatSessions.id, session!.id));
		} catch (error) {
			await db
				.update(chatSessions)
				.set({
					status: 'error',
					metadata: { ...metadata, repoUrl, branch, error: String(error) },
					updatedAt: new Date(),
				})
				.where(eq(chatSessions.id, session!.id));
		}
	})();

	return c.json(session, 201);
});

// DELETE /api/sessions/:id — delete session and destroy sandbox
api.delete('/:id', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

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

// POST /api/sessions/:id/share — create a public share URL via durable stream
api.post('/:id/share', async (c) => {
	const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, c.req.param('id')));
	if (!session) return c.json({ error: 'Session not found' }, 404);

	// Fetch messages from OpenCode if sandbox is active
	let messages: unknown[] = [];
	if (session.sandboxId && session.sandboxUrl && session.opencodeSessionId) {
		try {
			const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
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

		// Track in thread state
		const thread = c.var.thread;
		if (thread?.state) {
			await thread.state.set('sharedAt', new Date().toISOString());
		}

		return c.json({ url: stream.url, id: stream.id });
	} catch (error) {
		c.var.logger.error('Failed to create share stream', { error });
		return c.json({ error: 'Failed to create share link' }, 500);
	}
});

export default api;
