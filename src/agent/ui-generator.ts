import { createAgent } from '@agentuity/runtime';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { defineCatalog, type Spec } from '@json-render/core';
import { schema } from '@json-render/react';
import { collectUsedComponents, serializeProps } from '@json-render/codegen';
import { z } from 'zod';

const UI_MODEL = anthropic('claude-sonnet-4-20250514');

const spacing = z.enum(['sm', 'md', 'lg']);
const align = z.enum(['start', 'center', 'end', 'stretch']);

// Inline catalog fallback (mirrors src/web/lib/ui-catalog.ts)
const inlineCatalog = defineCatalog(schema, {
	components: {
		Card: {
			props: z.object({
				title: z.string(),
				description: z.string().optional(),
				padding: spacing.optional(),
			}),
			slots: ['default'],
			description: 'Container card for grouping content',
		},
		Text: {
			props: z.object({
				content: z.string(),
				variant: z.enum(['heading', 'subheading', 'body', 'caption']).optional(),
			}),
			description: 'Text display',
		},
		Button: {
			props: z.object({
				label: z.string(),
				variant: z.enum(['primary', 'secondary', 'outline', 'ghost']).optional(),
				action: z.string().optional(),
			}),
			description: 'Clickable button',
		},
		Table: {
			props: z.object({
				columns: z.array(
					z.object({
						key: z.string(),
						label: z.string(),
					}),
				),
				rows: z.array(z.record(z.string(), z.unknown())),
			}),
			description: 'Data table',
		},
		Metric: {
			props: z.object({
				label: z.string(),
				value: z.union([z.string(), z.number()]),
				change: z.string().optional(),
				trend: z.enum(['up', 'down', 'neutral']).optional(),
			}),
			description: 'Key metric',
		},
		Chart: {
			props: z.object({
				type: z.enum(['bar', 'line', 'pie']),
				data: z.array(z.union([z.number(), z.record(z.string(), z.unknown())])),
				xKey: z.string().optional(),
				yKey: z.string().optional(),
			}),
			description: 'Data chart',
		},
		Form: {
			props: z.object({
				title: z.string().optional(),
			}),
			slots: ['default'],
			description: 'Form container',
		},
		Input: {
			props: z.object({
				label: z.string(),
				placeholder: z.string().optional(),
				type: z.enum(['text', 'email', 'number', 'password']).optional(),
			}),
			description: 'Text input',
		},
		Select: {
			props: z.object({
				label: z.string(),
				options: z.array(
					z.object({
						value: z.string(),
						label: z.string(),
					}),
				),
			}),
			description: 'Dropdown select',
		},
		Image: {
			props: z.object({
				src: z.string(),
				alt: z.string().optional(),
				width: z.number().optional(),
				height: z.number().optional(),
			}),
			description: 'Image display',
		},
		Badge: {
			props: z.object({
				text: z.string(),
				variant: z.enum(['default', 'success', 'warning', 'error', 'info']).optional(),
			}),
			description: 'Status badge',
		},
		Alert: {
			props: z.object({
				message: z.string(),
				variant: z.enum(['info', 'success', 'warning', 'error']).optional(),
				title: z.string().optional(),
			}),
			description: 'Alert block',
		},
		Row: {
			props: z.object({
				gap: spacing.optional(),
				align: align.optional(),
			}),
			slots: ['default'],
			description: 'Horizontal layout',
		},
		Column: {
			props: z.object({
				gap: spacing.optional(),
				align: align.optional(),
			}),
			slots: ['default'],
			description: 'Vertical layout',
		},
		Stack: {
			props: z.object({
				gap: spacing.optional(),
				direction: z.enum(['horizontal', 'vertical']).optional(),
			}),
			slots: ['default'],
			description: 'Stacked layout',
		},
		Divider: {
			props: z.object({}),
			description: 'Visual separator',
		},
		Link: {
			props: z.object({
				href: z.string(),
				label: z.string(),
				external: z.boolean().optional(),
			}),
			description: 'Navigation link',
		},
		Code: {
			props: z.object({
				language: z.string().optional(),
				content: z.string(),
			}),
			description: 'Code block',
		},
	},
	actions: {
		navigate: {
			params: z.object({
				url: z.string(),
			}),
			description: 'Navigate to URL',
		},
		submit: {
			params: z.object({
				formId: z.string().optional(),
				data: z.record(z.string(), z.unknown()).optional(),
			}),
			description: 'Submit form data',
		},
		action: {
			params: z.object({
				name: z.string().optional(),
				payload: z.record(z.string(), z.unknown()).optional(),
			}),
			description: 'Generic action',
		},
	},
});

