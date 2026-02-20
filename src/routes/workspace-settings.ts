/**
 * Workspace-level environment variables.
 * Stored in the existing workspaces.settings JSONB column.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { workspaces } from '../db/schema';
import { and, eq } from '@agentuity/drizzle';

interface WorkspaceSettings {
	envVars?: Record<string, string>;
}

const api = createRouter();

// GET /api/workspaces/:wid/settings/env — get workspace env vars
api.get('/env', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

	const settings = (workspace.settings ?? {}) as WorkspaceSettings;
	return c.json(settings.envVars ?? {});
});

// PUT /api/workspaces/:wid/settings/env — replace workspace env vars
api.put('/env', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const [workspace] = await db
		.select()
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, user.id)));
	if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

	const body = await c.req.json<{ envVars: Record<string, string> }>();
	if (!body.envVars || typeof body.envVars !== 'object' || Array.isArray(body.envVars)) {
		return c.json({ error: 'envVars must be an object' }, 400);
	}

	const existingSettings = (workspace.settings ?? {}) as WorkspaceSettings;
	const updatedSettings: WorkspaceSettings = {
		...existingSettings,
		envVars: body.envVars,
	};

	await db
		.update(workspaces)
		.set({ settings: updatedSettings, updatedAt: new Date() })
		.where(eq(workspaces.id, workspaceId));

	return c.json(updatedSettings.envVars);
});

export default api;
