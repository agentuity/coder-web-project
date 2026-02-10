/**
 * Session-scoped skills routes (installed skills in sandbox).
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { sandboxExecute } from '@agentuity/server';

const api = createRouter();

const SANDBOX_HOME = '/home/agentuity';
const DEFAULT_PROJECT_DIR = '/home/agentuity/project';

function resolveProjectDir(session: { metadata?: unknown | null }): string {
	const metadata = (session.metadata || {}) as Record<string, unknown>;
	const repoUrl = typeof metadata.repoUrl === 'string' ? metadata.repoUrl : undefined;
	if (!repoUrl) return DEFAULT_PROJECT_DIR;
	const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'project';
	return `${SANDBOX_HOME}/${repoName}`;
}

async function execInSandbox(
	apiClient: any,
	sandboxId: string,
	command: string[],
	workDir: string = DEFAULT_PROJECT_DIR,
): Promise<{ stdout: string; stderr: string; exitCode: number }>
{
	const execution = await sandboxExecute(apiClient, {
		sandboxId,
		options: {
			command: ['bash', '-c', `cd "${workDir}" 2>/dev/null; ${command.join(' ')}`],
			timeout: '60s',
		},
	});

	let stdout = '';
	let stderr = '';

	if (execution.stdoutStreamUrl) {
		const res = await fetch(execution.stdoutStreamUrl);
		stdout = await res.text();
	}
	if (execution.stderrStreamUrl) {
		const res = await fetch(execution.stderrStreamUrl);
		stderr = await res.text();
	}

	return { stdout, stderr, exitCode: execution.exitCode ?? -1 };
}

function parseFrontmatter(content: string): Record<string, string> {
	const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
	const frontmatter = match?.[1];
	if (!frontmatter) return {};
	const data: Record<string, string> = {};
	for (const line of frontmatter.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf(':');
		if (idx <= 0) continue;
		const key = trimmed.slice(0, idx).trim();
		let value = trimmed.slice(idx + 1).trim();
		value = value.replace(/^['"]|['"]$/g, '');
		if (key) data[key] = value;
	}
	return data;
}

// GET /api/sessions/:id/skills/search?q=<query> — search skills registry via CLI
api.get('/:id/skills/search', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const query = c.req.query('q')?.trim();
	if (!query || query.length < 2) {
		return c.json({ error: 'Query must be at least 2 characters' }, 400);
	}

	// Validate query - only allow safe characters
	if (!/^[A-Za-z0-9 ._-]+$/.test(query)) {
		return c.json({ error: 'Invalid search query' }, 400);
	}

	const apiClient = (c.var.sandbox as any).client;
	const command = ['npx', 'skills', 'find', query];
	const result = await execInSandbox(apiClient, session.sandboxId, command, SANDBOX_HOME);

	// Parse the ANSI output from `npx skills find`
	// Format:
	//   owner/repo@skill-name
	//   └ https://skills.sh/owner/repo/skill-name
	const ansiRegex = new RegExp('\x1B\\[[0-9;]*[a-zA-Z]', 'g');
	const lines = result.stdout
		.replace(ansiRegex, '')
		.split('\n')
		.map((l) => l.trim())
		.filter((l): l is string => l.length > 0);

	const skills: Array<{ name: string; repo: string; url?: string }> = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		// Match lines like "owner/repo@skill-name" (skill names may contain colons)
		const match = line.match(/^([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)@(.+)$/);
		if (match && match[1] && match[2]) {
			const repo = match[1];
			const skillName = match[2];
			// Next line might be the URL (starts with └)
			let url: string | undefined;
			const nextLine = lines[i + 1];
			if (nextLine && nextLine.startsWith('\u2514')) {
				const urlMatch = nextLine.match(/https?:\/\/[^\s]+/);
				if (urlMatch) url = urlMatch[0];
			}
			skills.push({ name: skillName, repo, url });
		}
	}

	return c.json(skills);
});

// GET /api/sessions/:id/skills/installed — list installed skills
api.get('/:id/skills/installed', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const apiClient = (c.var.sandbox as any).client;
	const projectDir = resolveProjectDir(session);
	const skillsDir = `${projectDir}/.opencode/skills`;
	const listCmd = ['if', '[', '-d', skillsDir, '];', 'then', 'find', skillsDir, '-maxdepth', '2', '-name', 'SKILL.md', '-print;', 'fi'];

	const listResult = await execInSandbox(apiClient, session.sandboxId, listCmd, SANDBOX_HOME);
	// exitCode may be non-zero if directory doesn't exist — treat empty stdout as "no skills"
	if (listResult.exitCode !== 0 && listResult.stdout.trim() === '') {
		return c.json([]);
	}

	const skillFiles = listResult.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	const installed = [] as Array<{ name: string; description?: string | null; repo?: string | null; directory?: string }>;
	for (const filePath of skillFiles) {
		const readResult = await execInSandbox(
			apiClient,
			session.sandboxId,
			['cat', filePath],
			projectDir,
		);
		const content = readResult.stdout || '';
		const frontmatter = parseFrontmatter(content);
		const dirName = filePath.split('/').slice(-2, -1)[0] || filePath;
		const name = frontmatter.name || frontmatter.title || dirName;
		const description = frontmatter.description || frontmatter.summary || null;
		const repo = frontmatter.repo || frontmatter.repository || frontmatter.source || null;
		installed.push({ name, description, repo, directory: dirName });
	}

	return c.json(installed);
});

// POST /api/sessions/:id/skills/install — install skill into sandbox
api.post('/:id/skills/install', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const body = (await c.req.json().catch(() => ({}))) as { repo?: string };
	const repo = body.repo?.trim();
	if (!repo || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(@[A-Za-z0-9._:-]+)?$/.test(repo)) {
		return c.json({ error: 'Invalid repo format' }, 400);
	}

	const apiClient = (c.var.sandbox as any).client;
	const projectDir = resolveProjectDir(session);
	const command = ['npx', 'skills', 'add', repo, '--agent', 'opencode', '-y'];
	const result = await execInSandbox(apiClient, session.sandboxId, command, projectDir);
	if (result.exitCode !== 0) {
		return c.json({ error: 'Failed to install skill', details: result.stderr || result.stdout }, 500);
	}

	return c.json({ success: true });
});

// DELETE /api/sessions/:id/skills/installed/:name — remove installed skill
api.delete('/:id/skills/installed/:name', async (c) => {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, c.req.param('id')!));
	if (!session) return c.json({ error: 'Session not found' }, 404);
	if (!session.sandboxId) return c.json({ error: 'No sandbox' }, 503);

	const name = c.req.param('name');
	if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
		return c.json({ error: 'Invalid skill name' }, 400);
	}

	const apiClient = (c.var.sandbox as any).client;
	const projectDir = resolveProjectDir(session);
	const command = ['npx', 'skills', 'remove', name, '--agent', 'opencode', '-y'];
	const result = await execInSandbox(apiClient, session.sandboxId, command, projectDir);
	if (result.exitCode !== 0) {
		return c.json({ error: 'Failed to remove skill', details: result.stderr || result.stdout }, 500);
	}

	return c.json({ success: true });
});

export default api;
