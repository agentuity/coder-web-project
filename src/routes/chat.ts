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
import { sandboxListFiles, sandboxReadFile, sandboxExecute, sandboxWriteFiles } from '@agentuity/server';
import { normalizeSandboxPath } from '../lib/path-utils';
import { SpanStatusCode } from '@opentelemetry/api';
import { COMMAND_TO_AGENT, TEMPLATE_COMMANDS } from '../lib/agent-commands';

const SANDBOX_HOME = '/home/agentuity';
const UPLOADS_DIR = `${SANDBOX_HOME}/uploads`;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
	'txt',
	'md',
	'mdx',
	'json',
	'js',
	'jsx',
	'ts',
	'tsx',
	'py',
	'java',
	'go',
	'rs',
	'rb',
	'php',
	'sh',
	'yaml',
	'yml',
	'toml',
	'csv',
	'log',
]);

/** Ensure a sandbox file path is absolute (rooted at /home/agentuity). */
function toAbsoluteSandboxPath(p: string): string {
	if (p.startsWith(SANDBOX_HOME)) {
		// Even if it starts with SANDBOX_HOME, normalize to prevent /home/agentuity/../../../etc/passwd
		const normalized = new URL(p, 'file:///').pathname;
		if (!normalized.startsWith(SANDBOX_HOME)) {
			throw new Error('Path traversal detected');
		}
		return normalized;
	}
	const rel = p.startsWith('/') ? p.slice(1) : p;
	const joined = `${SANDBOX_HOME}/${rel}`;
	// Use URL to normalize the path (resolves .., ., double slashes)
	const normalized = new URL(joined, 'file:///').pathname;
	if (!normalized.startsWith(SANDBOX_HOME)) {
		throw new Error('Path traversal detected');
	}
	return normalized;
}

function sanitizeFilename(filename: string, fallback: string) {
	const trimmed = filename.trim().split('/').pop()?.split('\\').pop() || '';
	const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
	return safe || fallback;
}

