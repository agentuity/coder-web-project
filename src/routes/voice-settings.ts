import { createRouter } from '@agentuity/runtime';
import { eq } from '@agentuity/drizzle';
import { db } from '../db';
import { userSettings } from '../db/schema';

const router = createRouter();

const DEFAULT_VOICE_SETTINGS = {
	voiceEnabled: false,
	voiceModel: 'gpt-4o-mini-tts',
	voiceName: 'coral',
	voiceAutoSpeak: true,
	voiceSpeed: '1.0',
	preferredMic: null as string | null,
};

function normalizeVoiceSettings(settings?: typeof userSettings.$inferSelect) {
	const rawSpeed = settings?.voiceSpeed ?? DEFAULT_VOICE_SETTINGS.voiceSpeed;
	const speed = typeof rawSpeed === 'string' ? parseFloat(rawSpeed) : rawSpeed;
	return {
		voiceEnabled: settings?.voiceEnabled ?? DEFAULT_VOICE_SETTINGS.voiceEnabled,
		voiceModel: settings?.voiceModel ?? DEFAULT_VOICE_SETTINGS.voiceModel,
		voiceName: settings?.voiceName ?? DEFAULT_VOICE_SETTINGS.voiceName,
		voiceAutoSpeak: settings?.voiceAutoSpeak ?? DEFAULT_VOICE_SETTINGS.voiceAutoSpeak,
		voiceSpeed: Number.isFinite(speed) ? speed : 1.0,
		preferredMic: settings?.preferredMic ?? DEFAULT_VOICE_SETTINGS.preferredMic,
	};
}

// GET /api/user/voice — Get voice settings
router.get('/', async (c) => {
	const user = c.get('user')!;
	const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
	return c.json(normalizeVoiceSettings(settings));
});

// PUT /api/user/voice — Update voice settings
router.put('/', async (c) => {
	const user = c.get('user')!;
	const body = (await c.req.json().catch(() => ({}))) as {
		voiceEnabled?: boolean;
		voiceModel?: string;
		voiceName?: string;
		voiceAutoSpeak?: boolean;
		voiceSpeed?: string;
		preferredMic?: string | null;
	};

	const updates: Partial<typeof userSettings.$inferInsert> = {};
	if (typeof body.voiceEnabled === 'boolean') updates.voiceEnabled = body.voiceEnabled;
	if (typeof body.voiceModel === 'string') updates.voiceModel = body.voiceModel;
	if (typeof body.voiceName === 'string') updates.voiceName = body.voiceName;
	if (typeof body.voiceAutoSpeak === 'boolean') updates.voiceAutoSpeak = body.voiceAutoSpeak;
	if (body.voiceSpeed !== undefined) updates.voiceSpeed = String(body.voiceSpeed);
	if (typeof body.preferredMic === 'string' || body.preferredMic === null) {
		updates.preferredMic = body.preferredMic;
	}

	if (Object.keys(updates).length === 0) {
		return c.json({ error: 'No valid voice settings provided' }, 400);
	}

	const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));

	if (existing) {
		await db
			.update(userSettings)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(userSettings.userId, user.id));
	} else {
		await db.insert(userSettings).values({ userId: user.id, ...updates });
	}

	const [updated] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
	return c.json(normalizeVoiceSettings(updated));
});

export default router;
