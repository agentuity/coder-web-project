import { useCallback, useState } from 'react';
import type { PersonaState } from '../components/ai-elements/persona';

interface UseVoiceSessionOptions {
  sessionId: string;
  isSessionBusy: boolean;  // From parent -- whether OpenCode is processing
  isListening: boolean;    // From useVoiceInput -- whether mic is active
  isProcessing: boolean;   // From useVoiceInput -- whether transcription is in progress
}

interface UseVoiceSessionReturn {
  personaState: PersonaState;
  lastSpokenText: string | null;
  transcript: string[];      // Rolling transcript of what was said (narrator + user)
  addTranscript: (role: 'user' | 'lead', text: string) => void;
}

export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const { isSessionBusy, isListening, isProcessing } = options;
  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'lead'; text: string }>>([]);

  // Determine persona state based on priorities:
  // speaking > listening > thinking > idle
  const personaState: PersonaState = (() => {
    if (isListening) return 'listening';
    if (isProcessing) return 'thinking';
    if (isSessionBusy) return 'thinking';
    return 'idle';
  })();

  const addTranscript = useCallback((role: 'user' | 'lead', text: string) => {
    setTranscript(prev => {
      const next = [...prev, { role, text }];
      // Keep last 20 entries
      return next.slice(-20);
    });
    if (role === 'lead') {
      setLastSpokenText(text);
    }
  }, []);

  return {
    personaState,
    lastSpokenText,
    transcript: transcript.map(t => `${t.role === 'user' ? 'You' : 'Lead'}: ${t.text}`),
    addTranscript,
  };
}
