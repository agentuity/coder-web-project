/**
 * Skills CRUD routes.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { skills } from '../db/schema';
import { eq } from '@agentuity/drizzle';

const api = createRouter();

// GET /api/skills/search?q=<query> — search skills.sh registry (no sandbox needed)
api.get('/search', async (c) => {
	const query = c.req.query('q')?.trim();
	if (!query || query.length < 2) {
		return c.json({ error: 'Query must be at least 2 characters' }, 400);
	}
	if (!/^[A-Za-z0-9 ._-]+$/.test(query)) {
		return c.json({ error: 'Invalid search query' }, 400);
	}

	try {
		const res = await fetch(`https://skills.sh/api/search?q=${encodeURIComponent(query)}`);
		if (!res.ok) throw new Error(`Skills API returned ${res.status}`);
		const data = (await res.json()) as {
			skills?: Array<{ skillId: string; source: string; name: string; installs?: number }>;
		};
		const results = (data.skills ?? []).map((s) => ({
			name: s.name || s.skillId,
			repo: s.source,
			url: `https://skills.sh/${s.source}/${s.skillId}`,
			installs: s.installs,
		}));
		return c.json(results);
	} catch (error) {
		return c.json({ error: 'Skill search failed', details: String(error) }, 502);
	}
});

// POST /api/workspaces/:wid/skills — create skill
api.post('/', async (c) => {
	const workspaceId = c.req.param('wid') as string;
	const body = await c.req.json<{
		name?: string;
		description?: string;
		content?: string;
		type?: string;
		repo?: string;
	}>();

	const name = body.name?.trim();
	if (!name) {
		return c.json({ error: 'Name is required' }, 400);
	}

	const type = body.type || 'custom';
	if (type !== 'custom' && type !== 'registry') {
		return c.json({ error: 'Invalid skill type' }, 400);
	}

	if (type === 'custom' && !body.content?.trim()) {
		return c.json({ error: 'Content is required for custom skills' }, 400);
	}
	if (type === 'registry' && !body.repo?.trim()) {
		return c.json({ error: 'Repo is required for registry skills' }, 400);
	}

	const [skill] = await db
		.insert(skills)
		.values({
			workspaceId,
			type,
			name,
			description: body.description,
			content: body.content || '',
			repo: type === 'registry' ? body.repo : null,
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
