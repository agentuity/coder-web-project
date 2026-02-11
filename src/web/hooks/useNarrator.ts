import { useCallback, useRef } from 'react';
import type { AccumulatedEvent } from './useEventAccumulator';

interface UseNarratorOptions {
  enabled: boolean;
  onNarration: (text: string) => void; // Called with narrator's spoken text
}

export function useNarrator(options: UseNarratorOptions) {
  const { enabled, onNarration } = options;
  const isNarratingRef = useRef(false);
  const onNarrationRef = useRef(onNarration);

  // Keep ref in sync
  onNarrationRef.current = onNarration;

  const narrate = useCallback(async (events: AccumulatedEvent[]) => {
    if (!enabled || isNarratingRef.current || events.length === 0) return;

    isNarratingRef.current = true;
    try {
      const res = await fetch('/api/voice/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events,
        }),
      });

      if (!res.ok) throw new Error('Narration failed');

      const data = await res.json() as { text?: string; action?: string };
      if (data.text) {
        onNarrationRef.current(data.text);
      }
    } catch {
      // Silent fail -- narration is non-critical
    } finally {
      isNarratingRef.current = false;
    }
  }, [enabled]);

  const clearHistory = useCallback(() => {
    // No-op: mid-task narration is now stateless (each call is independent)
  }, []);

  return { narrate, clearHistory };
}
