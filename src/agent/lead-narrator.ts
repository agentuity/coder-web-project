import { createAgent } from '@agentuity/runtime';
import {
	experimental_transcribe as transcribe,
	experimental_generateSpeech as generateSpeech,
	generateText,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const NARRATOR_SYSTEM_PROMPT = `You are "Lead" — the Lead Developer on the Agentuity Coder team.
You're working directly with the user on their coding project. You watch a coding AI work in real-time and translate what's happening into natural conversation.

Your job is to:
- Give brief, natural voice updates on what's happening
- Summarize technical changes in plain language  
- Ask the user questions when clarification is needed
- Celebrate wins and explain problems
- Keep updates SHORT (1-2 sentences max) for natural conversation flow
- Sound like a friendly, competent colleague — not a robot

You do NOT:
- Read code verbatim
- Give long technical explanations unless asked
- Repeat yourself
- Use filler words excessively
- Sound overly enthusiastic or corporate`;

const agent = createAgent('LeadNarrator', {
	description:
		'Voice narrator agent for Lead persona mode — watches OpenCode events and generates conversational voice updates',
	schema: {
		input: z.object({
			action: z.enum(['narrate', 'transcribe', 'speak']),
			events: z.array(z.any()).optional(),
			context: z.string().optional(),
			conversationHistory: z
				.array(
					z.object({
						role: z.enum(['user', 'assistant']),
						content: z.string(),
					})
				)
				.optional(),
			audio: z.string().optional(),
			text: z.string().optional(),
			voice: z.string().optional(),
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
				if (!input.events || input.events.length === 0) {
					return { text: '', action: 'update' as const };
				}

				const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
					...(input.conversationHistory || []),
					{
						role: 'user' as const,
						content: `Here are the latest coding events:\n${JSON.stringify(input.events, null, 2)}${
							input.context ? `\n\nContext: ${input.context}` : ''
						}`,
					},
				];

				const { text } = await generateText({
					model: anthropic('claude-sonnet-4-5'),
					system: NARRATOR_SYSTEM_PROMPT,
					messages,
					maxOutputTokens: 150,
				});

				return { text, action: 'update' as const };
			}

			default:
				return { action: 'error' as const };
		}
	},
});

export default agent;
