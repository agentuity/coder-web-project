/**
 * Skills CRUD routes.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { skills } from '../db/schema';
import { eq } from '@agentuity/drizzle';

const api = createRouter();

// GET /api/skills/registry — proxy to skills.sh registry
api.get('/registry', async (c) => {
	const requestUrl = new URL(c.req.url);
	const upstream = new URL('https://skills.sh/api/skills');
	if (requestUrl.search) {
		upstream.search = requestUrl.search;
	}

	let response = await fetch(upstream.toString());
	if (!response.ok && requestUrl.search) {
		// Fallback: try without query params in case registry doesn't support search
		console.warn(`Skills registry search failed (${response.status}), falling back to unfiltered list`);
		upstream.search = '';
		response = await fetch(upstream.toString());
	}

	if (!response.ok) {
		return c.json({ error: 'Skills registry unavailable' }, 502);
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		return c.json({ error: 'Registry response invalid' }, 502);
	}

	return c.json(data);
});

// POST /api/workspaces/:wid/skills — create skill
api.post('/', async (c) => {
	const workspaceId = c.req.param('wid') as string;
	const body = await c.req.json<{ name: string; description?: string; content: string }>();

	const [skill] = await db
		.insert(skills)
		.values({
			workspaceId,
			name: body.name,
			description: body.description,
			content: body.content,
		})
		.returning();

	return c.json(skill, 201);
});

// GET /api/workspaces/:wid/skills — list skills
api.get('/', async (c) => {
	const workspaceId = c.req.param('wid') as string;
	const result = await db.select().from(skills).where(eq(skills.workspaceId, workspaceId));
	return c.json(result);
});

// PATCH /api/skills/:id — update skill
api.patch('/:id', async (c) => {
	const body = await c.req.json<{ name?: string; description?: string; content?: string; enabled?: boolean }>();
	const [skill] = await db
		.update(skills)
		.set({ ...body, updatedAt: new Date() })
		.where(eq(skills.id, c.req.param('id')!))
		.returning();
	if (!skill) return c.json({ error: 'Skill not found' }, 404);
	return c.json(skill);
});

// DELETE /api/skills/:id — delete skill
api.delete('/:id', async (c) => {
	const [skill] = await db.delete(skills).where(eq(skills.id, c.req.param('id')!)).returning();
	if (!skill) return c.json({ error: 'Skill not found' }, 404);
	return c.json({ success: true });
});

export default api;
