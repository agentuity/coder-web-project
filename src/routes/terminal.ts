/**
 * Terminal routes:
 *
 * POST /api/sessions/:id/terminal/token — returns an SSH token for direct
 *   Ion WebSocket connection from the frontend.
 *
 * GET  /api/sessions/:id/terminal — WebSocket proxy fallback. Spawns
 *   `agentuity cloud ssh <sandboxId>` and pipes stdin/stdout bidirectionally.
 */
import { createRouter, websocket } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import type { Subprocess } from 'bun';

const api = createRouter();

// ---------------------------------------------------------------------------
// POST /:id/terminal/token — SSH token endpoint (preferred path)
// ---------------------------------------------------------------------------
api.post('/:id/terminal/token', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));

	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	try {
		// Try to retrieve SSH token via the sandbox object first
		const sandbox = (await (c.var as any).sandbox?.get(session.sandboxId)) as any;

		if (sandbox?.sshToken || sandbox?.ssh?.token) {
			return c.json({
				token: sandbox.sshToken || sandbox.ssh.token,
				region: sandbox.region ?? null,
			});
		}

		// Fall back to the Agentuity platform API
		const apiUrl = process.env.AGENTUITY_API_URL || 'https://api.agentuity.cloud';
		const apiToken = process.env.AGENTUITY_API_KEY || process.env.AGENTUITY_TOKEN || '';

		const tokenRes = await fetch(`${apiUrl}/ssh/token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiToken}`,
			},
			body: JSON.stringify({ sandboxId: session.sandboxId }),
		});

		if (!tokenRes.ok) {
			const text = await tokenRes.text();
			return c.json({ error: 'Failed to get SSH token', details: text }, 500);
		}

		const tokenData = (await tokenRes.json()) as {
			success: boolean;
			data?: { token: string; region: string | null };
		};
		if (!tokenData.success || !tokenData.data) {
			return c.json({ error: 'SSH token request failed' }, 500);
		}

		return c.json(tokenData.data);
	} catch (error) {
		return c.json({ error: 'Failed to get SSH token', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /:id/terminal — WebSocket proxy fallback
// ---------------------------------------------------------------------------
api.get(
	'/:id/terminal',
	websocket((c, ws) => {
		const sessionId = c.req.param('id');
		let proc: Subprocess<'pipe', 'pipe', 'pipe'> | null = null;
		let alive = true;

		ws.onOpen(async () => {
			try {
				// Look up session to get sandboxId
				const [session] = await db
					.select()
					.from(chatSessions)
					.where(eq(chatSessions.id, sessionId!));

				if (!session || !session.sandboxId) {
					ws.send('\r\n\x1B[31mSession not found or no sandbox attached.\x1B[0m\r\n');
					return;
				}

				const sandboxId = session.sandboxId;

				// Spawn agentuity cloud ssh as a subprocess
				proc = Bun.spawn(['agentuity', 'cloud', 'ssh', sandboxId, '--', 'bash', '-l'], {
					stdin: 'pipe',
					stdout: 'pipe',
					stderr: 'pipe',
				});

				// Pipe stdout → WebSocket
				(async () => {
					const reader = proc!.stdout.getReader();
					try {
						while (alive) {
							const { done, value } = await reader.read();
							if (done) break;
							try {
								ws.send(value);
							} catch {
								// WS already closed
								break;
							}
						}
					} catch {
						/* stream ended */
					} finally {
						reader.releaseLock();
					}
				})();

				// Pipe stderr → WebSocket
				(async () => {
					const reader = proc!.stderr.getReader();
					try {
						while (alive) {
							const { done, value } = await reader.read();
							if (done) break;
							try {
								ws.send(value);
							} catch {
								break;
							}
						}
					} catch {
						/* stream ended */
					} finally {
						reader.releaseLock();
					}
				})();

				// When the process exits, notify the client
				proc.exited.then(() => {
					if (alive) {
						try {
							ws.send('\r\n\x1B[33m[Process exited]\x1B[0m\r\n');
						} catch {
							/* WS already closed */
						}
					}
				});
			} catch (err) {
				ws.send(`\r\n\x1B[31mError: ${String(err)}\x1B[0m\r\n`);
			}
		});

		// WebSocket messages → process stdin
		ws.onMessage((event) => {
			if (!proc) return;
			const data = (event as MessageEvent).data;
			try {
				if (typeof data === 'string') {
					proc.stdin.write(data);
					proc.stdin.flush();
				} else if (data instanceof ArrayBuffer) {
					proc.stdin.write(new Uint8Array(data));
					proc.stdin.flush();
				} else if (data instanceof Uint8Array) {
					proc.stdin.write(data);
					proc.stdin.flush();
				}
			} catch {
				/* stdin closed */
			}
		});

		// Cleanup on close
		ws.onClose(() => {
			alive = false;
			if (proc) {
				try {
					proc.kill();
				} catch {
					/* already dead */
				}
			}
		});
	}),
);

export default api;
