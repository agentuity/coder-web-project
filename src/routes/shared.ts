/**
 * Public shared session routes.
 * These routes do NOT require authentication — shared sessions are public.
 */
import { createRouter } from '@agentuity/runtime';

const api = createRouter();

// GET /api/shared/:streamId — retrieve a shared session (public, no auth)
api.get('/:streamId', async (c) => {
	const streamId = c.req.param('streamId');
	const streamService = c.var.stream;

	try {
		const readable = await streamService.download(streamId);

		// Read the stream to a string
		const reader = readable.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}

		const text = new TextDecoder().decode(
			chunks.reduce((acc, chunk) => {
				const merged = new Uint8Array(acc.length + chunk.length);
				merged.set(acc);
				merged.set(chunk, acc.length);
				return merged;
			}, new Uint8Array(0))
		);

		const data = JSON.parse(text);
		return c.json(data);
	} catch (error) {
		c.var.logger.error('Failed to download shared session', { error, streamId });
		return c.json({ error: 'Shared session not found or expired' }, 404);
	}
});

export default api;
