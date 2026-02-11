/**
 * Agentuity Evals for the LeadNarrator voice agent.
 *
 * These evals run in production on every session to monitor narrator quality:
 * - Condensing quality (LLM-judge): Does condense produce natural spoken text?
 * - Condensing completeness (LLM-judge): Does condensed text preserve substance?
 * - Role adherence (preset): Does the agent stay in first-person character?
 * - Safety (preset): No unsafe content in any output
 * - Conciseness (preset): Output isn't padded with filler
 * - Self-reference (preset): Agent doesn't break character ("As an AI...")
 */
import agent from './lead-narrator';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { safety, conciseness, selfReference, roleAdherence } from '@agentuity/evals';

// ---------------------------------------------------------------------------
// Eval 1: Condensing Quality (LLM-as-Judge)
// Tests: Does the condense/narrate output sound like natural spoken language?
// Applies to: condense & narrate actions (where text output exists)
// ---------------------------------------------------------------------------
export const condensingQuality = agent.createEval('condensing-quality', {
	description: 'Scores whether condensed text sounds like natural spoken language (not written prose)',
	handler: async (ctx, input, output) => {
		// Only evaluate actions that produce condensed text
		if (!['condense', 'narrate'].includes(input.action)) {
			return { passed: true, score: 1, reason: 'Skipped — not a condensing action' };
		}
		if (!output.text) {
			return { passed: false, score: 0, reason: 'No text output produced' };
		}

		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				score: z.number().min(0).max(1),
				reason: z.string(),
			}),
			prompt: `Score how natural this text sounds as SPOKEN language (0-1).

Text to evaluate:
"${output.text}"

Scoring criteria:
- 1.0 = Sounds completely natural when read aloud, like someone talking to a colleague
- 0.7 = Mostly natural with minor awkwardness
- 0.4 = Mix of spoken and written style
- 0.1 = Reads like a written document, not speech

Penalize: bullet points, markdown formatting, code syntax, overly formal language, numbered lists.
Reward: conversational flow, natural transitions, spoken contractions, appropriate pacing.`,
		});

		return {
			passed: object.score >= 0.7,
			score: object.score,
			reason: object.reason,
		};
	},
});

// ---------------------------------------------------------------------------
// Eval 2: Condensing Completeness (LLM-as-Judge)
// Tests: Does the condensed output preserve the substance of the original?
// Applies to: condense & narrate actions (where input text was transformed)
// ---------------------------------------------------------------------------
export const condensingCompleteness = agent.createEval('condensing-completeness', {
	description: 'Scores whether condensed text covers the key substance of the original input',
	handler: async (ctx, input, output) => {
		// Only evaluate actions that condense text
		if (!['condense', 'narrate'].includes(input.action)) {
			return { passed: true, score: 1, reason: 'Skipped — not a condensing action' };
		}
		if (!input.text || !output.text) {
			return { passed: false, score: 0, reason: 'Missing input or output text' };
		}
		// For narrate with short text (<200 chars), condensing is skipped
		if (input.action === 'narrate' && input.text.length < 200) {
			return { passed: true, score: 1, reason: 'Skipped — text too short for condensing' };
		}

		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				score: z.number().min(0).max(1),
				reason: z.string(),
			}),
			prompt: `Score how well this spoken summary covers the key substance of the original text (0-1).

Original text:
"${input.text.slice(0, 2000)}"

Spoken summary:
"${output.text}"

Scoring criteria:
- 1.0 = All key points, decisions, and outcomes are covered
- 0.7 = Most important points covered, minor details omitted (acceptable)
- 0.4 = Missing significant information that changes understanding
- 0.1 = Barely covers the original content

Note: The summary is for SPEECH, so omitting code syntax, file paths, and formatting details is EXPECTED and should NOT be penalized. Focus on whether the substance (what was done, what was found, what the answer is) is preserved.`,
		});

		return {
			passed: object.score >= 0.6,
			score: object.score,
			reason: object.reason,
		};
	},
});

