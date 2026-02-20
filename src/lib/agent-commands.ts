/** Map slash-command slugs to the OpenCode agent display names used by promptAsync. */
export const COMMAND_TO_AGENT: Record<string, string> = {
	'agentuity-coder': 'Agentuity Coder Lead',
	'agentuity-cadence': 'Agentuity Coder Lead',
	'agentuity-memory-save': 'Agentuity Coder Memory',
	'agentuity-memory-share': 'Agentuity Coder Lead',
	'agentuity-cloud': 'Agentuity Coder Lead',
	'agentuity-sandbox': 'Agentuity Coder Lead',
	'agentuity-qa': 'Agentuity Coder QA',
};

/**
 * Commands that have templates in OpenCode's plugin system.
 * These MUST be sent as slash command text (e.g., "/agentuity-cadence <prompt>")
 * so OpenCode expands the template. Using the `agent` field bypasses template
 * expansion and misses critical context (e.g., [CADENCE MODE] tag).
 *
 * Commands NOT in this set can safely use the `agent` field for routing.
 */
export const TEMPLATE_COMMANDS = new Set([
	'agentuity-cadence',
	'agentuity-memory-save',
	'agentuity-memory-share',
	'agentuity-cloud',
	'agentuity-sandbox',
]);
