/**
 * Public Tasks API — programmatic access to coding sessions.
 *
 * All routes are authenticated via API key (Bearer token).
 * This is the external-facing API for triggering coding sessions,
 * sending follow-up messages, streaming events, and cleaning up.
 *
 * Endpoints:
 *   POST   /api/v1/tasks              — Create a new coding task
 *   GET    /api/v1/tasks/:id           — Get task status & details
 *   POST   /api/v1/tasks/:id/messages  — Send a follow-up message
 *   GET    /api/v1/tasks/:id/events    — SSE event stream
 *   DELETE /api/v1/tasks/:id           — Delete task & destroy sandbox
 */
import { createRouter, sse } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions, workspaces, skills, sources, userSettings } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
	createSandbox,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
	removeOpencodeClient,
	destroySandbox,
} from '../opencode';
import type { SandboxContext } from '../opencode';
import { decrypt } from '../lib/encryption';
import { parseMetadata } from '../lib/parse-metadata';
import { handleSessionCompletionEvent } from './chat';

const api = createRouter();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_WORKSPACE_NAME = 'API Tasks';

/**
 * Get or create the default "API Tasks" workspace for a user.
 * API-created sessions are grouped under a single auto-managed workspace
 * so external callers don't need to know about workspaces.
 */
async function getOrCreateApiWorkspace(userId: string) {
	const existing = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.organizationId, userId), eq(workspaces.name, API_WORKSPACE_NAME)))
		.limit(1);

	if (existing[0]) return existing[0];

	const [workspace] = await db
		.insert(workspaces)
		.values({
			organizationId: userId,
			name: API_WORKSPACE_NAME,
			description: 'Auto-created workspace for API-initiated tasks',
		})
		.onConflictDoNothing()
		.returning();

	if (workspace) return workspace;

	// Re-fetch if conflict occurred (concurrent creation race)
	const [created] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.organizationId, userId), eq(workspaces.name, API_WORKSPACE_NAME)))
		.limit(1);
	return created!;
}

/**
 * Look up a task (session) and verify the requesting user owns it.
 */
async function getOwnedTask(taskId: string, userId: string) {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, taskId));

	if (!session) return { error: 'Task not found', status: 404 as const };
	if (session.createdBy !== userId) return { error: 'Task not found', status: 404 as const };

	return { session };
}

// ---------------------------------------------------------------------------
// POST /api/v1/tasks — create a new coding task
// ---------------------------------------------------------------------------
api.post('/', async (c) => {
	const user = c.get('user')!;

	const body = await c.req
		.json<{
			repoUrl?: string;
			branch?: string;
			prompt: string;
			agent?: string;
			model?: string;
			webhookUrl?: string;
		}>()
		.catch(() => null);

	if (!body || !body.prompt?.trim()) {
		return c.json({ error: 'A "prompt" field is required' }, 400);
	}

	// Validate webhookUrl if provided
	if (body.webhookUrl) {
		try {
			const url = new URL(body.webhookUrl);
			if (!['http:', 'https:'].includes(url.protocol)) {
				return c.json({ error: 'webhookUrl must use http or https' }, 400);
			}
		} catch {
			return c.json({ error: 'webhookUrl is not a valid URL' }, 400);
		}
	}

	const workspace = await getOrCreateApiWorkspace(user.id);
	const workspaceId = workspace.id;

	// Fetch workspace skills and sources for config
	const [workspaceSkills, workspaceSources] = await Promise.all([
		db.select().from(skills).where(eq(skills.workspaceId, workspaceId)),
		db.select().from(sources).where(eq(sources.workspaceId, workspaceId)),
	]);

	const opencodeConfig = generateOpenCodeConfig(
		{ model: body.model },
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

	const title = body.prompt.length > 60 ? body.prompt.slice(0, 57) + '...' : body.prompt;

	const sessionId = randomUUID();
	const metadata: Record<string, unknown> = {
		repoUrl: body.repoUrl,
		branch: body.branch,
		source: 'api',
	};
	if (body.webhookUrl) {
		metadata.webhookUrl = body.webhookUrl;
	}

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
			metadata,
		})
		.onConflictDoNothing()
		.returning();

	let session = insertedRows[0];
	if (!session) {
		const [existing] = await db
			.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId))
			.limit(1);
		session = existing;
	}
	if (!session) {
		return c.json({ error: 'Failed to create task' }, 500);
	}

	// Capture context variables before async block
	const sandbox = c.var.sandbox;
	const logger = c.var.logger;

	// Background: create sandbox, establish OpenCode session, send prompt
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
				repoUrl: body.repoUrl,
				branch: body.branch,
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
					logger.warn(`session.create attempt ${attempt}: no session ID returned`);
				} catch (err) {
					logger.warn(`session.create attempt ${attempt} failed`, { error: err });
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

			// Send prompt
			if (body.prompt && opencodeSessionId) {
				try {
					await client.session.promptAsync({
						path: { id: opencodeSessionId },
						body: { parts: [{ type: 'text', text: body.prompt }] },
					});
				} catch (err) {
					logger.warn('Failed to send initial prompt', { error: err });
				}
			}
		} catch (error) {
			await db
				.update(chatSessions)
				.set({
					status: 'error',
					metadata: { ...metadata, error: String(error) },
					updatedAt: new Date(),
				})
				.where(eq(chatSessions.id, session!.id));
		}
	})();

	return c.json(
		{
			taskId: session!.id,
			status: 'creating',
			message: 'Task created. Poll GET /api/v1/tasks/:id or listen to SSE at GET /api/v1/tasks/:id/events.',
		},
		201,
	);
});

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/:id — get task status & details
// ---------------------------------------------------------------------------
api.get('/:id', async (c) => {
	const user = c.get('user')!;
	const result = await getOwnedTask(c.req.param('id')!, user.id);
	if ('error' in result) return c.json({ error: result.error }, result.status);

	const { session } = result;
	const metadata = parseMetadata(session);

	return c.json({
		taskId: session.id,
		status: session.status,
		title: session.title,
		repoUrl: metadata.repoUrl ?? null,
		branch: metadata.branch ?? null,
		prUrl: (metadata.pullRequest as any)?.url ?? null,
		webhookUrl: metadata.webhookUrl ?? null,
		agent: session.agent,
		model: session.model,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
	});
});