function isAllowedFilename(filename: string) {
	const ext = filename.split('.').pop()?.toLowerCase() || '';
	return ALLOWED_EXTENSIONS.has(ext);
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

	c.var.session.metadata.action = 'get-messages';
	c.var.session.metadata.sessionDbId = session.id;

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

	c.var.session.metadata.action = 'send-message';
	c.var.session.metadata.sessionDbId = session.id;

	const body = await c.req.json<{
		text: string;
		model?: string;
		command?: string;
		attachments?: Array<{ filename: string; mime: string; content: string }>;
	}>();

	const messageText = typeof body.text === 'string' ? body.text : '';
	const attachments = Array.isArray(body.attachments) ? body.attachments : [];
	if (attachments.length > MAX_ATTACHMENTS) {
		return c.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS}).` }, 400);
	}
	if (body.command && attachments.length > 0) {
		return c.json({ error: 'Attachments are not supported for commands.' }, 400);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	const apiClient = (c.var.sandbox as any).client;
	const fileParts: Array<{ type: 'file'; mime: string; filename?: string; url: string }> = [];

	if (attachments.length > 0) {
		const execution = await sandboxExecute(apiClient, {
			sandboxId: session.sandboxId,
			options: {
				command: ['bash', '-c', `mkdir -p '${UPLOADS_DIR}'`],
				timeout: '10s',
			},
		});
		if (execution.status !== 'completed') {
			return c.json({ error: 'Failed to prepare upload directory.' }, 500);
		}

		const now = Date.now();
		const filesToWrite: { path: string; content: Buffer }[] = [];
		for (const [index, attachment] of attachments.entries()) {
			if (!attachment?.filename || !attachment?.content) {
				return c.json({ error: 'Invalid attachment payload.' }, 400);
			}
			const safeName = sanitizeFilename(attachment.filename, `attachment-${index}`);
			if (!isAllowedFilename(safeName)) {
				return c.json({ error: `Unsupported file type: ${attachment.filename}` }, 400);
			}
			const buffer = Buffer.from(attachment.content, 'base64');
			if (buffer.length > MAX_ATTACHMENT_SIZE) {
				return c.json({ error: `Attachment too large: ${attachment.filename}` }, 400);
			}
			const filename = `${now}-${index}-${safeName}`;
			const filePath = `${UPLOADS_DIR}/${filename}`;
			filesToWrite.push({ path: filePath, content: buffer });
			fileParts.push({
				type: 'file',
				mime: attachment.mime || 'application/octet-stream',
				filename: safeName,
				url: `file://${filePath}`,
			});
		}

		await sandboxWriteFiles(apiClient, {
			sandboxId: session.sandboxId,
			files: filesToWrite,
		});
	}

	return c.var.tracer.startActiveSpan('chat.send-message', async (span) => {
		span.setAttribute('sessionDbId', session.id);
		span.setAttribute('hasAttachments', attachments.length > 0);
		span.setAttribute('hasCommand', !!body.command);
		try {
			// Determine the command slug from explicit command or session's stored agent.
			// If command is explicitly '' (user chose "Chat"), don't fall back to stored agent.
			const commandSlug = typeof body.command === 'string'
				? (body.command ? body.command.replace(/^\//, '') : null)
				: session.agent || null;

			const [providerID, modelID] = body.model ? body.model.split('/') : [];

			// Template commands (cadence, memory-save, cloud, sandbox, etc.) MUST be
			// sent as slash command text so OpenCode expands their templates.
			// Non-template commands (agentuity-coder, review, etc.) use the agent field.
			if (commandSlug && TEMPLATE_COMMANDS.has(commandSlug)) {
				// Send as slash command: "/<command> <text>" — OpenCode expands the template
				await client.session.promptAsync({
					path: { id: session.opencodeSessionId! },
					body: {
						parts: [{ type: 'text' as const, text: `/${commandSlug} ${messageText}` }, ...fileParts],
						...(providerID && modelID ? { model: { providerID, modelID } } : {}),
					},
				});
			} else {
				const agentName = commandSlug
					? (COMMAND_TO_AGENT[commandSlug] || commandSlug)
					: undefined;
				await client.session.promptAsync({
					path: { id: session.opencodeSessionId! },
					body: {
						parts: [{ type: 'text' as const, text: messageText }, ...fileParts],
						...(agentName ? { agent: agentName } : {}),
						...(providerID && modelID ? { model: { providerID, modelID } } : {}),
					},
				});
			}

			// Persist the agent on the session for real agents (not one-shot template commands).
			// Cadence uses the Agentuity Coder team — persist as agentuity-coder.
			const persistAgent = commandSlug === 'agentuity-cadence' ? 'agentuity-coder' :
				(commandSlug && !TEMPLATE_COMMANDS.has(commandSlug)) ? commandSlug : null;
			if (persistAgent && persistAgent !== session.agent) {
				await db
					.update(chatSessions)
					.set({ agent: persistAgent, updatedAt: new Date() })
					.where(eq(chatSessions.id, session.id));
			}

			// Auto-title from first message if untitled
			if (!session.title && messageText) {
				const title = messageText.length > 60 ? messageText.slice(0, 57) + '...' : messageText;
				await db
					.update(chatSessions)
					.set({ title, updatedAt: new Date() })
					.where(eq(chatSessions.id, session.id));
			}

			// Update thread context with latest activity
			const { updateThreadContext } = await import('../lib/thread-context');
			await updateThreadContext(c.var.thread, {
				sessionDbId: session.id,
				title: session.title ?? null,
				lastActivityAt: new Date().toISOString(),
				lastMessagePreview: messageText.length > 200 ? messageText.slice(0, 200) : messageText,
			});

			// Tag thread metadata
			const existingMeta = await c.var.thread.getMetadata();
			await c.var.thread.setMetadata({ ...existingMeta, sessionDbId: session.id });

			span.setStatus({ code: SpanStatusCode.OK });
			return c.json({ success: true });
		} catch (error) {
			span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
			return c.json({ error: 'Failed to send message', details: String(error) }, 500);
		}
	});
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

		const logger = c.var.logger;
		let closed = false;
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
		let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

		const safeWrite = async (message: { data: string; event?: string }) => {
			if (closed) return;
			try {
				await stream.writeSSE(message);
			} catch (error) {
				closed = true;
				if (keepaliveTimer) clearInterval(keepaliveTimer);
				logger?.warn?.('SSE write failed', { error: String(error) });
			}
		};

		const sendSessionError = async (message: string, details?: unknown) => {
			await safeWrite({
				data: JSON.stringify({
					type: 'session.error',
					properties: {
						sessionID: session.opencodeSessionId,
						error: message,
						...(details ? { details } : {}),
					},
				}),
			});
		};

		stream.onAbort(() => {
			closed = true;
			if (keepaliveTimer) clearInterval(keepaliveTimer);
			if (reader) {
				reader.cancel().catch(() => undefined);
			}
		});

		keepaliveTimer = setInterval(() => {
			void safeWrite({ event: 'ping', data: 'ping' });
		}, 15000);

		// Use raw fetch to sandbox event stream for reliable SSE proxying
		try {
			const eventResponse = await fetch(`${session.sandboxUrl}/event`);
			if (!eventResponse.ok || !eventResponse.body) {
				await sendSessionError('No event stream', { status: eventResponse.status });
				return;
			}

			reader = eventResponse.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (!closed) {
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

						await safeWrite({ data: JSON.stringify(event) });
					} catch {
						// Skip malformed events
					}
					}
				}
				if (!closed) {
					await sendSessionError('Event stream ended');
				}
			} catch (error) {
				if (!closed) {
					await sendSessionError('Event stream disconnected', { error: String(error) });
				}
			} finally {
				reader.releaseLock();
			}
		} catch (error) {
			if (!closed) {
				await sendSessionError('Failed to proxy event stream', { error: String(error) });
			}
		} finally {
			closed = true;
			if (keepaliveTimer) clearInterval(keepaliveTimer);
			stream.close();
		}
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

	c.var.session.metadata.action = 'abort-session';
	c.var.session.metadata.sessionDbId = session.id;

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

	c.var.session.metadata.action = 'get-diff';
	c.var.session.metadata.sessionDbId = session.id;

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

	c.var.session.metadata.action = 'reply-permission';
	c.var.session.metadata.sessionDbId = session.id;

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

	c.var.session.metadata.action = 'reply-question';
	c.var.session.metadata.sessionDbId = session.id;

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
// POST /api/sessions/:id/revert — revert session to a specific message
// ---------------------------------------------------------------------------
api.post('/:id/revert', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	c.var.session.metadata.action = 'revert';
	c.var.session.metadata.sessionDbId = session.id;

	const body = (await c.req.json().catch(() => ({}))) as {
		messageID?: string;
		partID?: string;
	};
	if (!body.messageID) {
		return c.json({ error: 'messageID is required' }, 400);
	}

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	try {
		const result = await client.session.revert({
			path: { id: session.opencodeSessionId },
			body: {
				messageID: body.messageID,
				...(body.partID ? { partID: body.partID } : {}),
			},
		});
		return c.json({ success: true, session: result.data });
	} catch (error) {
		return c.json({ error: 'Failed to revert', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:id/unrevert — undo a revert
// ---------------------------------------------------------------------------
api.post('/:id/unrevert', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId || !session.sandboxUrl || !session.opencodeSessionId) {
		return c.json({ error: 'Session sandbox not ready' }, 503);
	}

	c.var.session.metadata.action = 'unrevert';
	c.var.session.metadata.sessionDbId = session.id;

	const client = getOpencodeClient(session.sandboxId, session.sandboxUrl);
	try {
		const result = await client.session.unrevert({
			path: { id: session.opencodeSessionId },
		});
		return c.json({ success: true, session: result.data });
	} catch (error) {
		return c.json({ error: 'Failed to unrevert', details: String(error) }, 500);
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

	c.var.session.metadata.action = 'list-files';
	c.var.session.metadata.sessionDbId = session.id;

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

	c.var.session.metadata.action = 'read-file';
	c.var.session.metadata.sessionDbId = session.id;

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

	c.var.session.metadata.action = 'write-file';
	c.var.session.metadata.sessionDbId = session.id;

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
