import { createRouter } from '@agentuity/runtime';
import { db } from '../db';
import { userSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from '../lib/encryption';

const router = createRouter();
const GITHUB_API_BASE = 'https://api.github.com';

function githubHeaders(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'User-Agent': 'agentuity-coder',
	};
}

function maskToken(token: string) {
	const suffix = token.slice(-4);
	return suffix ? `••••${suffix}` : '••••';
}

// GET /api/user/github — check if PAT is configured
router.get('/github', async (c) => {
	const user = c.get('user')!;
	const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
	if (!settings?.githubPat) return c.json({ configured: false });

	try {
		const token = decrypt(settings.githubPat);
		let username: string | undefined;
		try {
			const response = await fetch(`${GITHUB_API_BASE}/user`, { headers: githubHeaders(token) });
			if (response.ok) {
				const data = (await response.json()) as { login?: string };
				username = data.login;
			}
		} catch {
			// Ignore API failures and still report configured
		}
		return c.json({ configured: true, username, maskedToken: maskToken(token) });
	} catch {
		c.var.logger.warn('Failed to decrypt GitHub token for user settings', { userId: user.id });
		return c.json({ configured: false });
	}
});

// PUT /api/user/github — save encrypted PAT
router.put('/github', async (c) => {
	const user = c.get('user')!;
	const body = (await c.req
		.json<{ token?: string }>()
		.catch(() => ({ token: '' }))) as { token?: string };
	const token = typeof body.token === 'string' ? body.token.trim() : '';
	if (!token) return c.json({ error: 'GitHub token is required' }, 400);

	const response = await fetch(`${GITHUB_API_BASE}/user`, { headers: githubHeaders(token) });
	if (!response.ok) {
		return c.json({ error: 'Invalid GitHub token' }, 400);
	}

	const data = (await response.json()) as { login?: string };
	const encrypted = encrypt(token);
	const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));

	if (existing) {
		await db
			.update(userSettings)
			.set({ githubPat: encrypted, updatedAt: new Date() })
			.where(eq(userSettings.userId, user.id));
	} else {
		await db.insert(userSettings).values({ userId: user.id, githubPat: encrypted });
	}

	return c.json({ configured: true, username: data.login, maskedToken: maskToken(token) });
});

// DELETE /api/user/github — remove PAT
router.delete('/github', async (c) => {
	const user = c.get('user')!;
	const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
	if (existing) {
		await db
			.update(userSettings)
			.set({ githubPat: null, updatedAt: new Date() })
			.where(eq(userSettings.userId, user.id));
	}
	return c.json({ configured: false });
});

export default router;
