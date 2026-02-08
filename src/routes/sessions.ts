/**
 * Session CRUD routes with sandbox lifecycle.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions, skills, sources } from '../db/schema';
import { eq, desc } from '@agentuity/drizzle';
import {
	createSandbox,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
} from '../opencode';
import type { SandboxContext } from '../opencode';

const api = createRouter();

interface CreateSessionBody {
	repoUrl?: string;
	prompt?: string;
	agent?: string;
	model?: string;
}

// POST /api/workspaces/:wid/sessions — create session with sandbox
api.post('/', async (c) => {
	const user = c.get('user')!;
	const workspaceId = c.req.param('wid') as string;
	const body: CreateSessionBody = await c.req.json<CreateSessionBody>().catch(() => ({}));

	// Fetch workspace skills and sources for config
	const [workspaceSkills, workspaceSources] = await Promise.all([
		db.select().from(skills).where(eq(skills.workspaceId, workspaceId)),
		db.select().from(sources).where(eq(sources.workspaceId, workspaceId)),
	]);

	// Generate OpenCode config
	const opencodeConfig = generateOpenCodeConfig(
		{},
		workspaceSkills.map((s) => ({ name: s.name, content: s.content, enabled: s.enabled ?? true })),
		workspaceSources.map((s) => ({
			name: s.name,
			type: s.type,
			config: (s.config || {}) as Record<string, unknown>,
			enabled: s.enabled ?? true,
		})),
	);

	// Auto-title from initial prompt
	const title = body.prompt
		? body.prompt.length > 60
			? body.prompt.slice(0, 57) + '...'
			: body.prompt
		: null;

	// Create session record first (status: creating)
	const [session] = await db
		.insert(chatSessions)
		.values({
			workspaceId,
			createdBy: user.id,
			status: 'creating',
			title,
			agent: body.agent || 'build',
			model: body.model || 'anthropic/claude-sonnet-4-5',
			metadata: { repoUrl: body.repoUrl },
		})
		.returning();

	// Capture context variables before async block (c may not be valid after response)
	const sandbox = c.var.sandbox;
	const logger = c.var.logger;

	// Return session immediately so UI can show "Starting session..."
	// Do sandbox setup in background (fire-and-forget)
	(async () => {
		try {
			const sandboxCtx: SandboxContext = { sandbox, logger };
			const { sandboxId, sandboxUrl } = await createSandbox(sandboxCtx, {
				repoUrl: body.repoUrl,
				opencodeConfigJson: serializeOpenCodeConfig(opencodeConfig),
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

			// Send initial prompt async (fire-and-forget)
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
					metadata: { error: String(error) },
					updatedAt: new Date(),
				})
				.where(eq(chatSessions.id, session!.id));
		}
	})();

	return c.json(session, 201);
});

// GET /api/workspaces/:wid/sessions — list sessions
api.get('/', async (c) => {
	const workspaceId = c.req.param('wid') as string;
	const result = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.workspaceId, workspaceId))
		.orderBy(desc(chatSessions.createdAt));
	return c.json(result);
});

export default api;
