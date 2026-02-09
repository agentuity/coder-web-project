/**
 * Shared sandbox health-check utilities.
 *
 * Both sessions.ts and session-detail.ts need to probe sandbox liveness
 * and cache the result to avoid hammering the health endpoint on every request.
 */

const sandboxStatusCache = new Map<string, number>();

export const SANDBOX_STATUS_TTL_MS = 15_000;

export function getCachedHealthTimestamp(sessionId: string): number | undefined {
	return sandboxStatusCache.get(sessionId);
}

export function setCachedHealthTimestamp(sessionId: string, timestamp: number): void {
	sandboxStatusCache.set(sessionId, timestamp);
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
