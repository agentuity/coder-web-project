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
import { sandboxListFiles, sandboxReadFile, sandboxExecute, sandboxSetEnv, sandboxWriteFiles } from '@agentuity/server';
import { normalizeSandboxPath } from '../lib/path-utils';

const SANDBOX_HOME = '/home/agentuity';

/** Ensure a sandbox file path is absolute (rooted at /home/agentuity). */
function toAbsoluteSandboxPath(p: string): string {
	if (p.startsWith(SANDBOX_HOME)) return p;
	// Strip leading slash for joining
	const rel = p.startsWith('/') ? p.slice(1) : p;
	return `${SANDBOX_HOME}/${rel}`;
}

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
		command?: string;
	}>();

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);

	try {
		if (body.command) {
			// Slash command → use the command endpoint (POST /session/:id/command)
			await client.session.command({
				path: { id: session.opencodeSessionId },
				body: {
					command: body.command.replace(/^\//, ''),
					arguments: body.text,
				},
			});
		} else {
			// Regular chat → use promptAsync
			const [providerID, modelID] = body.model ? body.model.split('/') : [];
			await client.session.promptAsync({
				path: { id: session.opencodeSessionId },
				body: {
					parts: [{ type: 'text' as const, text: body.text }],
					...(providerID && modelID ? { model: { providerID, modelID } } : {}),
				},
			});
		}

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
// GET /api/sessions/:id/env — read sandbox environment variables
// ---------------------------------------------------------------------------
api.get('/:id/env', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	try {
		const apiClient = (c.var.sandbox as any).client;
		const execution = await sandboxExecute(apiClient, {
			sandboxId: session.sandboxId,
			options: {
				command: ['bash', '-c', 'printenv'],
				timeout: '10s',
			},
		});

		if (execution.status !== 'completed' || !execution.stdoutStreamUrl) {
			return c.json({ error: 'Failed to read environment variables' }, 500);
		}

		const stdoutResp = await fetch(execution.stdoutStreamUrl);
		const stdout = await stdoutResp.text();

		const env: Record<string, string> = {};
		for (const line of stdout.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const eqIdx = trimmed.indexOf('=');
			if (eqIdx <= 0) continue;
			const key = trimmed.slice(0, eqIdx);
			const value = trimmed.slice(eqIdx + 1);
			env[key] = value;
		}

		return c.json({ env });
	} catch (error) {
		return c.json({ error: 'Failed to read environment variables', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// PUT /api/sessions/:id/env — update sandbox environment variables
// ---------------------------------------------------------------------------
api.put('/:id/env', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const body = await c.req
		.json<{ env?: Record<string, string | null> }>()
		.catch(() => ({ env: undefined }));
	const envPayload = body.env && typeof body.env === 'object' ? body.env : null;
	if (!envPayload || Object.keys(envPayload).length === 0) {
		return c.json({ error: 'Missing env payload' }, 400);
	}

	try {
		const apiClient = (c.var.sandbox as any).client;
		const result = await sandboxSetEnv(apiClient, {
			sandboxId: session.sandboxId,
			env: envPayload,
		});

		const env: Record<string, string | null> = {};
		for (const key of Object.keys(envPayload)) {
			env[key] = result.env[key] ?? null;
		}

		return c.json({ success: true, env });
	} catch (error) {
		return c.json({ error: 'Failed to update environment variables', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/files — list files in sandbox directory
// Uses sandboxExecute with `find` for reliable, deduplicated file listing.
// ---------------------------------------------------------------------------
api.get('/:id/files', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const rawPath = c.req.query('path') || '/';
	const dirPath = rawPath === '/' ? SANDBOX_HOME : toAbsoluteSandboxPath(rawPath);

	try {
		const apiClient = (c.var.sandbox as any).client;

		const execution = await sandboxExecute(apiClient, {
			sandboxId: session.sandboxId,
			options: {
				command: [
					'find',
					dirPath,
					'-maxdepth',
					'3',
					'-not',
					'-path',
					'*/node_modules/*',
					'-not',
					'-path',
					'*/.git/*',
					'-not',
					'-path',
					'*/.cache/*',
					'-not',
					'-path',
					'*/.bun/*',
					'-not',
					'-path',
					'*/.config/*',
					'-not',
					'-path',
					'*/.local/*',
					'-not',
					'-path',
					'*/.tmp/*',
					'-not',
					'-path',
					'*/.npm/*',
					'-not',
					'-path',
					'*/.yarn/*',
				'-not',
				'-path',
				'*/.oh-my-*',
				'-not',
				'-path',
				'*/dist/*',
				'-not',
				'-path',
				'*/.agentuity/*',
				'-not',
				'-path',
				'*/.next/*',
				'-not',
				'-path',
				'*/__pycache__/*',
				'-not',
				'-name',
				'.',
					'-printf',
					'%y %s %p\\n',
				],
				timeout: '10s',
			},
		});

		if (execution.status !== 'completed' || !execution.stdoutStreamUrl) {
			// Fall back to sandboxListFiles if execute fails
			const result = await sandboxListFiles(apiClient, {
				sandboxId: session.sandboxId,
				path: dirPath === '/home/agentuity' ? undefined : dirPath,
			});
			const seen = new Set<string>();
			const entries = result.files
				.map((f) => {
					const name = f.path.split('/').pop() || f.path;
					const abs = normalizeSandboxPath(rawPath, f.path);
					return {
						name,
						path: abs,
						type: f.isDir ? ('directory' as const) : ('file' as const),
						size: f.size,
					};
				})
				.filter((e) => {
					if (seen.has(e.path)) return false;
					seen.add(e.path);
					return true;
				})
				.sort((a, b) => {
					if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
					return a.name.localeCompare(b.name);
				});
			return c.json({ path: rawPath, entries });
		}

		// Fetch stdout content from the stream URL
		const stdoutResp = await fetch(execution.stdoutStreamUrl);
		const stdout = await stdoutResp.text();

		const entries = stdout
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => {
				// Format: "d 4096 /path/to/dir" or "f 1234 /path/to/file"
				const match = line.match(/^(\w)\s+(\d+)\s+(.+)$/);
				if (!match) return null;

				const typeChar = match[1]!;
				const sizeStr = match[2]!;
				const fullPath = match[3]!;
				// Skip the directory itself (find includes the base path)
				if (fullPath === dirPath) return null;

				const name = fullPath.split('/').pop() || fullPath;
				const type = typeChar === 'd' ? ('directory' as const) : ('file' as const);
				const size = parseInt(sizeStr, 10);

				return { name, path: fullPath, type, size };
			})
			.filter((e): e is NonNullable<typeof e> => Boolean(e))
			.sort((a, b) => {
				if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

		return c.json({ path: rawPath, entries });
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

	const rawFilePath = c.req.query('path');
	if (!rawFilePath) return c.json({ error: 'Missing path parameter' }, 400);

	const filePath = toAbsoluteSandboxPath(rawFilePath);

	try {
		const apiClient = (c.var.sandbox as any).client;
		const stream = await sandboxReadFile(apiClient, {
			sandboxId: session.sandboxId,
			path: filePath,
		});

		// Read the stream to get content as string
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const merged = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.length;
		}
		const content = new TextDecoder().decode(merged);
		const ext = filePath.split('.').pop() || '';

		return c.json({ path: filePath, content, extension: ext });
	} catch (error) {
		return c.json({ error: 'Failed to read file', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// PUT /api/sessions/:id/files/content — write file content to sandbox
// Body: { path: string, content: string }
// ---------------------------------------------------------------------------
api.put('/:id/files/content', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const body = await c.req
		.json<{ path?: string; content?: string }>()
		.catch(() => ({ path: undefined, content: undefined }));
	if (!body.path) return c.json({ error: 'Missing path parameter' }, 400);
	if (typeof body.content !== 'string') return c.json({ error: 'Missing content' }, 400);

	const filePath = toAbsoluteSandboxPath(body.path);

	try {
		const apiClient = (c.var.sandbox as any).client;
		await sandboxWriteFiles(apiClient, {
			sandboxId: session.sandboxId,
			files: [{ path: filePath, content: Buffer.from(body.content) }],
		});

		return c.json({ success: true, path: filePath });
	} catch (error) {
		console.error('File write error:', error);
		return c.json({ error: 'Failed to write file', details: String(error) }, 500);
	}
});

export default api;
