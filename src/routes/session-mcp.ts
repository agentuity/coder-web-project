/**
 * Session-scoped MCP management routes.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { getOpencodeClient } from '../opencode';

const api = createRouter();

// GET /api/sessions/:id/mcp/status — live MCP status
api.get('/:id/mcp/status', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl) return c.json({ error: 'Session sandbox not ready' }, 503);

	try {
		const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
		const result = await client.mcp.status();
		const data = (result as any)?.data ?? result;
		return c.json(data ?? {});
	} catch (error) {
		return c.json({ error: 'Failed to fetch MCP status', details: String(error) }, 502);
	}
});

// POST /api/sessions/:id/mcp/:name/connect — connect MCP server
api.post('/:id/mcp/:name/connect', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl) return c.json({ error: 'Session sandbox not ready' }, 503);

	const name = c.req.param('name');
	if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
		return c.json({ error: 'Invalid MCP name format' }, 400);
	}

	try {
		const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
		await client.mcp.connect({ path: { name } });
		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to connect MCP server', details: String(error) }, 500);
	}
});

// POST /api/sessions/:id/mcp/:name/disconnect — disconnect MCP server
api.post('/:id/mcp/:name/disconnect', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl) return c.json({ error: 'Session sandbox not ready' }, 503);

	const name = c.req.param('name');
	if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
		return c.json({ error: 'Invalid MCP name format' }, 400);
	}

	try {
		const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
		await client.mcp.disconnect({ path: { name } });
		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to disconnect MCP server', details: String(error) }, 500);
	}
});

export default api;
