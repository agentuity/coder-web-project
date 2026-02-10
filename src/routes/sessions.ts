/**
 * Session CRUD routes with sandbox lifecycle.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions, skills, sources, userSettings } from '../db/schema';
import { eq, desc } from '@agentuity/drizzle';
import {
	createSandbox,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
} from '../opencode';
import type { SandboxContext } from '../opencode';
import {
	isSandboxHealthy,
	getCachedHealthTimestamp,
	setCachedHealthTimestamp,
	SANDBOX_STATUS_TTL_MS,
} from '../lib/sandbox-health';
import { decrypt } from '../lib/encryption';

const api = createRouter();

interface CreateSessionBody {
	repoUrl?: string;
	branch?: string;
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
		{ model: body.model },
		workspaceSources.map((s) => ({
			name: s.name,
			type: s.type,
			config: (s.config || {}) as Record<string, unknown>,
			enabled: s.enabled ?? true,
		})),
	);

	const enabledSkills = workspaceSkills.filter((s) => s.enabled ?? true);
	const customSkills = enabledSkills
		.filter((s) => s.type !== 'registry')
		.map((s) => ({ name: s.name, content: s.content }));
	const registrySkills = enabledSkills
		.filter((s) => s.type === 'registry' && s.repo)
		.map((s) => ({ repo: s.repo as string, skillName: s.name }));

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
			agent: body.agent ?? null,
			model: body.model ?? null,
			metadata: { repoUrl: body.repoUrl, branch: body.branch },
		})
		.returning();

	// Capture context variables before async block (c may not be valid after response)
	const sandbox = c.var.sandbox;
	const logger = c.var.logger;
	const thread = c.var.thread;

	// Return session immediately so UI can show "Starting session..."
	// Do sandbox setup in background (fire-and-forget)
	(async () => {
		try {
			const sandboxCtx: SandboxContext = { sandbox, logger };
			let githubToken: string | undefined;
			try {
				const [settings] = await db
					.select()
					.from(userSettings)
					.where(eq(userSettings.userId, user.id));
				if (settings?.githubPat) {
					githubToken = decrypt(settings.githubPat);
				}
			} catch {
				logger.warn('Failed to load GitHub token for sandbox', { userId: user.id });
			}
			const { sandboxId, sandboxUrl } = await createSandbox(sandboxCtx, {
				repoUrl: body.repoUrl,
				branch: body.branch,
				opencodeConfigJson: serializeOpenCodeConfig(opencodeConfig),
				customSkills,
				registrySkills,
				githubToken,
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

			// Track in thread state
			if (thread?.state) {
				await thread.state.set('sessionId', session!.id);
				await thread.state.set('sandboxId', sandboxId);
				await thread.state.set('createdAt', new Date().toISOString());
				await thread.state.set('status', 'active');
				await thread.state.set('workspaceId', workspaceId);
			}

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
					metadata: { repoUrl: body.repoUrl, branch: body.branch, error: String(error) },
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

	const now = Date.now();
	const updatedSessions = await Promise.all(
		result.map(async (session) => {
			if (!session.sandboxId || !session.sandboxUrl) return session;
			if (!['active', 'creating'].includes(session.status)) return session;
			const lastChecked = getCachedHealthTimestamp(session.id) ?? 0;
			if (now - lastChecked < SANDBOX_STATUS_TTL_MS) return session;

			setCachedHealthTimestamp(session.id, now);
			const healthy = await isSandboxHealthy(session.sandboxUrl);
			if (healthy) return session;

			const [updated] = await db
				.update(chatSessions)
				.set({ status: 'terminated', updatedAt: new Date() })
				.where(eq(chatSessions.id, session.id))
				.returning();

			return updated ?? { ...session, status: 'terminated' };
		}),
	);

	return c.json(updatedSessions);
});

export default api;
