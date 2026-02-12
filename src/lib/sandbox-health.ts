/**
 * Shared sandbox health-check utilities.
 *
 * Both sessions.ts and session-detail.ts need to probe sandbox liveness
 * and cache the result to avoid hammering the health endpoint on every request.
 *
 * Uses consecutive failure counting to avoid false termination on transient errors.
 */

interface HealthCacheEntry {
	lastChecked: number;
	failCount: number;
}

const sandboxStatusCache = new Map<string, HealthCacheEntry>();

export const SANDBOX_STATUS_TTL_MS = 15_000;

/** Number of consecutive failures required before marking a sandbox as terminated. */
const TERMINATION_THRESHOLD = 3;

export function getCachedHealthTimestamp(sessionId: string): number | undefined {
	return sandboxStatusCache.get(sessionId)?.lastChecked;
}

export function setCachedHealthTimestamp(sessionId: string, timestamp: number): void {
	const existing = sandboxStatusCache.get(sessionId);
	sandboxStatusCache.set(sessionId, {
		lastChecked: timestamp,
		failCount: existing?.failCount ?? 0,
	});
}

/**
 * Record the result of a health check for a session.
 * Resets failCount on success, increments on failure.
 */
export function recordHealthResult(sessionId: string, healthy: boolean): void {
	const existing = sandboxStatusCache.get(sessionId);
	const lastChecked = existing?.lastChecked ?? Date.now();
	if (healthy) {
		sandboxStatusCache.set(sessionId, { lastChecked, failCount: 0 });
	} else {
		sandboxStatusCache.set(sessionId, {
			lastChecked,
			failCount: (existing?.failCount ?? 0) + 1,
		});
	}
}

/**
 * Returns true only when the session has accumulated enough consecutive
 * health-check failures to be considered truly terminated.
 */
export function shouldMarkTerminated(sessionId: string): boolean {
	const entry = sandboxStatusCache.get(sessionId);
	return (entry?.failCount ?? 0) >= TERMINATION_THRESHOLD;
}

export async function isSandboxHealthy(sandboxUrl: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);
	try {
		const resp = await fetch(`${sandboxUrl}/global/health`, { signal: controller.signal });
		return resp.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}
