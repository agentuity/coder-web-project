/**
 * Chat routes — message proxy and SSE event streaming.
 *
 * Phase 3: async prompt, filtered SSE proxy, messages fetch,
 * permission/question reply endpoints.
 */
import { createRouter, sse } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { getOpencodeClient } from '../opencode';

const api = createRouter();

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/messages — fetch existing messages for page load
// ---------------------------------------------------------------------------
api.get('/:id/messages', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	try {
		const result = await client.session.messages({
			path: { id: session.opencodeSessionId },
		});
		return c.json((result as any)?.data || result);
	} catch (error) {
		return c.json({ error: 'Failed to get messages', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/messages — send message (async, non-blocking)
// ---------------------------------------------------------------------------
api.post('/:id/messages', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	const body = await c.req.json<{
		text: string;
		model?: string;
	}>();

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);

	try {
		const [providerID, modelID] = body.model ? body.model.split('/') : [];

		await client.session.promptAsync({
			path: { id: session.opencodeSessionId },
			body: {
				parts: [{ type: 'text' as const, text: body.text }],
				...(providerID && modelID ? { model: { providerID, modelID } } : {}),
			},
		});

		// Auto-title from first message if untitled
		if (!session.title && body.text) {
			const title = body.text.length > 60 ? body.text.slice(0, 57) + '...' : body.text;
			await db
				.update(chatSessions)
				.set({ title, updatedAt: new Date() })
				.where(eq(chatSessions.id, session.id));
		}

		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to send message', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/events — SSE event stream (filtered by session)
// ---------------------------------------------------------------------------
api.get(
	'/:id/events',
	sse(async (c, stream) => {
		const [session] = await db
			.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, c.req.param('id')!));
		if (!session || !session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
			await stream.writeSSE({
				data: JSON.stringify({ type: 'error', message: 'Session not ready' }),
			});
			stream.close();
			return;
		}

		// Use raw fetch to sandbox event stream for reliable SSE proxying
		try {
			const eventResponse = await fetch(`${session.sandboxUrl}/event`);
			if (!eventResponse.ok || !eventResponse.body) {
				await stream.writeSSE({
					data: JSON.stringify({ type: 'error', message: 'No event stream' }),
				});
				stream.close();
				return;
			}

			const reader = eventResponse.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const jsonStr = line.slice(6).trim();
						if (!jsonStr) continue;

						try {
							const event = JSON.parse(jsonStr);
							// Filter by session
							const props = (event as any)?.properties;
							const eventSessionId =
								props?.sessionID ||
								props?.info?.sessionID ||
								props?.info?.id ||
								props?.part?.sessionID;

							if (eventSessionId && eventSessionId !== session.opencodeSessionId) {
								continue;
							}

							await stream.writeSSE({ data: JSON.stringify(event) });
						} catch {
							// Skip malformed events
						}
					}
				}
			} catch {
				// Stream ended
			} finally {
				reader.releaseLock();
			}
		} catch (error) {
			await stream.writeSSE({
				data: JSON.stringify({ type: 'error', message: String(error) }),
			});
		}

		stream.close();
	}),
);

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/abort — abort running session
// ---------------------------------------------------------------------------
api.post('/:id/abort', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	try {
		await client.session.abort({ path: { id: session.opencodeSessionId } });
		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to abort', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/diff — get session diffs
// ---------------------------------------------------------------------------
api.get('/:id/diff', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	try {
		const result = await client.session.diff({ path: { id: session.opencodeSessionId } });
		return c.json((result as any)?.data || result);
	} catch (error) {
		return c.json({ error: 'Failed to get diffs', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/permissions/:reqId — reply to a permission request
// ---------------------------------------------------------------------------
api.post('/:id/permissions/:reqId', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	const body = await c.req.json<{ reply: 'once' | 'always' | 'reject' }>();
	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);

	try {
		await client.postSessionIdPermissionsPermissionId({
			path: {
				id: session.opencodeSessionId,
				permissionID: c.req.param('reqId')!,
			},
			body: { response: body.reply },
		});
		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to reply to permission', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/questions/:reqId — reply to a question
// NOTE: The SDK does not expose a dedicated question.reply method.
//       We fall back to posting directly to the expected REST endpoint.
// ---------------------------------------------------------------------------
api.post('/:id/questions/:reqId', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	const body = await c.req.json<{ answers: string[][] }>();
	const reqId = c.req.param('reqId')!;

	try {
		// Direct REST call since the SDK does not have a typed question reply method
		const resp = await fetch(
			`${session.sandboxUrl}/session/${session.opencodeSessionId}/questions/${reqId}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ answers: body.answers }),
			},
		);
		if (!resp.ok) {
			const text = await resp.text();
			return c.json({ error: 'Failed to reply to question', details: text }, 500);
		}
		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Failed to reply to question', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/files — list files in sandbox directory
// ---------------------------------------------------------------------------
api.get('/:id/files', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const path = c.req.query('path') || '/home/agentuity/project';

	try {
		// Runtime returns a full Sandbox object from get(), but the type is SandboxInfo.
		// The actual implementation supports execute() — cast to any for the call.
		const sandbox = (await c.var.sandbox.get(session.sandboxId)) as any;
		const result = await sandbox.execute({
			command: [
				'find',
				path,
				'-maxdepth',
				'1',
				'-not',
				'-path',
				path,
				'-printf',
				'%y %P\n',
			],
		});

		const output: string =
			result.stdout ?? result.output ?? (typeof result === 'string' ? result : '');
		const entries = output
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line: string) => {
				const [type, ...nameParts] = line.split(' ');
				const name = nameParts.join(' ');
				return {
					name,
					path: `${path}/${name}`.replace(/\/+/g, '/'),
					type: type === 'd' ? 'directory' : 'file',
				};
			})
			.sort((a: { type: string; name: string }, b: { type: string; name: string }) => {
				if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

		return c.json({ path, entries });
	} catch (error) {
		return c.json({ error: 'Failed to list files', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/files/content — read file content from sandbox
// ---------------------------------------------------------------------------
api.get('/:id/files/content', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const filePath = c.req.query('path');
	if (!filePath) return c.json({ error: 'Missing path parameter' }, 400);

	// Security: ensure path is under /home/agentuity
	if (!filePath.startsWith('/home/agentuity')) {
		return c.json({ error: 'Access denied: path must be under /home/agentuity' }, 403);
	}

	try {
		const sandbox = (await c.var.sandbox.get(session.sandboxId)) as any;
		const result = await sandbox.execute({
			command: ['cat', filePath],
		});

		const content: string =
			result.stdout ?? result.output ?? (typeof result === 'string' ? result : '');
		const ext = filePath.split('.').pop() || '';

		return c.json({ path: filePath, content, extension: ext });
	} catch (error) {
		return c.json({ error: 'Failed to read file', details: String(error) }, 500);
	}
});

export default api;