// ---------------------------------------------------------------------------
// POST /api/v1/tasks/:id/messages — send follow-up message
// ---------------------------------------------------------------------------
api.post('/:id/messages', async (c) => {
	const user = c.get('user')!;
	const result = await getOwnedTask(c.req.param('id')!, user.id);
	if ('error' in result) return c.json({ error: result.error }, result.status);

	const { session } = result;
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Task sandbox not ready' }, 503);
	}

	const body = await c.req.json<{ text: string; model?: string }>().catch(() => null);
	if (!body || !body.text?.trim()) {
		return c.json({ error: 'A "text" field is required' }, 400);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);

	try {
		const [providerID, modelID] = body.model ? body.model.split('/') : [];
		await client.session.promptAsync({
			path: { id: session.opencodeSessionId },
			body: {
				parts: [{ type: 'text' as const, text: body.text }],
				...(providerID && modelID ? { model: { providerID, modelID } } : {}),
			},
		});
		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to send message', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/:id/events — SSE event stream
// ---------------------------------------------------------------------------
api.get(
	'/:id/events',
	sse(async (c, stream) => {
		const user = c.get('user')!;
		const result = await getOwnedTask(c.req.param('id')!, user.id);
		if ('error' in result) {
			await stream.writeSSE({
				data: JSON.stringify({ type: 'error', message: result.error }),
			});
			stream.close();
			return;
		}

		const { session } = result;
		if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
			await stream.writeSSE({
				data: JSON.stringify({ type: 'error', message: 'Task sandbox not ready' }),
			});
			stream.close();
			return;
		}

		try {
			const eventResponse = await fetch(`${session.sandboxUrl}/event`);
			if (!eventResponse.ok || !eventResponse.body) {
				await stream.writeSSE({
					data: JSON.stringify({ type: 'error', message: 'No event stream' }),
				});
				stream.close();
				return;
			}

			const reader = eventResponse.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const jsonStr = line.slice(6).trim();
						if (!jsonStr) continue;

						try {
							const event = JSON.parse(jsonStr);
							const props = (event as any)?.properties;
							const eventSessionId =
								props?.sessionID ||
								props?.info?.sessionID ||
								props?.info?.id ||
								props?.part?.sessionID;

							if (eventSessionId && eventSessionId !== session.opencodeSessionId) {
								continue;
							}

							// Detect session completion and trigger webhook (fire-and-forget)
							handleSessionCompletionEvent(event, session.id, session.opencodeSessionId!).catch(
								(err) => console.error('[webhook] Completion event handling failed:', err),
							);

							await stream.writeSSE({ data: JSON.stringify(event) });
						} catch {
							// Skip malformed events
						}
					}
				}
			} catch {
				// Stream ended
			} finally {
				reader.releaseLock();
			}
		} catch (error) {
			await stream.writeSSE({
				data: JSON.stringify({ type: 'error', message: String(error) }),
			});
		}

		stream.close();
	}),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/tasks/:id — delete task & destroy sandbox
// ---------------------------------------------------------------------------
api.delete('/:id', async (c) => {
	const user = c.get('user')!;
	const result = await getOwnedTask(c.req.param('id')!, user.id);
	if ('error' in result) return c.json({ error: result.error }, result.status);

	const { session } = result;

	if (session.sandboxId) {
		const sandboxCtx: SandboxContext = {
			sandbox: c.var.sandbox,
			logger: c.var.logger,
		};
		try {
			await destroySandbox(sandboxCtx, session.sandboxId);
		} catch (err) {
			c.var.logger.warn('Failed to destroy sandbox, proceeding with task deletion', {
				sandboxId: session.sandboxId,
				error: err,
			});
		}
		removeOpencodeClient(session.sandboxId);
	}

	await db.delete(chatSessions).where(eq(chatSessions.id, session.id));
	return c.json({ success: true, message: 'Task deleted and sandbox destroyed' });
});

export default api;