type Catalog = typeof inlineCatalog;
type JsonRenderSpec = Spec;
type JsonRenderElement = {
	type: string;
	props?: Record<string, unknown>;
	slots?: Record<string, string[] | string>;
};

const specShape = z.object({
	root: z.string(),
	elements: z.record(
		z.string(),
		z.object({
			type: z.string(),
			props: z.record(z.string(), z.unknown()).optional(),
			slots: z.record(z.string(), z.union([z.array(z.string()), z.string()])).optional(),
		}).passthrough(),
	),
});

const BASE_SYSTEM = `You are a UI generation agent that produces JSON Render specs.

Spec format:
- The spec is a JSON object with { "root": "elementId", "elements": { ... } }.
- "root" is the id of the top-level element.
- "elements" is a map of elementId -> element definition.
- Each element has a "type" (component name), optional "props", and optional "slots".
- Slots map slotName -> array of child elementIds. Use "default" for main children.

Output rules:
- Output ONLY the JSON spec. No prose, no markdown.
- Use unique element ids.
- Provide meaningful prop values.`;

const CUSTOM_RULES = [
	'Use Card components for grouping related content.',
	'Use Row for horizontal layouts and Column for vertical layouts.',
	'Always provide meaningful prop values (no placeholder lorem ipsum).',
	"Use consistent spacing; default to gap='md' for layout components.",
	'Generate unique element IDs.',
	'Output ONLY the JSON spec, no explanation.',
];