// ---------------------------------------------------------------------------
// Eval 3: First-Person Voice (LLM-as-Judge)
// Tests: Does the agent speak as "I" (the coding AI), not "the assistant"?
// This is a critical requirement from the CONDENSE_SYSTEM prompt.
// ---------------------------------------------------------------------------
export const firstPersonVoice = agent.createEval('first-person-voice', {
	description: 'Checks that condensed text uses first-person voice ("I did...") not third-person ("the assistant said...")',
	handler: async (ctx, input, output) => {
		// Only evaluate condensed text output
		if (!['condense', 'narrate'].includes(input.action)) {
			return { passed: true, reason: 'Skipped — not a condensing action' };
		}
		if (!output.text) {
			return { passed: false, reason: 'No text output produced' };
		}

		const { object } = await generateObject({
			model: openai('gpt-4o-mini'),
			schema: z.object({
				passed: z.boolean(),
				reason: z.string(),
			}),
			prompt: `Check if this text is written in FIRST PERSON (speaking as "I", the AI developer assistant).

Text to evaluate:
"${output.text}"

PASS if: The text uses first-person voice ("I created...", "I found...", "I ran...", "Here's what I did...")
FAIL if: The text uses third-person references like "the assistant said", "the response mentions", "it looks like the agent...", "the AI mentioned"

Minor: Occasional passive voice ("the build was completed") is acceptable if the overall voice is first-person.`,
		});

		return { passed: object.passed, reason: object.reason };
	},
});

// ---------------------------------------------------------------------------
// Eval 4: Audio Output Validation (Programmatic)
// Tests: When audio should be produced, is it actually produced?
// Applies to: speak & narrate actions
// ---------------------------------------------------------------------------
export const audioOutput = agent.createEval('audio-output', {
	description: 'Validates that speak/narrate actions produce valid audio output',
	handler: async (_ctx, input, output) => {
		// Only evaluate actions that should produce audio
		if (!['speak', 'narrate'].includes(input.action)) {
			return { passed: true, reason: 'Skipped — not an audio action' };
		}
		// If no input text, empty output is expected
		if (!input.text) {
			return { passed: true, reason: 'No input text — empty output expected' };
		}

		if (!output.audio) {
			return { passed: false, reason: 'Expected audio output but got none' };
		}
		if (!output.audio.base64) {
			return { passed: false, reason: 'Audio output missing base64 data' };
		}
		if (!output.audio.mimeType) {
			return { passed: false, reason: 'Audio output missing mimeType' };
		}

		// Basic sanity: base64 should be non-trivial length (at least 1KB of audio)
		const isReasonableSize = output.audio.base64.length > 1000;
		if (!isReasonableSize) {
			return {
				passed: false,
				reason: `Audio base64 too small (${output.audio.base64.length} chars) — likely corrupted or empty`,
			};
		}

		return {
			passed: true,
			reason: `Audio produced: ${output.audio.mimeType}, ${Math.round(output.audio.base64.length / 1024)}KB base64`,
		};
	},
});

// ---------------------------------------------------------------------------
// Eval 5: Safety (Preset)
// Tests: No unsafe content in any output (harassment, harmful content, etc)
// ---------------------------------------------------------------------------
export const safetyCheck = agent.createEval(
	safety({
		middleware: {
			transformInput: (input) => ({
				request: input.text || input.audio || 'voice action',
			}),
			transformOutput: (output) => ({
				response: output.text || (output.audio ? '[audio output]' : '[empty]'),
			}),
		},
	}),
);

// ---------------------------------------------------------------------------
// Eval 6: Conciseness (Preset)
// Tests: Output isn't padded with filler — important for TTS (shorter = better UX)
// ---------------------------------------------------------------------------
export const concisenessCheck = agent.createEval(
	conciseness({
		threshold: 0.6, // Lower threshold since condensed text is already optimized for speech
		middleware: {
			transformInput: (input) => ({
				request: input.text || 'voice action',
			}),
			transformOutput: (output) => ({
				response: output.text || '[audio only]',
			}),
		},
	}),
);

// ---------------------------------------------------------------------------
// Eval 7: Self-Reference (Preset)
// Tests: Agent doesn't break character with "As an AI...", "I'm an AI assistant..."
// ---------------------------------------------------------------------------
export const selfReferenceCheck = agent.createEval(
	selfReference({
		middleware: {
			transformInput: (input) => ({
				request: input.text || 'voice action',
			}),
			transformOutput: (output) => ({
				response: output.text || '[audio only]',
			}),
		},
	}),
);

// ---------------------------------------------------------------------------
// Eval 8: Role Adherence (Preset)
// Tests: Agent stays in character as a coding AI / developer assistant
// ---------------------------------------------------------------------------
export const roleAdherenceCheck = agent.createEval(
	roleAdherence({
		threshold: 0.7,
		middleware: {
			transformInput: (input) => ({
				request: input.text || 'voice action',
				context: 'You are a coding AI developer assistant that speaks in first person about code tasks.',
			}),
			transformOutput: (output) => ({
				response: output.text || '[audio only]',
			}),
		},
	}),
);
