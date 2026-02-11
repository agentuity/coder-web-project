/**
 * Web sandbox CRUD routes.
 */
import { createRouter } from '@agentuity/runtime';
import type { SandboxContext } from '../opencode';
import {
	checkWebSandboxHealth,
	createWebSandbox,
	destroyWebSandbox,
	getWebSandboxInfo,
	listWebSandboxFiles,
	readFileFromWebSandbox,
	writeFilesToWebSandbox,
} from '../opencode/web-sandbox';

const api = createRouter();

const MAX_FILES = 50;
const MAX_FILE_SIZE = 1024 * 1024;

type CreateWebSandboxBody = {
	githubToken?: string;
	env?: Record<string, string>;
};

type WriteFilesBody = {
	files: Array<{ path: string; content: string }>;
};

function toSandboxContext(c: { var: { sandbox: unknown; logger: SandboxContext['logger'] } }): SandboxContext {
	return {
		sandbox: c.var.sandbox as any,
		logger: c.var.logger,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// POST /api/web-sandbox — create web sandbox
api.post('/', async (c) => {
	const logger = c.var.logger;
	logger.info('Web sandbox create request');

	const body = (await c.req.json<CreateWebSandboxBody>().catch(() => ({}))) as CreateWebSandboxBody;
	if (body.githubToken !== undefined && typeof body.githubToken !== 'string') {
		return c.json({ error: 'githubToken must be a string' }, 400);
	}
	if (body.env !== undefined) {
		if (!isRecord(body.env)) {
			return c.json({ error: 'env must be an object of string values' }, 400);
		}
		for (const [key, value] of Object.entries(body.env)) {
			if (typeof value !== 'string') {
				return c.json({ error: `env value for ${key} must be a string` }, 400);
			}
		}
	}

	try {
		const sandboxCtx = toSandboxContext(c);
		const result = await createWebSandbox(sandboxCtx, {
			githubToken: body.githubToken,
			env: body.env,
		});
		logger.info('Web sandbox created', { sandboxId: result.sandboxId });
		return c.json(result, 201);
	} catch (error) {
		logger.error('Failed to create web sandbox', { error });
		return c.json({ error: 'Failed to create web sandbox' }, 500);
	}
});

// GET /api/web-sandbox/:id — get web sandbox info
api.get('/:id', async (c) => {
	const sandboxId = c.req.param('id');
	const logger = c.var.logger;
	logger.info('Web sandbox info request', { sandboxId });

	try {
		const sandboxCtx = toSandboxContext(c);
		const info = await getWebSandboxInfo(sandboxCtx, sandboxId);
		if (!info) {
			return c.json({ error: 'Web sandbox not found' }, 404);
		}
		return c.json(info);
	} catch (error) {
		logger.error('Failed to get web sandbox info', { sandboxId, error });
		return c.json({ error: 'Failed to get web sandbox info' }, 500);
	}
});

// GET /api/web-sandbox/:id/health — check web sandbox health
api.get('/:id/health', async (c) => {
	const sandboxId = c.req.param('id');
	const logger = c.var.logger;
	logger.info('Web sandbox health request', { sandboxId });

	try {
		const sandboxCtx = toSandboxContext(c);
		const healthy = await checkWebSandboxHealth(sandboxCtx, sandboxId);
		return c.json({ healthy });
	} catch (error) {
		logger.error('Failed to check web sandbox health', { sandboxId, error });
		return c.json({ error: 'Failed to check web sandbox health' }, 500);
	}
});

// POST /api/web-sandbox/:id/files — write files to web sandbox
api.post('/:id/files', async (c) => {
	const sandboxId = c.req.param('id');
	const logger = c.var.logger;
	logger.info('Web sandbox write files request', { sandboxId });

	const body = (await c.req.json<WriteFilesBody>().catch(() => ({ files: [] }))) as WriteFilesBody;
	if (!body || !Array.isArray(body.files)) {
		return c.json({ error: 'files must be an array' }, 400);
	}
	if (body.files.length > MAX_FILES) {
		return c.json({ error: `Too many files (max ${MAX_FILES})` }, 400);
	}
	for (const file of body.files) {
		if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
			return c.json({ error: 'Each file must include path and content strings' }, 400);
		}
		const size = Buffer.byteLength(file.content, 'utf8');
		if (size > MAX_FILE_SIZE) {
			return c.json({ error: `File too large: ${file.path}` }, 400);
		}
	}

	try {
		const sandboxCtx = toSandboxContext(c);
		await writeFilesToWebSandbox(sandboxCtx, sandboxId, body.files);
		return c.json({ written: body.files.length });
	} catch (error) {
		logger.error('Failed to write files to web sandbox', { sandboxId, error });
		return c.json({ error: 'Failed to write files to web sandbox' }, 500);
	}
});

// GET /api/web-sandbox/:id/files — list files or read a single file
// Use ?file=path/to/file to read a specific file, omit to list all files.
// Use ?path=subdir to list files under a subdirectory.
api.get('/:id/files', async (c) => {
	const sandboxId = c.req.param('id');
	const filePath = c.req.query('file');
	const dirPath = c.req.query('path');
	const logger = c.var.logger;

	const sandboxCtx = toSandboxContext(c);

	// If ?file=... is provided, read a single file
	if (filePath) {
		logger.info('Web sandbox read file request', { sandboxId, filePath });
		try {
			const content = await readFileFromWebSandbox(sandboxCtx, sandboxId, filePath);
			if (content === null) {
				return c.json({ error: 'File not found' }, 404);
			}
			return c.json({ path: filePath, content });
		} catch (error) {
			logger.error('Failed to read web sandbox file', { sandboxId, filePath, error });
			return c.json({ error: 'Failed to read web sandbox file' }, 500);
		}
	}

	// Otherwise list files
	logger.info('Web sandbox list files request', { sandboxId, path: dirPath });
	try {
		const files = await listWebSandboxFiles(sandboxCtx, sandboxId, dirPath);
		return c.json({ files });
	} catch (error) {
		logger.error('Failed to list web sandbox files', { sandboxId, path: dirPath, error });
		return c.json({ error: 'Failed to list web sandbox files' }, 500);
	}
});

// DELETE /api/web-sandbox/:id — destroy web sandbox
api.delete('/:id', async (c) => {
	const sandboxId = c.req.param('id');
	const logger = c.var.logger;
	logger.info('Web sandbox delete request', { sandboxId });

	try {
		const sandboxCtx = toSandboxContext(c);
		await destroyWebSandbox(sandboxCtx, sandboxId);
		return c.json({ deleted: true });
	} catch (error) {
		logger.error('Failed to destroy web sandbox', { sandboxId, error });
		return c.json({ error: 'Failed to destroy web sandbox' }, 500);
	}
});

export default api;
