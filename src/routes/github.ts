/**
 * GitHub integration routes — git status, branch, commit, PR, and diff.
 *
 * All commands run in the session's sandbox via `sandboxExecute`.
 * Working directory: /home/agentuity/project
 */
import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { chatSessions } from '../db/schema';
import { eq } from '@agentuity/drizzle';
import { sandboxExecute } from '@agentuity/server';

const api = createRouter();

const PROJECT_DIR = '/home/agentuity/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute a shell command in the session sandbox and return stdout/stderr. */
async function execInSandbox(
	apiClient: any,
	sandboxId: string,
	command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const execution = await sandboxExecute(apiClient, {
		sandboxId,
		options: {
			command: ['bash', '-c', `cd ${PROJECT_DIR} && ${command}`],
			timeout: '30s',
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

/** Look up a session and validate it has a sandbox. */
async function getSession(sessionId: string) {
	const [session] = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, sessionId));

	if (!session) return { error: 'Session not found', status: 404 as const };
	if (!session.sandboxId) return { error: 'No sandbox', status: 503 as const };

	return { session };
}

// ---------------------------------------------------------------------------
// GET /:id/github/status — git branch, dirty state, changed files, remotes
// ---------------------------------------------------------------------------
api.get('/:id/github/status', async (c) => {
	const result = await getSession(c.req.param('id')!);
	if ('error' in result) return c.json({ error: result.error }, result.status);
	const { session } = result;

	try {
		const apiClient = (c.var.sandbox as any).client;

		// Run git commands separated by markers
		const { stdout, stderr, exitCode } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			'git status --porcelain 2>/dev/null; echo "---SEPARATOR---"; git branch --show-current 2>/dev/null; echo "---SEPARATOR---"; git remote -v 2>/dev/null',
		);

		if (exitCode !== 0 && !stdout.trim()) {
			return c.json({
				branch: null,
				isDirty: false,
				changedFiles: [],
				remotes: [],
				error: stderr.trim() || 'Git not initialized',
			});
		}

		const parts = stdout.split('---SEPARATOR---');
		const statusOutput = (parts[0] || '').trim();
		const branch = (parts[1] || '').trim() || null;
		const remoteOutput = (parts[2] || '').trim();

		const changedFiles = statusOutput
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => line.trim());

		const remotes = remoteOutput
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => line.trim());

		return c.json({
			branch,
			isDirty: changedFiles.length > 0,
			changedFiles,
			remotes,
		});
	} catch (error) {
		return c.json({ error: 'Failed to get git status', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /:id/github/branch — create and checkout a new branch
// ---------------------------------------------------------------------------
api.post('/:id/github/branch', async (c) => {
	const result = await getSession(c.req.param('id')!);
	if ('error' in result) return c.json({ error: result.error }, result.status);
	const { session } = result;

	const body = await c.req.json<{ name: string }>();
	if (!body.name || !body.name.trim()) {
		return c.json({ error: 'Branch name is required' }, 400);
	}

	// Sanitize branch name — only allow safe characters
	const branchName = body.name.trim().replace(/[^a-zA-Z0-9._\-/]/g, '-');

	try {
		const apiClient = (c.var.sandbox as any).client;
		const { stdout, stderr, exitCode } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			`git checkout -b '${branchName}'`,
		);

		if (exitCode !== 0) {
			return c.json({
				success: false,
				error: stderr.trim() || 'Failed to create branch',
			}, 400);
		}

		return c.json({ branch: branchName, success: true });
	} catch (error) {
		return c.json({ error: 'Failed to create branch', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /:id/github/commit — stage and commit changes
// ---------------------------------------------------------------------------
api.post('/:id/github/commit', async (c) => {
	const result = await getSession(c.req.param('id')!);
	if ('error' in result) return c.json({ error: result.error }, result.status);
	const { session } = result;

	const body = await c.req.json<{ message: string; files?: string[] }>();
	if (!body.message || !body.message.trim()) {
		return c.json({ error: 'Commit message is required' }, 400);
	}

	try {
		const apiClient = (c.var.sandbox as any).client;

		// Stage files
		let addCmd: string;
		if (body.files && body.files.length > 0) {
			const safeFiles = body.files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
			addCmd = `git add ${safeFiles}`;
		} else {
			addCmd = 'git add -A';
		}

		const { stderr: addErr, exitCode: addExit } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			addCmd,
		);

		if (addExit !== 0) {
			return c.json({
				success: false,
				error: addErr.trim() || 'Failed to stage files',
			}, 400);
		}

		// Write commit message to temp file via single-quoted heredoc (prevents all shell interpretation)
		const writeMsgCmd = `cat > /tmp/.commit-msg <<'COMMIT_MSG_EOF'\n${body.message.trim()}\nCOMMIT_MSG_EOF`;
		await execInSandbox(apiClient, session.sandboxId!, writeMsgCmd);

		// Commit using -F to read message from file (no shell interpretation)
		const { stdout, stderr, exitCode } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			'git commit -F /tmp/.commit-msg',
		);

		if (exitCode !== 0) {
			return c.json({
				success: false,
				error: stderr.trim() || stdout.trim() || 'Failed to commit',
			}, 400);
		}

		// Extract commit hash
		const hashMatch = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
		const hash = hashMatch ? hashMatch[1] : null;

		return c.json({
			hash,
			message: body.message.trim(),
			success: true,
		});
	} catch (error) {
		return c.json({ error: 'Failed to commit', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// POST /:id/github/pr — push and create a pull request via gh CLI
// ---------------------------------------------------------------------------
api.post('/:id/github/pr', async (c) => {
	const result = await getSession(c.req.param('id')!);
	if ('error' in result) return c.json({ error: result.error }, result.status);
	const { session } = result;

	const body = await c.req.json<{ title: string; body?: string; base?: string }>();
	if (!body.title || !body.title.trim()) {
		return c.json({ error: 'PR title is required' }, 400);
	}

	// Sanitize PR title — escape shell-dangerous characters ($, `, \, ")
	const sanitizedTitle = body.title.replace(/[`$\\]/g, '\\$&').replace(/"/g, '\\"');
	// Sanitize base branch — only allow safe git ref characters
	const sanitizedBase = (body.base || 'main').replace(/[^a-zA-Z0-9._\-/]/g, '-');

	try {
		const apiClient = (c.var.sandbox as any).client;

		// Push the branch
		const { stderr: pushErr, exitCode: pushExit } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			'git push -u origin HEAD',
		);

		if (pushExit !== 0) {
			return c.json({
				success: false,
				error: pushErr.trim() || 'Failed to push branch',
			}, 400);
		}

		// Write PR body to temp file via single-quoted heredoc (prevents all shell interpretation)
		const writeBodyCmd = `cat > /tmp/.pr-body <<'PR_BODY_EOF'\n${(body.body || '').trim()}\nPR_BODY_EOF`;
		await execInSandbox(apiClient, session.sandboxId!, writeBodyCmd);

		// Create PR using --body-file for safe body handling, sanitized title and base
		const prCmd = `gh pr create --title "${sanitizedTitle}" --body-file /tmp/.pr-body --base "${sanitizedBase}"`;
		const { stdout, stderr, exitCode } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			prCmd,
		);

		if (exitCode !== 0) {
			return c.json({
				success: false,
				error: stderr.trim() || 'Failed to create PR',
			}, 400);
		}

		// The gh pr create command outputs the PR URL
		const prUrl = stdout.trim();
		const numberMatch = prUrl.match(/\/pull\/(\d+)/);
		const prNumber = numberMatch ? parseInt(numberMatch[1]!, 10) : null;

		return c.json({
			url: prUrl,
			number: prNumber,
			success: true,
		});
	} catch (error) {
		return c.json({ error: 'Failed to create PR', details: String(error) }, 500);
	}
});

// ---------------------------------------------------------------------------
// GET /:id/github/diff — current working tree diff
// ---------------------------------------------------------------------------
api.get('/:id/github/diff', async (c) => {
	const result = await getSession(c.req.param('id')!);
	if ('error' in result) return c.json({ error: result.error }, result.status);
	const { session } = result;

	try {
		const apiClient = (c.var.sandbox as any).client;

		// Show both staged and unstaged diffs
		const { stdout } = await execInSandbox(
			apiClient,
			session.sandboxId!,
			'git diff HEAD 2>/dev/null || git diff 2>/dev/null',
		);

		return c.json({ diff: stdout });
	} catch (error) {
		return c.json({ error: 'Failed to get diff', details: String(error) }, 500);
	}
});

export default api;
