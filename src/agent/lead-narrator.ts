import { createAgent } from '@agentuity/runtime';
import {
	experimental_transcribe as transcribe,
	experimental_generateSpeech as generateSpeech,
	generateText,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const FAST_MODEL = anthropic('claude-haiku-4-5');

const CONDENSE_SYSTEM = `You ARE the coding AI. The user is talking to you directly through voice. When you speak, you are speaking as yourself — the developer assistant who writes code, runs builds, and answers questions.

Your job: Convert the written response into natural spoken form. Think of it as reading your own message aloud to a colleague.

Rules:
- Speak in FIRST PERSON — "I created...", "I ran...", "Here's what I found..."
- NEVER say "the assistant said", "the response mentions", "it looks like the agent..."
- Cover the SUBSTANCE — what was done, what was found, what the answer is
- For technical responses: explain the concepts, walk through the results, describe what happened
- For code tasks: describe what you built, what the output was, whether it worked
- For questions: give the full answer, not just "I answered it"
- For lists/multiple points: go through the important ones, don't just say "there are several points"
- Skip code syntax, file paths, and technical markup — but DO cover what the code does
- Match the depth of the original — a detailed response deserves a detailed spoken version
- Aim for natural speech length: 3-8 sentences for medium responses, more for complex ones
- Always sound like YOU are the one who did the work

You receive the full recent conversation so you have context.`;

const agent = createAgent('LeadNarrator', {
	description: 'Voice agent — generates spoken responses from assistant text',
	schema: {
		input: z.object({
			action: z.enum(['transcribe', 'speak', 'condense']),
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
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('LeadNarrator action', { action: input.action });

		switch (input.action) {
			case 'transcribe': {
				if (!input.audio) {
					return { text: '' };
				}
				const transcript = await transcribe({
					model: openai.transcription('whisper-1'),
					audio: Buffer.from(input.audio, 'base64'),
				});
				return { text: transcript.text };
			}

			case 'speak': {
				if (!input.text) {
					return {};
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

			case 'condense': {
				if (!input.text) {
					return { text: '' };
				}

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
					system: CONDENSE_SYSTEM,
					messages: [{ role: 'user', content: prompt }],
					maxOutputTokens: 800,
				});

				return { text };
			}

			default:
				return {};
		}
	},
});

export default agent;
