/**
 * OpenCode SDK client manager.
 * Maintains one client instance per sandbox for connection reuse.
 */
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';
import { buildBasicAuthHeader } from './sandbox';

const clients = new Map<string, OpencodeClient>();

/**
 * Get or create an OpenCode SDK client for a sandbox.
 * The client connects to the OpenCode server running inside the sandbox.
 * If password is provided, Basic Auth headers are included in all requests.
 */
export function getOpencodeClient(sandboxId: string, baseUrl: string, password?: string): OpencodeClient {
  let client = clients.get(sandboxId);
  if (!client) {
    client = createOpencodeClient({
      baseUrl,
      ...(password ? { headers: { Authorization: buildBasicAuthHeader(password) } } : {}),
    });
    clients.set(sandboxId, client);
  }
  return client;
}

/**
 * Remove a client when a sandbox is destroyed.
 */
export function removeOpencodeClient(sandboxId: string): void {
  clients.delete(sandboxId);
}

/**
 * Check if a client exists for a sandbox.
 */
export function hasOpencodeClient(sandboxId: string): boolean {
  return clients.has(sandboxId);
}

export type { OpencodeClient };
