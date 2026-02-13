/**
 * Snapshot CRUD routes for sandbox snapshots.
 * Workspace-scoped listing and deletion of saved snapshots.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { sandboxSnapshots } from '../db/schema';
import { eq, desc } from '@agentuity/drizzle';

const api = createRouter();

// GET /api/workspaces/:wid/snapshots — list snapshots for workspace
api.get('/', async (c) => {
	const workspaceId = c.req.param('wid') as string;

	const snapshots = await db
		.select()
		.from(sandboxSnapshots)
		.where(eq(sandboxSnapshots.workspaceId, workspaceId))
		.orderBy(desc(sandboxSnapshots.createdAt));

	return c.json(snapshots);
});

// DELETE /api/workspaces/:wid/snapshots/:id — delete a snapshot
api.delete('/:id', async (c) => {
	const snapshotDbId = c.req.param('id') as string;

	const [snapshot] = await db
		.select()
		.from(sandboxSnapshots)
		.where(eq(sandboxSnapshots.id, snapshotDbId));

	if (!snapshot) {
		return c.json({ error: 'Snapshot not found' }, 404);
	}

	// Clean up the underlying Agentuity sandbox snapshot
	try {
		await c.var.sandbox.snapshot.delete(snapshot.snapshotId);
		c.var.logger.info(`Deleted sandbox snapshot: ${snapshot.snapshotId}`);
	} catch {
		c.var.logger.warn(`Failed to delete sandbox snapshot: ${snapshot.snapshotId}`);
	}

	// Delete from DB
	await db.delete(sandboxSnapshots).where(eq(sandboxSnapshots.id, snapshotDbId));

	return c.json({ success: true });
});

export default api;
