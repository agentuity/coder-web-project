/**
 * Terminal panel — uses ghostty-web (WASM terminal emulator)
 * with direct WebSocket connection to Agentuity Ion SSH service,
 * falling back to the WebSocket subprocess proxy.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';

interface TerminalPanelProps {
	sessionId: string;
}

// Lazy-load ghostty WASM module (singleton)
let ghosttyPromise: Promise<typeof import('ghostty-web')> | null = null;
function loadGhostty() {
	if (!ghosttyPromise) {
		ghosttyPromise = import('ghostty-web').then(async (m) => {
			await m.init();
			return m;
		});
	}
	return ghosttyPromise;
}

export function TerminalPanel({ sessionId }: TerminalPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<import('ghostty-web').Terminal | null>(null);
	const fitAddonRef = useRef<import('ghostty-web').FitAddon | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const resizeCleanupRef = useRef<(() => void) | null>(null);
	const initRef = useRef(false);
	const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
	const [error, setError] = useState<string | null>(null);

	// Performance: reuse TextEncoder, batch writes
	const encoderRef = useRef(new TextEncoder());
	const writeBufferRef = useRef<Uint8Array[]>([]);
	const flushScheduledRef = useRef(false);

	const scheduleFlush = useCallback(() => {
		if (flushScheduledRef.current) return;
		flushScheduledRef.current = true;
		requestAnimationFrame(() => {
			flushScheduledRef.current = false;
			const term = terminalRef.current;
			const buffer = writeBufferRef.current;
			if (!term || buffer.length === 0) return;

			// Concatenate all chunks into one for efficient rendering
			const totalLength = buffer.reduce((sum, b) => sum + b.length, 0);
			const merged = new Uint8Array(totalLength);
			let offset = 0;
			for (const b of buffer) {
				merged.set(b, offset);
				offset += b.length;
			}
			term.write(merged);
			writeBufferRef.current = [];
		});
	}, []);

	// Connect WebSocket ref (stable across renders)
	const connectWebSocketRef = useRef<((cols: number, rows: number) => Promise<void>) | null>(null);

	const connectWebSocket = useCallback(
		async (cols: number, rows: number) => {
			try {
				setStatus('connecting');
				setError(null);

				// First, try to get an SSH token from our backend
				const tokenRes = await fetch(`/api/sessions/${sessionId}/terminal/token`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
				});

				let wsUrl: string;

				if (tokenRes.ok) {
					// Direct Ion SSH connection
					const tokenData = (await tokenRes.json()) as { token: string; region: string | null };
					const region = tokenData.region || '';
					// Determine Ion host
					const isDev =
						window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
					const ionHost = isDev
						? 'ion.agentuity.io'
						: region
							? `ion-${region}.agentuity.cloud`
							: 'ion.agentuity.cloud';
					const url = new URL('/ssh', `wss://${ionHost}`);
					url.searchParams.set('token', tokenData.token);
					url.searchParams.set('cols', String(cols));
					url.searchParams.set('rows', String(rows));
					wsUrl = url.toString();
				} else {
					// Fallback: connect through our WebSocket proxy
					const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
					wsUrl = `${protocol}//${window.location.host}/api/sessions/${sessionId}/terminal`;
				}

				const ws = new WebSocket(wsUrl);
				ws.binaryType = 'arraybuffer';
				wsRef.current = ws;

				ws.onopen = () => {
					setStatus('connected');
					if (terminalRef.current) {
						terminalRef.current.write('\x1b[32mConnected to SSH session\x1b[0m\r\n');
					}
					// Send initial resize (Ion protocol: 0x01 prefix + JSON)
					const resizeMsg = JSON.stringify({ cols, rows });
					const encoder = encoderRef.current;
					const jsonData = encoder.encode(resizeMsg);
					const message = new Uint8Array(jsonData.length + 1);
					message[0] = 0x01;
					message.set(jsonData, 1);
					ws.send(message);
				};

				ws.onmessage = (event) => {
					if (event.data instanceof ArrayBuffer && terminalRef.current) {
						writeBufferRef.current.push(new Uint8Array(event.data));
						scheduleFlush();
					}
				};

				ws.onerror = () => {
					setStatus('error');
					setError('Connection error');
				};

				ws.onclose = (event) => {
					setStatus('disconnected');
					if (terminalRef.current && event.code !== 1000) {
						terminalRef.current.write(
							`\r\n\x1b[33mConnection closed (code: ${event.code})\x1b[0m\r\n`,
						);
					}
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to connect';
				setStatus('error');
				setError(message);
				if (terminalRef.current) {
					terminalRef.current.write(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`);
				}
			}
		},
		[sessionId, scheduleFlush],
	);

	connectWebSocketRef.current = connectWebSocket;

	const handleReconnect = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		if (terminalRef.current) {
			terminalRef.current.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n');
			const cols = terminalRef.current.cols || 80;
			const rows = terminalRef.current.rows || 24;
			connectWebSocketRef.current?.(cols, rows);
		}
	}, []);

	useEffect(() => {
		if (initRef.current || !containerRef.current) return;
		initRef.current = true;

		const initTerminal = async () => {
			try {
				const ghosttyModule = await loadGhostty();

				const term = new ghosttyModule.Terminal({
					cursorBlink: true,
					fontSize: 13,
					fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
					theme: {
						background: '#0a0a0a',
						foreground: '#e4e4e7',
						cursor: '#ffffff',
						black: '#18181b',
						red: '#ef4444',
						green: '#22c55e',
						yellow: '#eab308',
						blue: '#3b82f6',
						magenta: '#a855f7',
						cyan: '#06b6d4',
						white: '#f4f4f5',
						brightBlack: '#52525b',
						brightRed: '#f87171',
						brightGreen: '#4ade80',
						brightYellow: '#facc15',
						brightBlue: '#60a5fa',
						brightMagenta: '#c084fc',
						brightCyan: '#22d3ee',
						brightWhite: '#ffffff',
					},
					scrollback: 5000,
				});

				const fitAddon = new ghosttyModule.FitAddon();
				term.loadAddon(fitAddon);
				term.open(containerRef.current!);

				terminalRef.current = term;
				fitAddonRef.current = fitAddon;

				let wsConnected = false;
				let lastWidth = 0;
				let lastHeight = 0;

				// ResizeObserver for auto-fitting and initial WebSocket connect
				const resizeObserver = new ResizeObserver((entries) => {
					const entry = entries[0];
					if (!entry) return;
					const { width, height } = entry.contentRect;
					if (Math.abs(width - lastWidth) < 5 && Math.abs(height - lastHeight) < 5) return;
					lastWidth = width;
					lastHeight = height;

					if (width > 0 && height > 0) {
						requestAnimationFrame(() => {
							fitAddonRef.current?.fit();
							// Connect WebSocket on first valid size
							if (!wsConnected) {
								wsConnected = true;
								connectWebSocketRef.current?.(term.cols, term.rows);
							}
						});
					}
				});
				resizeObserver.observe(containerRef.current!);
				resizeCleanupRef.current = () => resizeObserver.disconnect();

				// Terminal input → WebSocket
				term.onData((data: string) => {
					if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
						const encoded = encoderRef.current.encode(data);
						wsRef.current.send(encoded);
					}
				});

				// Terminal resize → WebSocket (Ion protocol: 0x01 prefix + JSON)
				term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
					if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
						const resizeMsg = JSON.stringify({ cols, rows });
						const jsonData = encoderRef.current.encode(resizeMsg);
						const message = new Uint8Array(jsonData.length + 1);
						message[0] = 0x01;
						message.set(jsonData, 1);
						wsRef.current.send(message);
					}
				});
			} catch (err) {
				console.error('Failed to initialize terminal:', err);
				setError('Failed to initialize terminal');
				setStatus('error');
			}
		};

		initTerminal();

		return () => {
			resizeCleanupRef.current?.();
			wsRef.current?.close();
			terminalRef.current?.dispose();
			fitAddonRef.current?.dispose();
		};
	}, []);

	return (
		<div className="flex flex-col h-full bg-[#0a0a0a]">
			{/* Status bar */}
			<div className="flex items-center gap-2 px-3 py-1 border-b border-zinc-800 bg-zinc-900">
				<div
					className={`h-2 w-2 rounded-full ${
						status === 'connected'
							? 'bg-green-500'
							: status === 'connecting'
								? 'bg-yellow-500 animate-pulse'
								: status === 'error'
									? 'bg-red-500'
									: 'bg-gray-500'
					}`}
				/>
				<span className="text-[10px] text-zinc-400">
					{status === 'connected'
						? 'Connected'
						: status === 'connecting'
							? 'Connecting...'
							: status === 'error'
								? `Error: ${error}`
								: 'Disconnected'}
				</span>
				{(status === 'disconnected' || status === 'error') && (
					<Button
						variant="ghost"
						size="sm"
						className="h-5 text-[10px] ml-auto text-zinc-400"
						onClick={handleReconnect}
					>
						Reconnect
					</Button>
				)}
			</div>
			{/* Terminal container */}
			<div ref={containerRef} className="flex-1 p-1" />
		</div>
	);
}
