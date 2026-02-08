/**
 * Individual session operations.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { getOpencodeClient, removeOpencodeClient, destroySandbox } from '../opencode';
import type { SandboxContext } from '../opencode';

const api = createRouter();

// GET /api/sessions/:id — get session with messages
api.get('/:id', async (c) => {
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
			// Sandbox may be down — return session without messages
		}
	}

	return c.json({ ...session, messages });
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

export default api;
