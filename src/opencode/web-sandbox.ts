/**
 * Web sandbox lifecycle management.
 * Creates on-demand sandboxes that serve web content via Hono.
 * Files are written directly via the sandbox SDK.
 */
import { sandboxExecute } from '@agentuity/server';
import type { SandboxContext } from './sandbox';

export const WEB_SANDBOX_PORT = 3000;
export const WEB_SANDBOX_SNAPSHOT = 'web-runtime';

const SANDBOX_ROOT = '/home/agentuity';

type ExecutionLike = {
	status?: string;
	exitCode?: number;
	stdoutStreamUrl?: string;
	stderrStreamUrl?: string;
};

async function readExecutionStreams(execution: ExecutionLike): Promise<{ stdout?: string; stderr?: string }> {
	const [stdout, stderr] = await Promise.all([
		execution.stdoutStreamUrl
			? fetch(execution.stdoutStreamUrl)
					.then((resp) => (resp.ok ? resp.text() : undefined))
					.catch(() => undefined)
			: Promise.resolve(undefined),
		execution.stderrStreamUrl
			? fetch(execution.stderrStreamUrl)
					.then((resp) => (resp.ok ? resp.text() : undefined))
					.catch(() => undefined)
			: Promise.resolve(undefined),
	]);

	return { stdout, stderr };
}

export interface WebSandboxConfig {
	/** Optional GitHub token for git operations */
	githubToken?: string;
	/** Optional extra environment variables */
	env?: Record<string, string>;
}

export interface WebSandboxInfo {
	sandboxId: string;
	sandboxUrl: string;
	port: number;
}

export interface WebSandboxFileWrite {
	path: string;
	content: string;
}

function resolveSandboxPath(path: string): string {
	if (!path) return SANDBOX_ROOT;
	if (path.startsWith('/')) return path;
	return `${SANDBOX_ROOT}/${path}`;
}

