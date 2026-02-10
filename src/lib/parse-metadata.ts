import type { chatSessions } from '../db/schema';

/**
 * Safely parse session metadata, handling double-encoded jsonb strings.
 *
 * The `metadata` column is `jsonb`, but some rows were stored as a JSON
 * *string* (e.g. `"{\"repoUrl\":\"...\"}"`) instead of an object.  This
 * helper transparently handles both representations so callers always get
 * back a plain `Record<string, unknown>`.
 */
export function parseMetadata(
	session: Pick<typeof chatSessions.$inferSelect, 'metadata'>,
): Record<string, unknown> {
	const raw = session.metadata;
	if (!raw) return {};
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	}
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		return raw as Record<string, unknown>;
	}
	return {};
}
