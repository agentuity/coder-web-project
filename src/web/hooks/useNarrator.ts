import { useCallback, useRef } from 'react';
import type { AccumulatedEvent } from './useEventAccumulator';

interface UseNarratorOptions {
  enabled: boolean;
  onNarration: (text: string) => void; // Called with narrator's spoken text
}

interface NarratorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useNarrator(options: UseNarratorOptions) {
  const { enabled, onNarration } = options;
  const conversationRef = useRef<NarratorMessage[]>([]);
  const isNarratingRef = useRef(false);
  const onNarrationRef = useRef(onNarration);

  // Keep ref in sync
  onNarrationRef.current = onNarration;

  const narrate = useCallback(async (events: AccumulatedEvent[], chatMessages?: Array<{role: string; text: string}>) => {
    if (!enabled || isNarratingRef.current || events.length === 0) return;

    isNarratingRef.current = true;
    try {
      // Build event summary for narrator
      const eventSummary = events.map(e => `[${e.type}] ${e.summary}`).join('\n');

      // Add to conversation history
      conversationRef.current.push({ role: 'user', content: eventSummary });

      // Keep conversation history manageable (last 10 exchanges)
      if (conversationRef.current.length > 20) {
        conversationRef.current = conversationRef.current.slice(-20);
      }

      const res = await fetch('/api/voice/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events,
          conversationHistory: conversationRef.current.map(m => ({
            role: m.role,
            content: m.content,
          })),
          chatMessages: chatMessages,
        }),
      });

      if (!res.ok) throw new Error('Narration failed');

      const data = await res.json() as { text?: string; action?: string };
      if (data.text) {
        // Add narrator response to conversation history
        conversationRef.current.push({ role: 'assistant', content: data.text });
        onNarrationRef.current(data.text);
      }
    } catch {
      // Silent fail -- narration is non-critical
    } finally {
      isNarratingRef.current = false;
    }
  }, [enabled]);

  const clearHistory = useCallback(() => {
    conversationRef.current = [];
  }, []);

  return { narrate, clearHistory };
}
