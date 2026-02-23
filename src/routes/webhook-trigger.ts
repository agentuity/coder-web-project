/**
 * Public webhook trigger endpoint.
 * POST /api/webhooks/:id/trigger
 *
 * This endpoint is public (no auth middleware) — it authenticates via the
 * webhook's secret token in the Authorization header or query param.
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import {
	webhooks,
	workspaces,
	chatSessions,
	skills,
	sources,
	userSettings,
} from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import {
	createSandbox,
	generateOpenCodeConfig,
	serializeOpenCodeConfig,
	getOpencodeClient,
} from '../opencode';
import type { SandboxContext } from '../opencode';
import { decrypt } from '../lib/encryption';
import { encrypt } from '../lib/encryption';

const api = createRouter();

// POST /api/webhooks/:id/trigger — trigger a webhook (PUBLIC)
api.post('/:id/trigger', async (c) => {
	const webhookId = c.req.param('id') as string;

	// 1. Look up webhook
	const [webhook] = await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.id, webhookId));
	if (!webhook) return c.json({ error: 'Webhook not found' }, 404);
	if (!webhook.enabled) return c.json({ error: 'Webhook is disabled' }, 403);

	// 2. Read the raw body once (needed for HMAC verification and parsing)
	let rawBody: string;
	try {
		rawBody = await c.req.text();
	} catch {
		rawBody = '';
	}

	// 3. Authenticate: GitHub HMAC → Bearer token → query param
	let authenticated = false;

	// 3a. GitHub HMAC signature (X-Hub-Signature-256: sha256=<hex>)
	const hubSignature = c.req.header('X-Hub-Signature-256');
	if (hubSignature && webhook.secret) {
		const hmac = createHmac('sha256', webhook.secret);
		hmac.update(rawBody);
		const computed = `sha256=${hmac.digest('hex')}`;
		// Timing-safe comparison — pad to equal length to avoid length leak
		const sigBuf = Buffer.from(hubSignature);
		const computedBuf = Buffer.from(computed);
		if (sigBuf.length === computedBuf.length && timingSafeEqual(sigBuf, computedBuf)) {
			authenticated = true;
		}
	}

	// 3b. Bearer token
	if (!authenticated) {
		const authHeader = c.req.header('Authorization');
		if (authHeader) {
			const token = authHeader.replace(/^Bearer\s+/i, '');
			authenticated = token === webhook.secret;
		}
	}

	// 3c. Query param secret
	if (!authenticated) {
		const querySecret = c.req.query('secret');
		if (querySecret) {
			authenticated = querySecret === webhook.secret;
		}
	}

	if (!authenticated) return c.json({ error: 'Unauthorized' }, 401);

	// 4. Parse the body based on content type
	let payload: unknown = {};
	const contentType = (c.req.header('Content-Type') ?? '').toLowerCase();
	try {
		if (contentType.includes('application/x-www-form-urlencoded')) {
			// GitHub sends JSON in a "payload" form field when configured for form encoding
			const params = new URLSearchParams(rawBody);
			const payloadField = params.get('payload');
			if (payloadField) {
				payload = JSON.parse(payloadField);
			}
		} else if (contentType.includes('application/json')) {
			payload = JSON.parse(rawBody);
		} else {
			// No content-type or unknown — try JSON, fall back to empty object
			if (rawBody) {
				payload = JSON.parse(rawBody);
			}
		}
	} catch {
		// If parsing fails, use empty object
	}

	// 5. Look up workspace, creator settings, sources, skills
	const [workspaceRow] = await db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, webhook.workspaceId));
	if (!workspaceRow) return c.json({ error: 'Workspace not found' }, 404);

	const [workspaceSources, workspaceSkills, [userSettingsRow]] =
		await Promise.all([
			db.select().from(sources).where(eq(sources.workspaceId, webhook.workspaceId)),
			db.select().from(skills).where(eq(skills.workspaceId, webhook.workspaceId)),
			db.select().from(userSettings).where(eq(userSettings.userId, webhook.createdBy)),
		]);

	// 6. Build the combined prompt
	const payloadJson = JSON.stringify(payload, null, 2);
	const combinedPrompt = `${webhook.prompt}\n\n## Webhook Payload\n\`\`\`json\n${payloadJson}\n\`\`\``;

	// 7. Generate OpenCode config
	const workspaceSettings = (workspaceRow.settings ?? {}) as {
		envVars?: Record<string, string>;
	};
	const workspaceEnvVars = workspaceSettings.envVars ?? {};

	const opencodeConfig = generateOpenCodeConfig(
		{ model: null, defaultCommand: userSettingsRow?.defaultCommand },
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
		.map((s) => ({ name: s.name, content: s.content, description: s.description ?? undefined }));
	const registrySkills = enabledSkills
		.filter((s) => s.type === 'registry' && s.repo)
		.map((s) => ({ repo: s.repo as string, skillName: s.name }));

	// Auto-title from the webhook name + prompt start
	const title = `Webhook: ${webhook.name}`;

	// 8. Create session record (status: creating)
	const sessionId = randomUUID();
	const insertedRows = await db
		.insert(chatSessions)
		.values({
			id: sessionId,
			workspaceId: webhook.workspaceId,
			createdBy: webhook.createdBy,
			status: 'creating',
			title,
			agent: null,
			model: null,
			metadata: { webhookId: webhook.id, webhookName: webhook.name },
		})
		.onConflictDoNothing()
		.returning();

	let session = insertedRows[0];
	if (!session) {
		const [existing] = await db
			.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId))
			.limit(1);
		session = existing;
	}

	// Capture context variables before async block
	const sandbox = c.var.sandbox;
	const logger = c.var.logger;

	// 9. Fire-and-forget sandbox creation + prompt sending
	(async () => {
		try {
			const sandboxCtx: SandboxContext = {
				sandbox: sandbox as any,
				logger,
			};

			let githubToken: string | undefined;
			try {
				if (userSettingsRow?.githubPat) {
					githubToken = decrypt(userSettingsRow.githubPat);
				}
			} catch {
				logger.warn('Failed to load GitHub token for webhook sandbox', {
					webhookId: webhook.id,
				});
			}

			const result = await createSandbox(sandboxCtx, {
				opencodeConfigJson: serializeOpenCodeConfig(opencodeConfig),
				customSkills,
				registrySkills,
				githubToken,
				env: workspaceEnvVars,
			});

			const client = getOpencodeClient(
				result.sandboxId,
				result.sandboxUrl,
				result.password,
			);

			let opencodeSessionId: string | null = null;
			for (let attempt = 1; attempt <= 5; attempt++) {
				try {
					const opencodeSession = await client.session.create({ body: {} });
					opencodeSessionId =
						(opencodeSession as any)?.data?.id ||
						(opencodeSession as any)?.id ||
						(opencodeSession as any)?.sessionId ||
						(opencodeSession as any)?.session?.id ||
						null;
					if (opencodeSessionId) break;
				} catch (err) {
					logger.warn(`webhook session.create attempt ${attempt} failed`, {
						error: String(err),
					});
				}
				if (attempt < 5)
					await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
			}

			const newStatus = opencodeSessionId ? 'active' : 'creating';
			const encryptedPassword = encrypt(result.password);

			await db
				.update(chatSessions)
				.set({
					sandboxId: result.sandboxId,
					sandboxUrl: result.sandboxUrl,
					opencodeSessionId,
					status: newStatus,
					updatedAt: new Date(),
					metadata: {
						webhookId: webhook.id,
						webhookName: webhook.name,
						opencodePassword: encryptedPassword,
					},
				})
				.where(eq(chatSessions.id, session!.id));

			// Send the combined prompt
			if (opencodeSessionId) {
				try {
					await client.session.promptAsync({
						path: { id: opencodeSessionId },
						body: {
							parts: [{ type: 'text', text: combinedPrompt }],
						},
					});
				} catch (err) {
					logger.warn('Failed to send webhook prompt', { error: err });
				}
			}
		} catch (error) {
			logger.error(`Webhook session creation failed: ${String(error)}`, {
				webhookId: webhook.id,
				sessionId: session!.id,
			});

			await db
				.update(chatSessions)
				.set({
					status: 'error',
					metadata: {
						webhookId: webhook.id,
						webhookName: webhook.name,
						error: String(error),
					},
					updatedAt: new Date(),
				})
				.where(eq(chatSessions.id, session!.id));
		}
	})();

	// Return immediately
	return c.json({ sessionId: session!.id, status: 'creating' }, 201);
});

export default api;
