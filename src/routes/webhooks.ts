/**
 * Webhooks CRUD routes.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { webhooks, workspaces } from '../db/schema';
import { and, eq } from '@agentuity/drizzle';
import { randomBytes } from 'node:crypto';

const api = createRouter();

// POST /api/workspaces/:wid/webhooks — create webhook
api.post('/', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	const body = await c.req.json<{ name: string; description?: string; prompt: string }>();

	const secret = randomBytes(32).toString('hex');

	const [webhook] = await db
		.insert(webhooks)
		.values({
			workspaceId,
			createdBy: user.id,
			name: body.name,
			description: body.description ?? null,
			prompt: body.prompt,
			secret,
		})
		.returning();

	return c.json(webhook, 201);
});

// GET /api/workspaces/:wid/webhooks — list webhooks
api.get('/', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);
	const result = await db.select().from(webhooks).where(eq(webhooks.workspaceId, workspaceId));
	return c.json(result);
});

// PATCH /api/webhooks/:id — update webhook
api.patch('/:id', async (c) => {
	const user = c.get('user')!;
	const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, c.req.param('id')!));
	if (!existing) return c.json({ error: 'Webhook not found' }, 404);
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, existing.workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Webhook not found' }, 404);
	const body = await c.req.json<{ name?: string; description?: string; prompt?: string; enabled?: boolean }>();
	const [webhook] = await db
		.update(webhooks)
		.set({ ...body, updatedAt: new Date() })
		.where(eq(webhooks.id, c.req.param('id')!))
		.returning();
	if (!webhook) return c.json({ error: 'Webhook not found' }, 404);
	return c.json(webhook);
});

// DELETE /api/webhooks/:id — delete webhook
api.delete('/:id', async (c) => {
	const user = c.get('user')!;
	const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, c.req.param('id')!));
	if (!existing) return c.json({ error: 'Webhook not found' }, 404);
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, existing.workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Webhook not found' }, 404);
	const [webhook] = await db.delete(webhooks).where(eq(webhooks.id, c.req.param('id')!)).returning();
	if (!webhook) return c.json({ error: 'Webhook not found' }, 404);
	return c.json({ success: true });
});

export default api;
