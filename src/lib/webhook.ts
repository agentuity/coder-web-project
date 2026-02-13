/**
 * Webhook invocation utility with retry logic.
 *
 * Fires a POST to the caller-supplied webhook URL when a task
 * reaches a terminal state (completed, error, terminated).
 */

export interface WebhookPayload {
	taskId: string;
	status: 'completed' | 'error' | 'terminated';
	repoUrl?: string;
	branch?: string;
	summary?: string;
	prUrl?: string;
	error?: string;
	completedAt: string;
}

interface WebhookOptions {
	/** Maximum number of delivery attempts (default: 3). */
	maxAttempts?: number;
	/** Initial backoff in ms before the first retry (default: 1000). */
	initialBackoffMs?: number;
}

/**
 * Deliver a webhook payload via POST with exponential-backoff retry.
 *
 * Returns `true` if the webhook was delivered (2xx response),
 * `false` if all attempts failed.
 */
export async function deliverWebhook(
	url: string,
	payload: WebhookPayload,
	options: WebhookOptions = {},
): Promise<boolean> {
	const maxAttempts = options.maxAttempts ?? 3;
	const initialBackoffMs = options.initialBackoffMs ?? 1_000;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Agentuity-Coder/1.0',
					'X-Webhook-Attempt': String(attempt),
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(10_000), // 10s timeout per attempt
			});

			if (response.ok) {
				return true;
			}

			// Non-retryable client errors (4xx except 429)
			if (response.status >= 400 && response.status < 500 && response.status !== 429) {
				console.warn(
					`[webhook] Non-retryable ${response.status} from ${url} (attempt ${attempt}/${maxAttempts})`,
				);
				return false;
			}
		} catch (err) {
			console.warn(
				`[webhook] Delivery attempt ${attempt}/${maxAttempts} to ${url} failed:`,
				err instanceof Error ? err.message : err,
			);
		}

		// Exponential backoff before next retry
		if (attempt < maxAttempts) {
			const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
			await new Promise((r) => setTimeout(r, backoff));
		}
	}

	console.error(`[webhook] All ${maxAttempts} attempts to ${url} failed`);
	return false;
}