function escapeForDoubleQuotes(value: string): string {
	return value.replace(/["\\$`]/g, '\\$&');
}

function toRelativePath(path: string): string {
	if (path.startsWith(`${SANDBOX_ROOT}/`)) return path.slice(SANDBOX_ROOT.length + 1);
	if (path.startsWith('./')) return path.slice(2);
	return path;
}

function createHeredocDelimiter(content: string): string {
	let delimiter = `WEBFILE_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	while (content.includes(delimiter)) {
		delimiter = `WEBFILE_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	}
	return delimiter;
}

/**
 * Create a new web sandbox and start the Hono server.
 */
export async function createWebSandbox(
	ctx: SandboxContext,
	config?: WebSandboxConfig,
): Promise<WebSandboxInfo> {
	ctx.logger.info('Creating web sandbox...');

	const sandbox = await ctx.sandbox.create({
		snapshot: WEB_SANDBOX_SNAPSHOT,
		network: { enabled: true, port: WEB_SANDBOX_PORT },
		resources: { memory: '1Gi', cpu: '1000m' },
		timeout: { idle: '1h' },
		env: {
			...(config?.githubToken
				? { GH_TOKEN: config.githubToken, GITHUB_TOKEN: config.githubToken }
				: {}),
			...(config?.env || {}),
		},
	});

	const sandboxId = sandbox.id as string;
	ctx.logger.info(`Web sandbox created: ${sandboxId}`);

	try {
		// Install dependencies before starting the server.
		// The snapshot includes package.json but not node_modules.
		ctx.logger.info('Installing web sandbox dependencies...');
		const installClient = ctx.sandbox.client;
		if (installClient) {
			const installExecution = await sandboxExecute(installClient, {
				sandboxId,
				options: {
					command: ['bash', '-c', `cd ${SANDBOX_ROOT} && bun install --no-save 2>&1`],
					timeout: '60s',
				},
			});
			const installExit = typeof installExecution?.exitCode === 'number' ? installExecution.exitCode : null;
			if (installExit !== null && installExit !== 0) {
				const { stdout, stderr } = await readExecutionStreams(installExecution ?? {});
				ctx.logger.warn('bun install failed', { sandboxId, exitCode: installExit, stdout, stderr });
				throw new Error(`bun install failed: exit code ${installExit}`);
			}
			ctx.logger.info('Dependencies installed');
		} else {
			ctx.logger.warn('No apiClient for sandboxExecute — running bun install via sandbox.execute (fire-and-forget)');
			await sandbox.execute({
				command: ['bash', '-c', `cd ${SANDBOX_ROOT} && bun install --no-save 2>&1`],
			});
			// Give it time to finish
			await new Promise((resolve) => setTimeout(resolve, 10000));
		}

		// Start Hono dev server (CORS-friendly headers are handled by the server template).
		// This is intentionally fire-and-forget — sandbox.execute() returns immediately.
		await sandbox.execute({
			command: [
				'bash',
				'-c',
				`cd ${SANDBOX_ROOT} && nohup bun --hot run server.ts > /tmp/web-sandbox.log 2>&1 &`,
			],
		});

		// Wait for health check using sandboxExecute so we actually wait for the result.
		ctx.logger.info('Waiting for web server to be ready...');
		const apiClient = ctx.sandbox.client;
		if (apiClient) {
			const healthExecution = await sandboxExecute(apiClient, {
				sandboxId,
				options: {
					command: [
						'bash',
						'-c',
						`for i in $(seq 1 30); do curl -sf http://localhost:${WEB_SANDBOX_PORT}/health > /dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
					],
					timeout: '45s',
				},
			});

			const exitCode = typeof healthExecution?.exitCode === 'number' ? healthExecution.exitCode : null;
			if (exitCode !== null && exitCode !== 0) {
				const { stdout, stderr } = await readExecutionStreams(healthExecution ?? {});
				ctx.logger.warn('Web sandbox health check loop failed', { sandboxId, exitCode, stdout, stderr });
				throw new Error(`Web server failed to become healthy: exit code ${exitCode}`);
			}
		} else {
			ctx.logger.warn('No apiClient available for sandboxExecute, falling back to sandbox.execute()');
			await sandbox.execute({
				command: [
					'bash',
					'-c',
					`for i in $(seq 1 30); do curl -sf http://localhost:${WEB_SANDBOX_PORT}/health > /dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
				],
			});
		}

		const sandboxInfo = await ctx.sandbox.get(sandboxId);
		const sandboxUrl = (sandboxInfo?.url as string) || `http://localhost:${WEB_SANDBOX_PORT}`;

		ctx.logger.info(`Web sandbox ready at ${sandboxUrl}`);
		return { sandboxId, sandboxUrl, port: WEB_SANDBOX_PORT };
	} catch (error) {
		ctx.logger.error('Failed to setup web sandbox, destroying...', { error });
		try {
			await ctx.sandbox.destroy(sandboxId);
		} catch {
			// Ignore destroy errors
		}
		throw error;
	}
}

/**
 * Write files into a web sandbox. Uses heredocs to preserve content.
 */
export async function writeFilesToWebSandbox(
	ctx: SandboxContext,
	sandboxId: string,
	files: WebSandboxFileWrite[],
): Promise<void> {
	try {
		const apiClient = ctx.sandbox.client;

		for (const file of files) {
			const targetPath = resolveSandboxPath(file.path);
			const escapedPath = escapeForDoubleQuotes(targetPath);
			const delimiter = createHeredocDelimiter(file.content);
			const command = `mkdir -p "$(dirname \"${escapedPath}\")" && cat << '${delimiter}' > "${escapedPath}"
${file.content}
${delimiter}`;

			if (apiClient) {
				const execution = await sandboxExecute(apiClient, {
					sandboxId,
					options: {
						command: ['bash', '-c', command],
						timeout: '30s',
					},
				});

				const exitCode = typeof execution?.exitCode === 'number' ? execution.exitCode : null;
				if (exitCode !== null && exitCode !== 0) {
					const { stdout, stderr } = await readExecutionStreams(execution ?? {});
					ctx.logger.warn('File write command failed', {
						sandboxId,
						path: targetPath,
						exitCode,
						stdout,
						stderr,
					});
				}
			} else {
				ctx.logger.warn('No apiClient available for sandboxExecute, falling back to sandbox.execute()');
				const sandbox = await ctx.sandbox.get(sandboxId);
				if (!sandbox) {
					ctx.logger.warn('Web sandbox not found for file write', { sandboxId });
					return;
				}
				const execution: ExecutionLike | null = await sandbox.execute({
					command: ['bash', '-c', command],
				});

				if (execution?.exitCode && execution.exitCode !== 0) {
					const { stdout, stderr } = await readExecutionStreams(execution);
					ctx.logger.warn('File write command failed (fallback)', {
						sandboxId,
						path: targetPath,
						exitCode: execution.exitCode,
						stdout,
						stderr,
					});
				}
			}
		}
	} catch (error) {
		ctx.logger.error('Failed writing files to web sandbox', { sandboxId, error });
	}
}

/**
 * Read a file from the web sandbox. Returns null if not found.
 */
export async function readFileFromWebSandbox(
	ctx: SandboxContext,
	sandboxId: string,
	path: string,
): Promise<string | null> {
	try {
		const targetPath = resolveSandboxPath(path);
		const escapedPath = escapeForDoubleQuotes(targetPath);
		const command = `if [ -f "${escapedPath}" ]; then cat "${escapedPath}"; else exit 2; fi`;

		const apiClient = ctx.sandbox.client;
		if (apiClient) {
			const execution = await sandboxExecute(apiClient, {
				sandboxId,
				options: {
					command: ['bash', '-c', command],
					timeout: '15s',
				},
			});

			const exitCode = typeof execution?.exitCode === 'number' ? execution.exitCode : null;
			if (exitCode !== null && exitCode !== 0) {
				return null;
			}

			const { stdout, stderr } = await readExecutionStreams(execution ?? {});
			if (stderr && stderr.includes('No such file')) return null;
			return stdout ?? null;
		}

		// Fallback: no apiClient
		ctx.logger.warn('No apiClient available for sandboxExecute, falling back to sandbox.execute()');
		const sandbox = await ctx.sandbox.get(sandboxId);
		if (!sandbox) return null;

		const execution: ExecutionLike | null = await sandbox.execute({
			command: ['bash', '-c', command],
		});

		if (execution?.exitCode && execution.exitCode !== 0) {
			return null;
		}

		const { stdout, stderr } = await readExecutionStreams(execution ?? {});
		if (stderr && stderr.includes('No such file')) return null;
		return stdout ?? null;
	} catch (error) {
		ctx.logger.warn('Failed to read file from web sandbox', { sandboxId, path, error });
		return null;
	}
}

/**
 * List files in the web sandbox under a path.
 */
export async function listWebSandboxFiles(
	ctx: SandboxContext,
	sandboxId: string,
	path?: string,
): Promise<string[]> {
	try {
		const targetPath = resolveSandboxPath(path || SANDBOX_ROOT);
		const relativeRoot = targetPath.startsWith(`${SANDBOX_ROOT}/`)
			? targetPath.slice(SANDBOX_ROOT.length + 1)
			: targetPath === SANDBOX_ROOT
				? '.'
				: targetPath;
		const escapedRoot = escapeForDoubleQuotes(relativeRoot);
		const command = `cd ${SANDBOX_ROOT} && find "${escapedRoot}" -maxdepth 6 -type f -print`;

		const apiClient = ctx.sandbox.client;
		if (apiClient) {
			const execution = await sandboxExecute(apiClient, {
				sandboxId,
				options: {
					command: ['bash', '-c', command],
					timeout: '30s',
				},
			});

			const exitCode = typeof execution?.exitCode === 'number' ? execution.exitCode : null;
			if (exitCode !== null && exitCode !== 0) {
				const { stdout, stderr } = await readExecutionStreams(execution ?? {});
				ctx.logger.warn('Failed to list files in web sandbox', {
					sandboxId,
					path: targetPath,
					exitCode,
					stdout,
					stderr,
				});
				return [];
			}

			const { stdout } = await readExecutionStreams(execution ?? {});
			if (!stdout) return [];
			return stdout
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => toRelativePath(line));
		}

		// Fallback: no apiClient
		ctx.logger.warn('No apiClient available for sandboxExecute, falling back to sandbox.execute()');
		const sandbox = await ctx.sandbox.get(sandboxId);
		if (!sandbox) return [];

		const execution: ExecutionLike | null = await sandbox.execute({
			command: ['bash', '-c', command],
		});

		if (execution?.exitCode && execution.exitCode !== 0) {
			const { stdout, stderr } = await readExecutionStreams(execution);
			ctx.logger.warn('Failed to list files in web sandbox (fallback)', {
				sandboxId,
				path: targetPath,
				exitCode: execution.exitCode,
				stdout,
				stderr,
			});
			return [];
		}

		const { stdout } = await readExecutionStreams(execution ?? {});
		if (!stdout) return [];
		return stdout
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => toRelativePath(line));
	} catch (error) {
		ctx.logger.warn('Failed to list web sandbox files', { sandboxId, path, error });
		return [];
	}
}

