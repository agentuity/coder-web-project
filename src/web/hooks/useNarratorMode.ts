import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceInput } from './useVoiceInput';

interface UseNarratorModeOptions {
	onAutoSend: (text: string) => void;
	onCancel: () => void;
	onDictation?: (text: string) => void;
	silenceTimeout?: number;
	isSpeaking?: boolean;
}

interface UseNarratorModeReturn {
	narratorEnabled: boolean;
	toggleNarrator: () => void;

	isListening: boolean;
	isProcessing: boolean;
	isSupported: boolean;
	toggleMic: () => void;

	accumulatedText: string;
	interimText: string;
	clearAccumulated: () => void;

	isCountingDown: boolean;
	countdownProgress: number;
	cancelCountdown: () => void;

	voiceError: string | null;
}

const TRIGGER_REGEX = /\b(send|go|cancel)\s*$/i;

export function useNarratorMode(options: UseNarratorModeOptions): UseNarratorModeReturn {
	const { onAutoSend, onCancel, onDictation, silenceTimeout = 3000, isSpeaking = false } = options;

	const [narratorEnabled, setNarratorEnabled] = useState(false);
	const [accumulatedText, setAccumulatedText] = useState('');
	const [interimText, setInterimText] = useState('');
	const [isCountingDown, setIsCountingDown] = useState(false);
	const [countdownProgress, setCountdownProgress] = useState(1);

	const narratorEnabledRef = useRef(false);
	const accumulatedTextRef = useRef('');
	const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const countdownStartRef = useRef(0);
	const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const micActivatedByNarratorRef = useRef(false);

	// Keep refs in sync
	useEffect(() => {
		narratorEnabledRef.current = narratorEnabled;
	}, [narratorEnabled]);
	useEffect(() => {
		accumulatedTextRef.current = accumulatedText;
	}, [accumulatedText]);

	// Stable callback refs
	const onAutoSendRef = useRef(onAutoSend);
	const onCancelRef = useRef(onCancel);
	const onDictationRef = useRef(onDictation);
	useEffect(() => { onAutoSendRef.current = onAutoSend; }, [onAutoSend]);
	useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
	useEffect(() => { onDictationRef.current = onDictation; }, [onDictation]);

	const clearCountdownTimers = useCallback(() => {
		if (silenceTimerRef.current) {
			clearTimeout(silenceTimerRef.current);
			silenceTimerRef.current = null;
		}
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}
		setIsCountingDown(false);
		setCountdownProgress(1);
	}, []);

	const startCountdown = useCallback(() => {
		clearCountdownTimers();

		countdownStartRef.current = Date.now();
		setIsCountingDown(true);
		setCountdownProgress(1);

		countdownIntervalRef.current = setInterval(() => {
			const elapsed = Date.now() - countdownStartRef.current;
			const progress = Math.max(0, 1 - elapsed / silenceTimeout);
			setCountdownProgress(progress);
			if (progress <= 0) {
				clearCountdownTimers();
			}
		}, 50);

		silenceTimerRef.current = setTimeout(() => {
			clearCountdownTimers();
			const text = accumulatedTextRef.current.trim();
			if (text) {
				onAutoSendRef.current(text);
				setAccumulatedText('');
				setInterimText('');
			}
		}, silenceTimeout);
	}, [silenceTimeout, clearCountdownTimers]);

	const cancelCountdown = useCallback(() => {
		clearCountdownTimers();
	}, [clearCountdownTimers]);

	const clearAccumulated = useCallback(() => {
		setAccumulatedText('');
		setInterimText('');
		cancelCountdown();
	}, [cancelCountdown]);

	// Transcript handler for narrator mode
	const handleTranscript = useCallback((text: string) => {
		if (!narratorEnabledRef.current) {
			// Not in narrator mode — pass to dictation callback
			onDictationRef.current?.(text);
			return;
		}

		// Check for trigger word at end of this transcript segment
		const match = text.match(TRIGGER_REGEX);
		if (match) {
			const triggerWord = match[1]!.toLowerCase();
			const strippedSegment = text.replace(TRIGGER_REGEX, '').trim();

			if (triggerWord === 'cancel') {
				clearCountdownTimers();
				setAccumulatedText('');
				setInterimText('');
				onCancelRef.current();
				return;
			}

			// "send" or "go"
			const fullText = accumulatedTextRef.current
				? `${accumulatedTextRef.current} ${strippedSegment}`.trim()
				: strippedSegment;

			clearCountdownTimers();
			setAccumulatedText('');
			setInterimText('');

			if (fullText) {
				onAutoSendRef.current(fullText);
			}
			return;
		}

		// No trigger word — accumulate and start/reset countdown
		setAccumulatedText((prev) => (prev ? `${prev} ${text}` : text).trim());
		setInterimText('');
		startCountdown();
	}, [clearCountdownTimers, startCountdown]);

	const handleInterimTranscript = useCallback((text: string) => {
		if (!narratorEnabledRef.current) return;
		setInterimText(text);
		// Speaking detected — cancel any running countdown
		cancelCountdown();
	}, [cancelCountdown]);

	const {
		isListening,
		isProcessing,
		isSupported,
		toggleListening,
		error: voiceError,
	} = useVoiceInput({
		onTranscript: handleTranscript,
		onInterimTranscript: handleInterimTranscript,
		continuous: true,
	});

	// Track isSpeaking in a ref for use in effects
	const isSpeakingRef = useRef(false);
	useEffect(() => {
		isSpeakingRef.current = isSpeaking;
	}, [isSpeaking]);

	// Auto-restart recognition when it stops while narrator is on
	const isListeningRef = useRef(false);
	useEffect(() => {
		const wasListening = isListeningRef.current;
		isListeningRef.current = isListening;

		if (wasListening && !isListening && narratorEnabledRef.current) {
			// Recognition auto-stopped — restart after brief delay, but NOT while speaking
			autoRestartTimerRef.current = setTimeout(() => {
				if (narratorEnabledRef.current && !isSpeakingRef.current) {
					toggleListening();
				}
			}, 200);
		}
	}, [isListening, toggleListening]);

	// Pause recognition while TTS is playing, resume when done
	const wasSpeakingRef = useRef(false);
	useEffect(() => {
		const wasSpeaking = wasSpeakingRef.current;
		wasSpeakingRef.current = isSpeaking;

		if (!narratorEnabledRef.current) return;

		if (!wasSpeaking && isSpeaking) {
			// TTS started — stop recognition to prevent feedback loop
			if (isListeningRef.current) {
				toggleListening();
			}
		} else if (wasSpeaking && !isSpeaking) {
			// TTS finished — restart recognition
			if (!isListeningRef.current) {
				autoRestartTimerRef.current = setTimeout(() => {
					if (narratorEnabledRef.current && !isSpeakingRef.current) {
						toggleListening();
					}
				}, 300);
			}
		}
	}, [isSpeaking, toggleListening]);

	const toggleNarrator = useCallback(() => {
		setNarratorEnabled((prev) => {
			const next = !prev;
			if (next) {
				// Turning narrator ON — activate mic
				if (!isListeningRef.current) {
					micActivatedByNarratorRef.current = true;
					toggleListening();
				}
			} else {
				// Turning narrator OFF — deactivate mic if we activated it
				if (isListeningRef.current) {
					toggleListening();
				}
				micActivatedByNarratorRef.current = false;
				// Clear state
				setAccumulatedText('');
				setInterimText('');
				clearCountdownTimers();
			}
			return next;
		});
	}, [toggleListening, clearCountdownTimers]);

	const toggleMic = useCallback(() => {
		if (narratorEnabledRef.current) {
			// Turning mic off while narrator is on → turns narrator off
			if (isListeningRef.current) {
				setNarratorEnabled(false);
				micActivatedByNarratorRef.current = false;
				setAccumulatedText('');
				setInterimText('');
				clearCountdownTimers();
				toggleListening();
			}
			return;
		}
		// Normal dictation toggle
		toggleListening();
	}, [toggleListening, clearCountdownTimers]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
			if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
			if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
		};
	}, []);

	return {
		narratorEnabled,
		toggleNarrator,
		isListening,
		isProcessing,
		isSupported,
		toggleMic,
		accumulatedText,
		interimText,
		clearAccumulated,
		isCountingDown,
		countdownProgress,
		cancelCountdown,
		voiceError,
	};
}
