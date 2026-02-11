import { createAgent } from '@agentuity/runtime';
import {
	experimental_transcribe as transcribe,
	experimental_generateSpeech as generateSpeech,
	generateText,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Fast model for all speech generation — low latency is critical
const FAST_MODEL = anthropic('claude-haiku-4-5-20250401');

const LEAD_PERSONA = `You are "Lead" — a senior developer working alongside the user on their coding project. You're their voice interface to the coding AI.

You speak naturally, like a colleague sitting next to them. You have access to the full conversation between the user and the coding assistant, plus real-time tool events.

Core principles:
- You have AGENCY — you decide what to say and how much based on the situation
- Short responses when appropriate, detailed when the user needs it
- If the user asked a question, ANSWER it using the conversation context
- If the user asked for an explanation, give the key concepts without reading code verbatim
- If it's a follow-up question, reference the earlier context
- Never read code syntax, function signatures, or technical markup aloud
- Sound like a real person — varied, natural, not robotic
- 1-4 sentences typically, but use your judgment`;

const MID_TASK_SYSTEM = `${LEAD_PERSONA}

You're giving a brief real-time update while the coding AI is working. Think of it like a colleague glancing at the screen and saying what's happening.

Guidelines for mid-task updates:
- One sentence, natural and casual
- Examples of tone: "Editing some code real quick." / "Running the build, hang on." / "Looks like there's a test failure, fixing it." / "Making changes to a few files."
- Don't be generic — reference the actual events you're given
- Vary your phrasing — don't repeat the same thing
- If something went wrong, be honest but calm`;

const COMPLETION_SYSTEM = `${LEAD_PERSONA}

The coding assistant just finished responding. Your job is to deliver the response to the user as spoken audio.

How to decide what to say:
- If the response is short and conversational, relay it naturally (maybe even verbatim if it's already speech-friendly)
- If the response is long/technical, summarize the key points in 2-4 sentences
- If the response contains code with explanations, explain the concepts without reading code
- If the user asked a specific question, make sure you answer it
- If lists or examples are given, describe the pattern instead of listing every item
- If the user asked "explain this to me", give a genuine explanation — not just "I explained it"
- Always preserve the essential meaning and any important caveats

You receive the full recent conversation so you understand the context of what the user asked.`;

const agent = createAgent('LeadNarrator', {
	description:
		'Voice persona agent for Lead mode — generates natural spoken responses with full conversation awareness',
	schema: {
		input: z.object({
			action: z.enum(['narrate', 'transcribe', 'speak', 'condense']),
			events: z.array(z.any()).optional(),
			text: z.string().optional(),
			audio: z.string().optional(),
			voice: z.string().optional(),
			conversationHistory: z.array(z.object({
				role: z.string(),
				text: z.string(),
			})).optional(),
		}),
		output: z.object({
			text: z.string().optional(),
			audio: z
				.object({
					base64: z.string(),
					mimeType: z.string(),
				})
				.optional(),
			action: z.enum(['update', 'question', 'complete', 'error']).optional(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('LeadNarrator action', { action: input.action });

		switch (input.action) {
			case 'transcribe': {
				if (!input.audio) {
					return { text: '', action: 'error' as const };
				}
				const transcript = await transcribe({
					model: openai.transcription('whisper-1'),
					audio: Buffer.from(input.audio, 'base64'),
				});
				return { text: transcript.text };
			}

			case 'speak': {
				if (!input.text) {
					return { action: 'error' as const };
				}
				const speech = await generateSpeech({
					model: openai.speech('gpt-4o-mini-tts'),
					text: input.text,
					voice: (input.voice || 'alloy') as never,
				});
				return {
					audio: {
						base64: speech.audio.base64,
						mimeType: 'audio/mpeg',
					},
				};
			}

			case 'narrate': {
				// Mid-task: generate a brief, natural spoken update from tool events
				if (!input.events || input.events.length === 0) {
					return { text: '', action: 'update' as const };
				}

				const eventSummary = input.events
					.map((e: any) => `[${e.type}] ${e.summary}`)
					.join('\n');

				const { text } = await generateText({
					model: FAST_MODEL,
					system: MID_TASK_SYSTEM,
					messages: [{ role: 'user', content: `Current tool events:\n${eventSummary}` }],
					maxOutputTokens: 60,
				});

				return { text, action: 'update' as const };
			}

			case 'condense': {
				// Completion: generate a spoken response with full conversation awareness
				if (!input.text) {
					return { text: '', action: 'update' as const };
				}

				// Build conversation context
				let conversationContext = '';
				if (input.conversationHistory && input.conversationHistory.length > 0) {
					conversationContext = input.conversationHistory
						.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
						.join('\n\n');
				}

				const prompt = conversationContext
					? `Recent conversation:\n${conversationContext}\n\nThe assistant's latest response (to be delivered as speech):\n${input.text}`
					: `The assistant's response (to be delivered as speech):\n${input.text}`;

				const { text } = await generateText({
					model: FAST_MODEL,
					system: COMPLETION_SYSTEM,
					messages: [{ role: 'user', content: prompt }],
					maxOutputTokens: 300,
				});

				return { text, action: 'update' as const };
			}

			default:
				return { action: 'error' as const };
		}
	},
});

export default agent;
