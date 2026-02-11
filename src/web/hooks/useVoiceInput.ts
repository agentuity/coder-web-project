import { useCallback, useEffect, useRef, useState } from 'react';

interface UseVoiceInputOptions {
	onTranscript: (text: string) => void;
	onInterimTranscript?: (text: string) => void;
}

interface UseVoiceInputReturn {
	isListening: boolean;
	isProcessing: boolean;
	isSupported: boolean;
	toggleListening: () => void;
	error: string | null;
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognition) | null {
	if (typeof window === 'undefined') return null;
	return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function getMediaRecorderMimeType(): string | null {
	if (typeof MediaRecorder === 'undefined') return null;
	const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
	for (const mime of candidates) {
		if (MediaRecorder.isTypeSupported(mime)) return mime;
	}
	return null;
}

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
	const { onTranscript, onInterimTranscript } = options;
	const [isListening, setIsListening] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const recognitionRef = useRef<SpeechRecognition | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const isListeningRef = useRef(false);

	// Keep the ref in sync so event handlers see the latest value
	useEffect(() => {
		isListeningRef.current = isListening;
	}, [isListening]);

	const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
	const mediaRecorderMime = getMediaRecorderMimeType();
	const hasSpeechApi = SpeechRecognitionCtor !== null;
	const hasMediaRecorder = mediaRecorderMime !== null;
	const isSupported = hasSpeechApi || hasMediaRecorder;

	// Stable references to callbacks
	const onTranscriptRef = useRef(onTranscript);
	const onInterimTranscriptRef = useRef(onInterimTranscript);
	useEffect(() => {
		onTranscriptRef.current = onTranscript;
	}, [onTranscript]);
	useEffect(() => {
		onInterimTranscriptRef.current = onInterimTranscript;
	}, [onInterimTranscript]);

	// -----------------------------------------------------------------------
	// Web Speech API path
	// -----------------------------------------------------------------------
	const startSpeechRecognition = useCallback(() => {
		if (!SpeechRecognitionCtor) return;

		const recognition = new SpeechRecognitionCtor();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';

		recognition.onresult = (event: SpeechRecognitionEvent) => {
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				if (!result || result.length === 0) continue;
				const transcript = result[0]?.transcript ?? '';
				if (result.isFinal) {
					onTranscriptRef.current(transcript);
				} else {
					onInterimTranscriptRef.current?.(transcript);
				}
			}
		};

		recognition.onerror = (event: Event & { error: string }) => {
			if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
				setError('Microphone access denied. Please allow microphone access in your browser settings.');
			} else if (event.error !== 'aborted') {
				setError('Voice recognition error. Please try again.');
			}
			setIsListening(false);
		};

		recognition.onend = () => {
			// Auto-stopped by silence — just clean up
			if (isListeningRef.current) {
				setIsListening(false);
			}
		};

		recognitionRef.current = recognition;

		try {
			recognition.start();
			setIsListening(true);
			setError(null);
		} catch {
			setError('Failed to start voice recognition.');
		}
	}, [SpeechRecognitionCtor]);

	const stopSpeechRecognition = useCallback(() => {
		recognitionRef.current?.stop();
		recognitionRef.current = null;
		setIsListening(false);
	}, []);

	// -----------------------------------------------------------------------
	// MediaRecorder fallback path
	// -----------------------------------------------------------------------
	const startMediaRecorder = useCallback(async () => {
		if (!mediaRecorderMime) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaStreamRef.current = stream;
			chunksRef.current = [];

			const recorder = new MediaRecorder(stream, { mimeType: mediaRecorderMime });
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			recorder.onstop = async () => {
				// Stop all tracks
				mediaStreamRef.current?.getTracks().forEach((track) => { track.stop(); });
				mediaStreamRef.current = null;

				const chunks = chunksRef.current;
				if (chunks.length === 0) {
					setIsProcessing(false);
					return;
				}

				setIsProcessing(true);

				try {
					const blob = new Blob(chunks, { type: mediaRecorderMime });
					const reader = new FileReader();
					const base64 = await new Promise<string>((resolve, reject) => {
						reader.onloadend = () => {
							const result = typeof reader.result === 'string' ? reader.result : '';
							const b64 = result.includes(',') ? result.split(',')[1] || '' : '';
							resolve(b64);
						};
						reader.onerror = () => reject(new Error('Failed to read audio data'));
						reader.readAsDataURL(blob);
					});

					const res = await fetch('/api/voice/transcribe', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ audio: base64 }),
					});

					if (!res.ok) {
						throw new Error('Transcription request failed');
					}

					const data = (await res.json()) as { text?: string };
					if (data.text) {
						onTranscriptRef.current(data.text);
					}
				} catch {
					setError('Transcription failed. Please try again.');
				} finally {
					setIsProcessing(false);
				}
			};

			recorder.start();
			setIsListening(true);
			setError(null);
		} catch (err) {
			const message =
				err instanceof DOMException && err.name === 'NotAllowedError'
					? 'Microphone access denied. Please allow microphone access in your browser settings.'
					: 'Failed to access microphone.';
			setError(message);
		}
	}, [mediaRecorderMime]);

	const stopMediaRecorder = useCallback(() => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
			mediaRecorderRef.current.stop();
		}
		mediaRecorderRef.current = null;
		setIsListening(false);
	}, []);

	// -----------------------------------------------------------------------
	// Toggle
	// -----------------------------------------------------------------------
	const toggleListening = useCallback(() => {
		if (isListening) {
			if (hasSpeechApi) {
				stopSpeechRecognition();
			} else {
				stopMediaRecorder();
			}
		} else {
			if (hasSpeechApi) {
				startSpeechRecognition();
			} else {
				void startMediaRecorder();
			}
		}
	}, [isListening, hasSpeechApi, startSpeechRecognition, stopSpeechRecognition, startMediaRecorder, stopMediaRecorder]);

	// -----------------------------------------------------------------------
	// Cleanup on unmount
	// -----------------------------------------------------------------------
	useEffect(() => {
		return () => {
			recognitionRef.current?.abort();
			recognitionRef.current = null;
			if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
				mediaRecorderRef.current.stop();
			}
			mediaRecorderRef.current = null;
			mediaStreamRef.current?.getTracks().forEach((track) => { track.stop(); });
			mediaStreamRef.current = null;
		};
	}, []);

	return {
		isListening,
		isProcessing,
		isSupported,
		toggleListening,
		error,
	};
}
