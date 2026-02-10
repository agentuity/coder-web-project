/**
 * Workspace CRUD routes.
 *
 * Workspaces group sessions, skills, and sources per user today.
 * organizationId currently maps to user.id as a temporary workaround until
 * full organization support (shared workspaces, teams, org-level settings)
 * ships.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { workspaces } from '../db/schema';
import { eq } from 'drizzle-orm';

const api = createRouter();

// POST /api/workspaces — create workspace
api.post('/', async (c) => {
	const user = c.get('user')!;
	const body = await c.req.json<{ name: string; description?: string }>();

	const [workspace] = await db
		.insert(workspaces)
		.values({
			// Use user ID as org for now (see notes above).
			organizationId: user.id,
			name: body.name,
			description: body.description,
		})
		.returning();

	return c.json(workspace, 201);
});

// GET /api/workspaces — list workspaces
api.get('/', async (c) => {
	const user = c.get('user')!;
	const result = await db.select().from(workspaces).where(eq(workspaces.organizationId, user.id));
	return c.json(result);
});

// GET /api/workspaces/:id — get workspace
api.get('/:id', async (c) => {
	const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, c.req.param('id')));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	return c.json(workspace);
});

// PATCH /api/workspaces/:id — update workspace
api.patch('/:id', async (c) => {
	const body = await c.req.json<{ name?: string; description?: string; settings?: Record<string, unknown> }>();
	const [workspace] = await db
		.update(workspaces)
		.set({ ...body, updatedAt: new Date() })
		.where(eq(workspaces.id, c.req.param('id')))
		.returning();
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	return c.json(workspace);
});

// DELETE /api/workspaces/:id — delete workspace
api.delete('/:id', async (c) => {
	const [workspace] = await db.delete(workspaces).where(eq(workspaces.id, c.req.param('id'))).returning();
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	return c.json({ success: true });
});

export default api;
