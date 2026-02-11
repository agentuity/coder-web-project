/**
 * Agentuity Evals for the UiGenerator agent.
 *
 * Evals:
 * - Spec validity (programmatic)
 * - Component coverage (LLM-judge)
 * - Visual quality (LLM-judge)
 * - Safe output (preset)
 */
import agent from './ui-generator';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { safety } from '@agentuity/evals';

const EVAL_MODEL = openai('gpt-4o-mini');

const specShape = z.object({
	root: z.string(),
	elements: z.record(z.string(), z.unknown()),
});

function describeInput(input: { action: string; prompt: string; context?: string }) {
	const parts = [`Action: ${input.action}`, `Prompt: ${input.prompt}`];
	if (input.context) {
		parts.push(`Context: ${input.context}`);
	}
	return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Eval 1: Spec Validity (Programmatic)
// Tests: Does the output contain a valid spec with root + elements?
// Applies to: generate & refine actions (where spec output exists)
// ---------------------------------------------------------------------------
export const specValidity = agent.createEval('spec-validity', {
	description: 'Validates that the output contains a JSON Render spec with root and elements',
	handler: async (_ctx, input, output) => {
		if (!['generate', 'refine'].includes(input.action)) {
			return { passed: true, reason: 'Skipped — not a spec generation action' };
		}
		if (!output.spec) {
			return { passed: false, reason: 'No spec output produced' };
		}

		const parsed = specShape.safeParse(output.spec);
		if (!parsed.success) {
			return { passed: false, reason: 'Spec missing root or elements map' };
		}

		return { passed: true, reason: 'Spec contains root and elements map' };
	},
});

// ---------------------------------------------------------------------------
// Eval 2: Component Coverage (LLM-as-Judge)
// Tests: Does the UI address the user request?
// ---------------------------------------------------------------------------
export const componentCoverage = agent.createEval('component-coverage', {
	description: 'Scores whether the generated UI addresses the user prompt',
	handler: async (_ctx, input, output) => {
		if (!['generate', 'refine'].includes(input.action)) {
			return { passed: true, score: 1, reason: 'Skipped — not a spec generation action' };
		}
		if (!output.spec) {
			return { passed: false, score: 0, reason: 'No spec output produced' };
		}

		const result = await generateText({
			model: EVAL_MODEL,
			output: Output.object({
				schema: z.object({
					score: z.number().min(0).max(1),
					reason: z.string(),
				}),
			}),
			prompt: `Score how well this UI spec covers the user's request (0-1).

User request:
"${input.prompt}"

UI spec:
${JSON.stringify(output.spec)}

Scoring criteria:
- 1.0 = Fully addresses the request with appropriate components and structure
- 0.7 = Mostly addresses the request with minor gaps
- 0.4 = Partially addresses the request, missing key elements
- 0.1 = Does not address the request
`,
		});

		const obj = result.output!;
		return {
			passed: obj.score >= 0.7,
			score: obj.score,
			reason: obj.reason,
		};
	},
});

// ---------------------------------------------------------------------------
// Eval 3: Visual Quality (LLM-as-Judge)
// Tests: Is the UI well-structured with good layout and component choices?
// ---------------------------------------------------------------------------
export const visualQuality = agent.createEval('visual-quality', {
	description: 'Scores UI layout quality and component choices',
	handler: async (_ctx, input, output) => {
		if (!['generate', 'refine'].includes(input.action)) {
			return { passed: true, score: 1, reason: 'Skipped — not a spec generation action' };
		}
		if (!output.spec) {
			return { passed: false, score: 0, reason: 'No spec output produced' };
		}

		const result = await generateText({
			model: EVAL_MODEL,
			output: Output.object({
				schema: z.object({
					score: z.number().min(0).max(1),
					reason: z.string(),
				}),
			}),
			prompt: `Score the visual layout quality of this UI spec (0-1).

UI spec:
${JSON.stringify(output.spec)}

Scoring criteria:
- 1.0 = Clear hierarchy, sensible layout grouping, consistent spacing, strong component choices
- 0.7 = Generally good structure with minor layout issues
- 0.4 = Weak structure or inconsistent layout choices
- 0.1 = Poor structure or confusing layout
`,
		});

		const obj = result.output!;
		return {
			passed: obj.score >= 0.7,
			score: obj.score,
			reason: obj.reason,
		};
	},
});

// ---------------------------------------------------------------------------
// Eval 4: Safe Output (Preset)
// Tests: No unsafe content in generated UI
// ---------------------------------------------------------------------------
export const safeOutput = agent.createEval(
	safety({
		middleware: {
			transformInput: (input) => ({
				request: describeInput(input),
			}),
			transformOutput: (output) => ({
				response: output.code
					? output.code
					: output.spec
						? JSON.stringify(output.spec)
						: output.description || '[empty]',
			}),
		},
	}),
);
