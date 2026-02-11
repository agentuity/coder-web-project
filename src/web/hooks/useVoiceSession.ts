import { useCallback, useRef, useState } from 'react';
import type { PersonaState } from '../components/ai-elements/persona';

interface UseVoiceSessionOptions {
  sessionId: string;
  isSessionBusy: boolean;
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
}

interface UseVoiceSessionReturn {
  personaState: PersonaState;
  lastSpokenText: string | null;
  transcript: string[];
  addTranscript: (role: 'user' | 'lead', text: string) => void;
  speakText: (text: string) => Promise<void>;
}

export function useVoiceSession(
  options: UseVoiceSessionOptions,
  audioCallbacks?: {
    enqueue: (segment: { base64: string; mimeType: string }) => void;
  }
): UseVoiceSessionReturn {
  const { isSessionBusy, isListening, isProcessing, isSpeaking } = options;
  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'lead'; text: string }>>([]);
  const speakingRef = useRef(false);

  // Determine persona state based on priorities:
  // speaking > listening > thinking > idle
  const personaState: PersonaState = (() => {
    if (isSpeaking) return 'speaking';
    if (isListening) return 'listening';
    if (isProcessing) return 'thinking';
    if (isSessionBusy) return 'thinking';
    return 'idle';
  })();

  const addTranscript = useCallback((role: 'user' | 'lead', text: string) => {
    setTranscript(prev => {
      const next = [...prev, { role, text }];
      return next.slice(-20);
    });
    if (role === 'lead') {
      setLastSpokenText(text);
    }
  }, []);

  const speakText = useCallback(async (text: string) => {
    if (!text.trim() || speakingRef.current) return;
    speakingRef.current = true;
    try {
      const res = await fetch('/api/voice/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'alloy' }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const data = await res.json() as { audio?: { base64: string; mimeType: string } };
      if (data.audio && audioCallbacks?.enqueue) {
        audioCallbacks.enqueue(data.audio);
        addTranscript('lead', text);
      }
    } catch {
      // Silent fail for TTS -- non-critical
    } finally {
      speakingRef.current = false;
    }
  }, [audioCallbacks, addTranscript]);

  return {
    personaState,
    lastSpokenText,
    transcript: transcript.map(t => `${t.role === 'user' ? 'You' : 'Lead'}: ${t.text}`),
    addTranscript,
    speakText,
  };
}
