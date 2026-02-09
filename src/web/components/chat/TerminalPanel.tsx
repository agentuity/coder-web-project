/**
 * Terminal overlay — full-screen terminal using ghostty-web (WASM terminal emulator)
 * with WebSocket connection through the proxy endpoint.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard, Check, Minimize2, X, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '../ui/button';

interface TerminalOverlayProps {
	sessionId: string;
	onClose: () => void;
	onConnectionChange?: (connected: boolean) => void;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

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

function getStatusColor(status: TerminalStatus): string {
	switch (status) {
		case 'connected':
			return 'bg-green-500';
		case 'connecting':
			return 'bg-yellow-500 animate-pulse';
		case 'error':
			return 'bg-red-500';
		case 'disconnected':
			return 'bg-gray-500';
	}
}

export function TerminalOverlay({ sessionId, onClose, onConnectionChange }: TerminalOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<import('ghostty-web').Terminal | null>(null);
	const fitAddonRef = useRef<import('ghostty-web').FitAddon | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const resizeCleanupRef = useRef<(() => void) | null>(null);
	const initRef = useRef(false);
	const [status, setStatus] = useState<TerminalStatus>('connecting');
	const [copied, setCopied] = useState(false);

	const sshCommand = `agentuity cloud ssh ${sessionId}`;
	const handleCopyCommand = useCallback(() => {
		if (navigator?.clipboard?.writeText) {
			void navigator.clipboard.writeText(sshCommand);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [sshCommand]);

	// Performance: reuse TextEncoder, batch writes
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

	// Notify parent of connection status changes
	useEffect(() => {
		onConnectionChange?.(status === 'connected');
	}, [status, onConnectionChange]);

	// Connect WebSocket ref (stable across renders)
	const connectWebSocketRef = useRef<(() => Promise<void>) | null>(null);

	const connectWebSocket = useCallback(async () => {
		try {
			setStatus('connecting');

			// Connect through the WebSocket proxy
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/api/sessions/${sessionId}/terminal`;

			const ws = new WebSocket(wsUrl);
			ws.binaryType = 'arraybuffer';
			wsRef.current = ws;

			ws.onopen = () => {
				setStatus('connected');
				if (terminalRef.current) {
					terminalRef.current.write('\x1b[32mConnected to terminal\x1b[0m\r\n');
				}
			};

			ws.onmessage = (event) => {
				if (event.data instanceof ArrayBuffer && terminalRef.current) {
					writeBufferRef.current.push(new Uint8Array(event.data));
					scheduleFlush();
				}
			};

			ws.onerror = () => {
				setStatus('error');
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
			if (terminalRef.current) {
				terminalRef.current.write(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`);
			}
		}
	}, [sessionId, scheduleFlush]);

	connectWebSocketRef.current = connectWebSocket;

	const handleReconnect = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		if (terminalRef.current) {
			terminalRef.current.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n');
		}
		connectWebSocketRef.current?.();
	}, []);

	// Minimize: hide overlay but keep connection alive
	const handleMinimize = useCallback(() => {
		onClose();
	}, [onClose]);

	// Close: disconnect WebSocket AND hide overlay
	const handleClose = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		onClose();
	}, [onClose]);

	useEffect(() => {
		if (initRef.current || !containerRef.current) return;
		initRef.current = true;

		const initTerminal = async () => {
			try {
				const ghosttyModule = await loadGhostty();

				const term = new ghosttyModule.Terminal({
					cursorBlink: true,
					fontSize: 14,
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
					if (Math.abs(width - lastWidth) < 5 && Math.abs(height - lastHeight) < 5)
						return;
					lastWidth = width;
					lastHeight = height;

					if (width > 0 && height > 0) {
						requestAnimationFrame(() => {
							fitAddonRef.current?.fit();
							// Connect WebSocket on first valid size
							if (!wsConnected) {
								wsConnected = true;
								connectWebSocketRef.current?.();
							}
						});
					}
				});
				resizeObserver.observe(containerRef.current!);
				resizeCleanupRef.current = () => resizeObserver.disconnect();

				// Terminal input → WebSocket (proxy mode: send as string)
				term.onData((data: string) => {
					if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
						wsRef.current.send(data);
					}
				});
			} catch (err) {
				console.error('Failed to initialize terminal:', err);
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
		<div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]">
			{/* Header */}
			<div className="flex items-center gap-2 h-10 border-b border-zinc-800 bg-zinc-900 px-3">
				<TerminalIcon className="h-4 w-4 text-zinc-400" />
				<div className={`h-2 w-2 rounded-full ${getStatusColor(status)}`} />
			<span className="text-xs text-zinc-300">
				{status === 'connected'
					? 'Terminal — Connected'
					: status === 'connecting'
						? 'Terminal — Connecting...'
						: status === 'error'
							? 'Terminal — Error'
							: 'Terminal — Disconnected'}
			</span>
			<div className="mx-3 flex items-center gap-1.5 rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-400">
				<span className="select-none text-zinc-500">$</span>
				<code className="select-all">{sshCommand}</code>
				<button
					type="button"
					onClick={handleCopyCommand}
					className="ml-1 text-zinc-500 hover:text-zinc-200 transition-colors"
					title="Copy command"
				>
					{copied ? <Check className="h-3 w-3 text-green-400" /> : <Clipboard className="h-3 w-3" />}
				</button>
			</div>
			<div className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
					onClick={handleMinimize}
					title="Minimize"
				>
					<Minimize2 className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
					onClick={handleClose}
					title="Disconnect and close"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
			{/* Terminal */}
			<div ref={containerRef} className="flex-1" />
			{/* Disconnected overlay */}
			{status === 'disconnected' && (
				<div className="absolute inset-0 top-10 flex items-center justify-center bg-black/80">
					<div className="flex flex-col items-center gap-4">
						<p className="text-yellow-400 text-sm">Session disconnected</p>
						<Button variant="outline" size="sm" onClick={handleReconnect}>
							Reconnect
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

// Keep backward-compatible export name
export { TerminalOverlay as TerminalPanel };
