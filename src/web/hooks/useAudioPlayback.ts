import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioSegment {
  base64: string;
  mimeType: string;
}

interface UseAudioPlaybackReturn {
  isSpeaking: boolean;
  enqueue: (segment: AudioSegment) => void;
  stop: () => void;
  clearQueue: () => void;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<AudioSegment[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);

  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    // Convert base64 to blob URL and play
    const byteChars = atob(next.base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: next.mimeType });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    currentAudioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      isPlayingRef.current = false;
      playNext(); // Play next in queue
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      isPlayingRef.current = false;
      playNext(); // Skip errored, play next
    };

    audio.play().catch(() => {
      // Autoplay blocked -- clean up
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      isPlayingRef.current = false;
      setIsSpeaking(false);
    });
  }, []);

  const enqueue = useCallback((segment: AudioSegment) => {
    queueRef.current.push(segment);
    if (!isPlayingRef.current) {
      playNext();
    }
  }, [playNext]);

  const stop = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      const src = currentAudioRef.current.src;
      if (src.startsWith('blob:')) URL.revokeObjectURL(src);
      currentAudioRef.current = null;
    }
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    stop();
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        const src = currentAudioRef.current.src;
        if (src.startsWith('blob:')) URL.revokeObjectURL(src);
      }
      queueRef.current = [];
    };
  }, []);

  return { isSpeaking, enqueue, stop, clearQueue };
}
