/**
 * Terminal routes:
 *
 * GET  /api/sessions/:id/terminal — WebSocket proxy. Spawns
 *   `agentuity cloud ssh <sandboxId>` and pipes stdin/stdout bidirectionally.
 */
import { createRouter, websocket } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import type { Subprocess } from 'bun';

const api = createRouter();

// ---------------------------------------------------------------------------
// GET /:id/terminal — WebSocket proxy
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
