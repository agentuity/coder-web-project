import { createRouter } from '@agentuity/runtime';
import leadNarrator from '@agent/lead-narrator';

const router = createRouter();

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
		const body = (await c.req.json().catch(() => ({}))) as { text?: string; voice?: string };
		if (!body.text) {
			return c.json({ error: 'Text is required' }, 400);
		}
		const result = await leadNarrator.run({
			action: 'speak',
			text: body.text,
			voice: body.voice,
		});
		return c.json(result);
	} catch (error) {
		c.var.logger.error('Voice speech failed', { error });
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST /api/voice/condense - Generate spoken response with conversation awareness
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

// POST /api/voice/narrate - Accept events, return conversational text
router.post('/narrate', async (c) => {
	try {
		const body = (await c.req.json().catch(() => ({}))) as {
			events?: unknown[];
		};
		const result = await leadNarrator.run({
			action: 'narrate',
			events: body.events,
		});
		return c.json(result);
	} catch (error) {
		c.var.logger.error('Voice narrate failed', { error });
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

export default router;