async function resolveCatalog(logger: { warn: (msg: string, meta?: Record<string, unknown>) => void }) {
	try {
		const module = await import('../web/lib/ui-catalog');
		if (module?.catalog) {
			return module.catalog as Catalog;
		}
	} catch (error) {
		logger.warn('UI catalog import failed; falling back to inline catalog', {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return inlineCatalog;
}

function stripCodeFences(text: string) {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) {
		return fenced[1].trim();
	}

	return text.trim();
}

function tryParseJson(text: string) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function extractJsonSpec(rawText: string) {
	const cleaned = stripCodeFences(rawText);
	const firstBrace = cleaned.indexOf('{');
	const lastBrace = cleaned.lastIndexOf('}');

	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
		return { spec: null, error: 'No JSON object found in model output.' };
	}

	const slice = cleaned.slice(firstBrace, lastBrace + 1);
	let parsed = tryParseJson(slice);
	if (!parsed) {
		const sanitized = slice.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
		parsed = tryParseJson(sanitized);
	}

	if (!parsed) {
		return { spec: null, error: 'Failed to parse JSON from model output.' };
	}

	const shape = specShape.safeParse(parsed);
	if (!shape.success) {
		return { spec: null, error: 'Parsed JSON does not match required spec shape.' };
	}

	return { spec: shape.data as JsonRenderSpec };
}

function buildSystemPrompt(catalog: Catalog) {
	return catalog.prompt({
		system: BASE_SYSTEM,
		customRules: CUSTOM_RULES,
	});
}

function buildUserPrompt(input: {
	action: 'generate' | 'refine';
	prompt: string;
	currentSpec?: Record<string, unknown>;
	data?: Record<string, unknown>;
	context?: string;
}) {
	const parts = [
		`User request:\n${input.prompt}`,
		input.context ? `Context:\n${input.context}` : null,
		input.data ? `Available data (JSON):\n${JSON.stringify(input.data, null, 2)}` : null,
		input.currentSpec
			? `Current spec (JSON):\n${JSON.stringify(input.currentSpec, null, 2)}`
			: null,
		input.action === 'refine'
			? 'Update the existing spec to address the request. Return the full updated spec.'
			: 'Create a new spec that satisfies the request.',
	];

	return parts.filter(Boolean).join('\n\n');
}

function indentLines(text: string, spaces: number) {
	const pad = ' '.repeat(spaces);
	return text
		.split('\n')
		.map(line => (line ? `${pad}${line}` : line))
		.join('\n');
}

function normalizeSlotIds(slot: string[] | string | undefined) {
	if (!slot) return [] as string[];
	return Array.isArray(slot) ? slot : [slot];
}

function renderElement(
	spec: { root: string; elements: Record<string, JsonRenderElement> },
	id: string,
	indent: number,
): string {
	const element = spec.elements[id];
	if (!element) {
		return `${' '.repeat(indent)}{/* Missing element: ${id} */}`;
	}

	const children = normalizeSlotIds(element.slots?.default);
	const propsString = element.props && Object.keys(element.props).length > 0
		? serializeProps(element.props)
		: '';
	const propsSection = propsString ? ` ${propsString}` : '';
	const pad = ' '.repeat(indent);

	if (children.length === 0) {
		return `${pad}<${element.type}${propsSection} />`;
	}

	const renderedChildren: string = children
		.map(childId => renderElement(spec, childId, indent + 2))
		.join('\n');

	return `${pad}<${element.type}${propsSection}>\n${renderedChildren}\n${pad}</${element.type}>`;
}

function renderComponentStub(component: string) {
	switch (component) {
		case 'Card':
			return `const Card = ({ title, description, padding = 'md', children }: any) => (\n  <section className={\`card card-\${padding}\`}>\n    <header>\n      <h2>{title}</h2>\n      {description ? <p>{description}</p> : null}\n    </header>\n    <div>{children}</div>\n  </section>\n);`;
		case 'Text':
			return `const Text = ({ content, variant = 'body' }: any) => {\n  const Tag = variant === 'heading' ? 'h1' : variant === 'subheading' ? 'h3' : variant === 'caption' ? 'span' : 'p';\n  return <Tag>{content}</Tag>;\n};`;
		case 'Button':
			return `const Button = ({ label, variant = 'primary', action }: any) => (\n  <button data-action={action} className={\`btn btn-\${variant}\`}>{label}</button>\n);`;
		case 'Table':
			return `const Table = ({ columns, rows }: any) => (\n  <table>\n    <thead>\n      <tr>{columns.map((col: any) => <th key={col.key}>{col.label}</th>)}</tr>\n    </thead>\n    <tbody>\n      {rows.map((row: any, idx: number) => (\n        <tr key={idx}>{columns.map((col: any) => <td key={col.key}>{row[col.key]}</td>)}</tr>\n      ))}\n    </tbody>\n  </table>\n);`;
		case 'Metric':
			return `const Metric = ({ label, value, change, trend }: any) => (\n  <div className={\`metric metric-\${trend || 'neutral'}\`}>\n    <span>{label}</span>\n    <strong>{value}</strong>\n    {change ? <em>{change}</em> : null}\n  </div>\n);`;
		case 'Chart':
			return `const Chart = ({ type, data }: any) => (\n  <div className={\`chart chart-\${type}\`}>\n    <pre>{JSON.stringify(data, null, 2)}</pre>\n  </div>\n);`;
		case 'Form':
			return `const Form = ({ title, children }: any) => (\n  <form>\n    {title ? <h3>{title}</h3> : null}\n    {children}\n  </form>\n);`;
		case 'Input':
			return `const Input = ({ label, placeholder, type = 'text' }: any) => (\n  <label>\n    <span>{label}</span>\n    <input type={type} placeholder={placeholder} />\n  </label>\n);`;
		case 'Select':
			return `const Select = ({ label, options }: any) => (\n  <label>\n    <span>{label}</span>\n    <select>{options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>\n  </label>\n);`;
		case 'Image':
			return `const Image = ({ src, alt, width, height }: any) => (\n  <img src={src} alt={alt || ''} width={width} height={height} />\n);`;
		case 'Badge':
			return `const Badge = ({ text, variant = 'default' }: any) => (\n  <span className={\`badge badge-\${variant}\`}>{text}</span>\n);`;
		case 'Alert':
			return `const Alert = ({ title, message, variant = 'info' }: any) => (\n  <div className={\`alert alert-\${variant}\`}>\n    {title ? <strong>{title}</strong> : null}\n    <p>{message}</p>\n  </div>\n);`;
		case 'Row':
			return `const Row = ({ gap = 'md', align = 'stretch', children }: any) => (\n  <div className={\`row gap-\${gap}\`} style={{ display: 'flex', alignItems: align, gap }} >\n    {children}\n  </div>\n);`;
		case 'Column':
			return `const Column = ({ gap = 'md', align = 'stretch', children }: any) => (\n  <div className={\`column gap-\${gap}\`} style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap }} >\n    {children}\n  </div>\n);`;
		case 'Stack':
			return `const Stack = ({ gap = 'md', direction = 'vertical', children }: any) => (\n  <div className={\`stack stack-\${direction} gap-\${gap}\`} style={{ display: 'flex', flexDirection: direction === 'horizontal' ? 'row' : 'column', gap }} >\n    {children}\n  </div>\n);`;
		case 'Divider':
			return 'const Divider = () => <hr />;';
		case 'Link':
			return `const Link = ({ href, label, external }: any) => (\n  <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{label}</a>\n);`;
		case 'Code':
			return `const Code = ({ content, language }: any) => (\n  <pre data-language={language}><code>{content}</code></pre>\n);`;
		default:
			return `const ${component} = ({ children, ...props }: any) => (\n  <div {...props}>{children}</div>\n);`;
	}
}

function generateStandaloneReactCode(spec: JsonRenderSpec) {
	const usedComponents = Array.from(collectUsedComponents(spec));
	const componentStubs = usedComponents.map(renderComponentStub).join('\n\n');
	const jsxTree = renderElement(
		{ root: spec.root, elements: spec.elements as Record<string, JsonRenderElement> },
		spec.root,
		4,
	);

	return [
		"import React from 'react';",
		'',
		'// Standalone component stubs (replace with your design system as needed)',
		componentStubs,
		'',
		"export function GeneratedUI({ data }: { data?: Record<string, unknown> }) {",
		'  void data;',
		'  return (',
		indentLines(jsxTree, 2),
		'  );',
		'}',
	].join('\n');
}

const agent = createAgent('UiGenerator', {
	description: 'Generates and refines json-render specs for dynamic UI',
	schema: {
		input: z.object({
			action: z.enum(['generate', 'refine', 'export']),
			prompt: z.string(),
			currentSpec: z.record(z.string(), z.unknown()).optional(),
			data: z.record(z.string(), z.unknown()).optional(),
			context: z.string().optional(),
		}),
		output: z.object({
			spec: specShape.optional(),
			code: z.string().optional(),
			description: z.string().optional(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('UiGenerator action', { action: input.action });

		if (input.action === 'export') {
			if (!input.currentSpec) {
				ctx.logger.warn('UiGenerator export requested without currentSpec');
				return { description: 'No spec provided for export.' };
			}

			const shape = specShape.safeParse(input.currentSpec);
			if (!shape.success) {
				ctx.logger.warn('UiGenerator export spec invalid', { errors: shape.error.issues });
				return { description: 'Provided spec is invalid for export.' };
			}

			const code = generateStandaloneReactCode(shape.data as JsonRenderSpec);
			return {
				code,
				description: 'Exported standalone React component code.',
			};
		}

		const catalog = await resolveCatalog(ctx.logger);
		const systemPrompt = buildSystemPrompt(catalog);
		const userPrompt = buildUserPrompt({
			action: input.action,
			prompt: input.prompt,
			currentSpec: input.currentSpec,
			data: input.data,
			context: input.context,
		});

		const { text } = await generateText({
			model: UI_MODEL,
			system: systemPrompt,
			messages: [{ role: 'user', content: userPrompt }],
			maxOutputTokens: 1500,
		});

		const { spec, error } = extractJsonSpec(text);
		if (!spec) {
			ctx.logger.warn('UiGenerator failed to parse spec', { error });
			return {
				description: error ?? 'Failed to parse JSON spec from model output.',
			};
		}

		const validation = catalog.validate(spec);
		if (!validation.success) {
			ctx.logger.warn('UiGenerator spec validation failed', {
				error: validation.error?.message,
			});
			return {
				description: 'Generated spec failed validation against the catalog.',
			};
		}

		return {
			spec: validation.data as unknown as z.infer<typeof specShape>,
			description:
				input.action === 'refine'
					? 'Refined the existing UI spec.'
					: 'Generated a new UI spec.',
		};
	},
});

export default agent;