/**
 * Destroy a web sandbox.
 */
export async function destroyWebSandbox(ctx: SandboxContext, sandboxId: string): Promise<void> {
	ctx.logger.info(`Destroying web sandbox: ${sandboxId}`);
	try {
		await ctx.sandbox.destroy(sandboxId);
	} catch (error) {
		ctx.logger.warn('Failed to destroy web sandbox', { sandboxId, error });
	}
}

/**
 * Check if the web sandbox's Hono server is healthy.
 */
export async function checkWebSandboxHealth(ctx: SandboxContext, sandboxId: string): Promise<boolean> {
	try {
		const command = `curl -sf http://localhost:${WEB_SANDBOX_PORT}/health > /dev/null 2>&1`;

		const apiClient = ctx.sandbox.client;
		if (apiClient) {
			const execution = await sandboxExecute(apiClient, {
				sandboxId,
				options: {
					command: ['bash', '-c', command],
					timeout: '10s',
				},
			});

			const exitCode = typeof execution?.exitCode === 'number' ? execution.exitCode : null;
			// exitCode 0 = healthy; non-zero or failed status = unhealthy
			if (exitCode !== null && exitCode !== 0) {
				return false;
			}
			if (execution?.status === 'failed' || execution?.status === 'timeout') {
				return false;
			}
			return true;
		}

		// Fallback: no apiClient
		ctx.logger.warn('No apiClient available for sandboxExecute, falling back to sandbox.execute()');
		const sandbox = await ctx.sandbox.get(sandboxId);
		if (!sandbox) return false;
		await sandbox.execute({
			command: ['bash', '-c', command],
		});
		return true;
	} catch (error) {
		ctx.logger.warn('Web sandbox health check failed', { sandboxId, error });
		return false;
	}
}

/**
 * Get web sandbox info including public URL.
 */
export async function getWebSandboxInfo(
	ctx: SandboxContext,
	sandboxId: string,
): Promise<WebSandboxInfo | null> {
	try {
		const sandboxInfo = await ctx.sandbox.get(sandboxId);
		if (!sandboxInfo) return null;
		if (sandboxInfo.status === 'terminated' || sandboxInfo.status === 'deleted') return null;

		const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${WEB_SANDBOX_PORT}`;
		return { sandboxId, sandboxUrl, port: WEB_SANDBOX_PORT };
	} catch (error) {
		ctx.logger.warn('Failed to get web sandbox info', { sandboxId, error });
		return null;
	}
}
