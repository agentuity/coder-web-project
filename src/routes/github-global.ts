import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { userSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '../lib/encryption';

const router = createRouter();

const GITHUB_API_BASE = 'https://api.github.com';

async function getUserGithubToken(userId: string, logger: { warn: (...args: any[]) => void }) {
	const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
	if (settings?.githubPat) {
		try {
			return decrypt(settings.githubPat);
		} catch {
			logger.warn('Failed to decrypt GitHub token for user', { userId });
		}
	}
	return '';
}

function githubHeaders(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'User-Agent': 'agentuity-coder',
	};
}

// GET /status — check if GitHub integration is available
router.get('/status', async (c) => {
	const user = c.get('user')!;
	const token = await getUserGithubToken(user.id, c.var.logger);
	return c.json({ available: !!token, configured: !!token });
});

// GET /repos — list user's GitHub repos
router.get('/repos', async (c) => {
	const user = c.get('user')!;
	const token = await getUserGithubToken(user.id, c.var.logger);
	if (!token) {
		return c.json({ repos: [], configured: false });
	}

	try {
		const response = await fetch(
			`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
			{ headers: githubHeaders(token) },
		);

		if (!response.ok) {
			const details = await response.text();
			c.var.logger.warn('GitHub repo list failed', { status: response.status, details });
			return c.json({ repos: [], error: 'Failed to fetch repos' }, 502);
		}

		const repos = (await response.json()) as Array<{
			full_name: string;
			name: string;
			owner?: { login?: string };
			html_url: string;
			clone_url: string;
			private: boolean;
			default_branch: string;
			updated_at: string;
		}>;

		return c.json({
			repos: repos.map((repo) => ({
				fullName: repo.full_name,
				name: repo.name,
				owner: repo.owner?.login ?? '',
				url: repo.html_url,
				cloneUrl: repo.clone_url,
				private: repo.private,
				defaultBranch: repo.default_branch,
				updatedAt: repo.updated_at,
			})),
		});
	} catch (error) {
		c.var.logger.error('GitHub repo list error', { error: String(error) });
		return c.json({ repos: [], error: 'Failed to fetch repos' }, 500);
	}
});

// GET /repos/:owner/:repo/branches — list branches
router.get('/repos/:owner/:repo/branches', async (c) => {
	const user = c.get('user')!;
	const token = await getUserGithubToken(user.id, c.var.logger);
	if (!token) {
		return c.json({ branches: [], configured: false });
	}

	const { owner, repo } = c.req.param();
	try {
		const response = await fetch(
			`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=100`,
			{ headers: githubHeaders(token) },
		);

		if (!response.ok) {
			const details = await response.text();
			c.var.logger.warn('GitHub branch list failed', { owner, repo, status: response.status, details });
			return c.json({ branches: [], error: 'Failed to fetch branches' }, 502);
		}

		const branches = (await response.json()) as Array<{ name: string }>;
		return c.json({
			branches: branches.map((branch) => ({
				name: branch.name,
			})),
		});
	} catch (error) {
		c.var.logger.error('GitHub branch list error', { owner, repo, error: String(error) });
		return c.json({ branches: [], error: 'Failed to fetch branches' }, 500);
	}
});

export default router;
