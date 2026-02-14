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
}

export function useChildSessions(
  sessionId: string,
  options?: UseChildSessionsOptions,
) {
  const [children, setChildren] = useState<ChildSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache child message data by child session ID to avoid re-fetching
  const childDataCache = useRef<Map<string, ChildSessionData>>(new Map());
  // Track whether the list has been fetched to avoid refetching on every render
  const hasFetched = useRef(false);
  const lastSessionId = useRef<string>("");
  const lastArchivedMode = useRef<boolean | undefined>(undefined);

  const archived = options?.archived ?? false;

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

  useEffect(() => {
    if (!sessionId || hasFetched.current) return;

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
  }, [sessionId, archived]);

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
      } catch {
        return null;
      }
    },
    [sessionId, archived],
  );

  return { children, isLoading, error, fetchChildMessages };
}
