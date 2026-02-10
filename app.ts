import { createApp, getThreadProvider } from '@agentuity/runtime';
import type { ThreadIDProvider } from '@agentuity/runtime';

// Custom thread ID provider that maps chat session IDs to thread IDs.
// Routes under /api/sessions/:id/... use the session ID as thread identity.
const sessionThreadProvider: ThreadIDProvider = {
	getThreadId(_appState, ctx) {
		// Try to extract session ID from the URL path
		// Matches: /api/sessions/:id/..., /api/workspaces/:wid/sessions (uses wid)
		const url = new URL(ctx.req.url);
		const segments = url.pathname.split('/');

		// Look for /sessions/:id pattern
		const sessIdx = segments.indexOf('sessions');
		const sessionSegment = sessIdx >= 0 ? segments[sessIdx + 1] : undefined;
		if (sessionSegment) {
			// Clean to alphanumeric only, pad if needed
			const clean = sessionSegment.replace(/[^a-zA-Z0-9]/g, '');
			if (clean.length > 0) {
				const padded = clean.padEnd(27, '0');
				return `thrd_${padded.substring(0, 59)}`;
			}
		}

		// Fallback: use a hash of the full path for non-session routes
		const pathHash = Array.from(new TextEncoder().encode(url.pathname))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
			.substring(0, 27);
		return `thrd_${pathHash.padEnd(27, '0')}`;
	},
};

const { server, logger } = await createApp({
	shutdown: async (_state) => {},
});

// Set custom thread ID provider AFTER app initialization
// (getThreadProvider() requires createApp to complete first)
const threadProvider = getThreadProvider();
if (threadProvider) {
	threadProvider.setThreadIDProvider(sessionThreadProvider);
}

logger.debug('Running %s', server.url);
