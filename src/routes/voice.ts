import { createRouter } from '@agentuity/runtime';
import leadNarrator from '@agent/lead-narrator';
import { db } from '../db';
import { userSettings } from '../db/schema';
import { eq } from '@agentuity/drizzle';

const router = createRouter();

async function getUserVoicePrefs(c: any): Promise<{ voice: string }> {
	const user = c.get('user');
	if (!user?.id) return { voice: 'coral' };
	const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
	return {
		voice: settings?.voiceName || 'coral',
	};
}

// POST /api/voice/transcribe - Accept audio blob, return text
router.post('/transcribe', async (c) => {
	try {
		const body = (await c.req.json().catch(() => ({}))) as { audio?: string };
		if (!body.audio) {
			return c.json({ error: 'Audio is required' }, 400);
		}
		const result = await leadNarrator.run({ action: 'transcribe', audio: body.audio });
		return c.json(result);
	} catch (error) {
		c.var.logger.error('Voice transcribe failed', { error });
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST /api/voice/speech - Accept text + voice, return audio
router.post('/speech', async (c) => {
	try {
		const prefs = await getUserVoicePrefs(c);
		const body = (await c.req.json().catch(() => ({}))) as { text?: string; voice?: string };
		if (!body.text) {
			return c.json({ error: 'Text is required' }, 400);
		}
		const result = await leadNarrator.run({
			action: 'speak',
			text: body.text,
			voice: body.voice || prefs.voice,
		});
		return c.json(result);
	} catch (error) {
		c.var.logger.error('Voice speech failed', { error });
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST /api/voice/condense - Generate spoken version of assistant response
router.post('/condense', async (c) => {
	try {
		const body = (await c.req.json().catch(() => ({}))) as {
			text?: string;
			conversationHistory?: Array<{ role: string; text: string }>;
		};
		if (!body.text) {
			return c.json({ error: 'Text is required' }, 400);
		}
		const result = await leadNarrator.run({
			action: 'condense',
			text: body.text,
			conversationHistory: body.conversationHistory,
		});
		return c.json(result);
	} catch (error) {
		c.var.logger.error('Voice condense failed', { error });
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST /api/voice/narrate - Combined condense+speak in one call
router.post('/narrate', async (c) => {
	try {
		const prefs = await getUserVoicePrefs(c);
		const body = (await c.req.json().catch(() => ({}))) as {
			text?: string;
			voice?: string;
			conversationHistory?: Array<{ role: string; text: string }>;
		};
		if (!body.text) {
			return c.json({ error: 'Text is required' }, 400);
		}
		const result = await leadNarrator.run({
			action: 'narrate',
			text: body.text,
			voice: body.voice || prefs.voice,
			conversationHistory: body.conversationHistory,
		});
		return c.json(result);
	} catch (error) {
		c.var.logger.error('Voice narrate failed', { error });
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

export default router;
