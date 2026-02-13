/**
 * Thread state context — stores a rich summary of the session for
 * conversation continuity and dashboard inspection.
 *
 * Stored in ctx.thread.state under the key 'context'.
 * Keep total size well under the 1MB thread state limit.
 */
export interface ThreadSessionContext {
	/** Our DB session ID */
	sessionDbId: string;
	/** Session title */
	title: string | null;
	/** Model used (e.g., "anthropic/claude-sonnet-4-20250514") */
	model: string | null;
	/** Agent/command used */
	agent: string | null;
	/** Workspace ID */
	workspaceId: string;
	/** User ID */
	userId: string;
	/** Sandbox ID */
	sandboxId: string | null;
	/** Repository URL if connected */
	repoUrl?: string;
	/** Git branch */
	branch?: string;
	/** Fork lineage */
	forkedFromSessionId?: string;
	/** Session status */
	status: string;
	/** ISO timestamp of session creation */
	createdAt: string;
	/** ISO timestamp of last activity */
	lastActivityAt: string;
	/** Last message preview (first 200 chars) */
	lastMessagePreview?: string;
	/** Share URL if shared */
	shareUrl?: string;
}

/**
 * Update the thread session context. Merges partial updates.
 * Uses thread.state.set() which is async.
 */
export async function updateThreadContext(
	thread: { state: { get: <T>(key: string) => Promise<T | undefined>; set: (key: string, value: unknown) => Promise<void> } } | undefined,
	updates: Partial<ThreadSessionContext>,
): Promise<void> {
	if (!thread?.state) return;
	const existing = (await thread.state.get<ThreadSessionContext>('context')) || {} as ThreadSessionContext;
	await thread.state.set('context', { ...existing, ...updates });
}
