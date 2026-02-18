/**
 * Hook for fetching child (sub-agent) sessions for a given parent session.
 *
 * Supports both archived mode (reads from PostgreSQL archive tables) and
 * live mode (reads from sandbox SQLite via backend proxy).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import type { Message, Part } from "../types/opencode";

export interface ChildSessionSummary {
  id: string;
  opencodeSessionId: string;
  parentSessionId: string | null;
  title: string | null;
  totalCost: number;
  totalTokens: number;
  messageCount: number;
  timeCreated: string | number | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChildSessionData {
  session: ChildSessionSummary;
  messages: Message[];
  parts: Part[];
  todos: Array<{
    id: string;
    content: string;
    status: string;
    priority: string;
  }>;
}

interface UseChildSessionsOptions {
  archived?: boolean;
  sessionStatus?: string;
}

export function useChildSessions(
  sessionId: string,
  options?: UseChildSessionsOptions,
) {
  const [children, setChildren] = useState<ChildSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Incrementing this forces the fetch effect to re-run after hasFetched is reset
  const [retryCounter, setRetryCounter] = useState(0);

  // Cache child message data by child session ID to avoid re-fetching
  const childDataCache = useRef<Map<string, ChildSessionData>>(new Map());
  // Track whether the list has been fetched to avoid refetching on every render
  const hasFetched = useRef(false);
  const lastSessionId = useRef<string>("");
  const lastArchivedMode = useRef<boolean | undefined>(undefined);

  const archived = options?.archived ?? false;
  const sessionStatus = options?.sessionStatus;

  // Reset cache when sessionId or archived mode changes
  if (
    lastSessionId.current !== sessionId ||
    lastArchivedMode.current !== archived
  ) {
    lastSessionId.current = sessionId;
    lastArchivedMode.current = archived;
    hasFetched.current = false;
    childDataCache.current.clear();
  }

  // Re-fetch children when session transitions to "active" and we have no data
  // biome-ignore lint/correctness/useExhaustiveDependencies: children.length is intentionally read as snapshot, not reactive dep
  useEffect(() => {
    if (sessionStatus === "active" && hasFetched.current) {
      if (children.length === 0) {
        hasFetched.current = false;
        setRetryCounter((c) => c + 1);
      }
    }
  }, [sessionStatus]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCounter triggers re-fetch after hasFetched ref is reset
  useEffect(() => {
    if (!sessionId || hasFetched.current) return;
    // Don't fetch children while sandbox is still initializing (avoids 503)
    if (sessionStatus === "creating") return;

    const controller = new AbortController();
    let isMounted = true;

    const fetchChildren = async () => {
      setIsLoading(true);
      setError(null);

      const url = archived
        ? `/api/sessions/${sessionId}/archive/children`
        : `/api/sessions/${sessionId}/children`;

      try {
        const res = await apiFetch(url, { signal: controller.signal });
        const data = (await res.json()) as { children: ChildSessionSummary[] };
        if (isMounted) {
          setChildren(data.children ?? []);
          hasFetched.current = true;
        }
      } catch (err) {
        if (!isMounted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch child sessions",
        );
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchChildren();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [sessionId, archived, retryCounter, sessionStatus]);

  /**
   * Fetch full messages/parts for a specific child session.
   * Results are cached so repeated calls are instant.
   */
  const fetchChildMessages = useCallback(
    async (childId: string): Promise<ChildSessionData | null> => {
      // Check cache first
      const cached = childDataCache.current.get(childId);
      if (cached) return cached;

      const url = archived
        ? `/api/sessions/${sessionId}/archive/children/${childId}`
        : `/api/sessions/${sessionId}/children/${childId}`;

      try {
        const res = await apiFetch(url);
        const data = (await res.json()) as ChildSessionData;

        // Cache the result
        childDataCache.current.set(childId, data);
        return data;
      } catch (err) {
        // If archived endpoint fails, try live endpoint as fallback
        // (child session data may still be accessible from the running sandbox)
        if (archived) {
          // Find the opencodeSessionId for this child (needed for live SQLite lookup)
          const child = children.find((c) => c.id === childId);
          const liveChildId = child?.opencodeSessionId ?? childId;
          const liveUrl = `/api/sessions/${sessionId}/children/${liveChildId}`;
          try {
            const liveRes = await apiFetch(liveUrl);
            const liveData = (await liveRes.json()) as ChildSessionData;
            childDataCache.current.set(childId, liveData);
            return liveData;
          } catch (liveErr) {
            console.warn(
              "[useChildSessions] fetchChildMessages failed (both archived and live):",
              {
                childId,
                liveChildId,
                archivedError: err instanceof Error ? err.message : String(err),
                liveError:
                  liveErr instanceof Error ? liveErr.message : String(liveErr),
              },
            );
            return null;
          }
        }
        console.warn("[useChildSessions] fetchChildMessages failed:", {
          childId,
          url,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    [sessionId, archived, children],
  );

  return { children, isLoading, error, fetchChildMessages };
}
