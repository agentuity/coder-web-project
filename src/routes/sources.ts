/**
 * MCP Sources CRUD routes.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { sources, workspaces } from '../db/schema';
import { and, eq } from '@agentuity/drizzle';

const api = createRouter();

// POST /api/workspaces/:wid/sources — add source
api.post('/', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	const body = await c.req.json<{ name: string; type: string; config: Record<string, unknown> }>();

	const [source] = await db
		.insert(sources)
		.values({
			workspaceId,
			name: body.name,
			type: body.type,
			config: body.config,
		})
		.returning();

	return c.json(source, 201);
});

// GET /api/workspaces/:wid/sources — list sources
api.get('/', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	const result = await db.select().from(sources).where(eq(sources.workspaceId, workspaceId));
	return c.json(result);
});

// PATCH /api/sources/:id — update source
api.patch('/:id', async (c) => {
	const user = c.get('user')!;
	const [existing] = await db.select().from(sources).where(eq(sources.id, c.req.param('id')!));
	if (!existing) return c.json({ error: 'Source not found' }, 404);
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, existing.workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Source not found' }, 404);
	const body = await c.req.json<{ name?: string; type?: string; config?: Record<string, unknown>; enabled?: boolean }>();
	const [source] = await db
		.update(sources)
		.set({ ...body, updatedAt: new Date() })
		.where(eq(sources.id, c.req.param('id')!))
		.returning();
	if (!source) return c.json({ error: 'Source not found' }, 404);
	return c.json(source);
});

// DELETE /api/sources/:id — delete source
api.delete('/:id', async (c) => {
	const user = c.get('user')!;
	const [existing] = await db.select().from(sources).where(eq(sources.id, c.req.param('id')!));
	if (!existing) return c.json({ error: 'Source not found' }, 404);
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, existing.workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Source not found' }, 404);
	const [source] = await db.delete(sources).where(eq(sources.id, c.req.param('id')!)).returning();
	if (!source) return c.json({ error: 'Source not found' }, 404);
	return c.json({ success: true });
});

export default api;
