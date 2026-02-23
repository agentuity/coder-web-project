/**
 * OpenCode configuration generator.
 * Creates opencode.json content for sandboxes based on workspace settings.
 */

import { QA_AGENT_PROMPT } from './qa-agent-prompt';

export interface OpenCodeConfig {
  $schema: string;
  plugin: string[];
  default_agent?: string;
  instructions?: string[];
  agent?: Record<string, {
    mode?: string;
    model?: string;
    prompt?: string;
    description?: string;
    color?: string;
    maxSteps?: number;
    permission?: Record<string, string>;
    tools?: Record<string, boolean>;
  }>;
  mcp?: Record<string, {
    type: string;
    command?: string[];
    url?: string;
    enabled?: boolean;
    environment?: Record<string, string>;
    headers?: Record<string, string>;
    oauth?: Record<string, string>;
    timeout?: number;
    [key: string]: unknown;
  }>;
}

export interface OpenCodeConfigOptions {
	model?: string | null;
	defaultCommand?: string | null;
}

export interface SourceConfig {
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

/**
 * Generate an opencode.json configuration for a sandbox.
 */
export function generateOpenCodeConfig(
	options: OpenCodeConfigOptions = {},
	sources: SourceConfig[] = [],
): OpenCodeConfig {
	const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';
	const sessionModel = options.model || DEFAULT_MODEL;

	const config: OpenCodeConfig = {
		$schema: 'https://opencode.ai/config.json',
		plugin: ['@agentuity/opencode'],
		instructions: ['~/.config/opencode/ui-spec-instructions.md'],
		agent: {
			build: {
				mode: 'primary',
				...(sessionModel ? { model: sessionModel } : {}),
			},
			plan: {
				mode: 'primary',
				...(sessionModel ? { model: sessionModel } : {}),
				permission: { edit: 'deny', bash: 'ask' },
			},
			qa: {
				mode: 'subagent',
				description: 'QA testing agent — tests app.agentuity.com using Chrome DevTools',
				prompt: QA_AGENT_PROMPT,
				color: '#22c55e',
				permission: {
					edit: 'deny',
					bash: 'deny',
					webfetch: 'allow',
				},
			},
		},
	};

  // Map command to OpenCode agent name
  if (options.defaultCommand === '/agentuity-coder') {
    config.default_agent = 'Agentuity Coder Lead';
  } else if (options.defaultCommand === '/agentuity-cadence') {
    config.default_agent = 'Agentuity Coder Lead';
  }
  // '' (Chat) = no default_agent, uses OpenCode's built-in default

  // Always include Chrome DevTools MCP (Chromium is pre-installed via the opencode-chromium snapshot)
  config.mcp = {
    'chrome-devtools': {
      type: 'local',
      command: ['bunx', 'chrome-devtools-mcp@latest', '--headless', '--executablePath', '/usr/bin/chromium', '--chromeArg=--no-sandbox', '--chromeArg=--disable-dev-shm-usage'],
      enabled: true,
    },
  };

  // Add user-configured MCP sources — transform our DB format to OpenCode format.
  // OpenCode's MCP schema uses `additionalProperties: false`, so we must ONLY include
  // fields that are in the schema. Invalid fields will crash OpenCode on startup.
  //
  // McpLocalConfig: type, command, environment, enabled, timeout
  // McpRemoteConfig: type, url, headers, oauth, enabled, timeout
  const enabledSources = sources.filter(s => s.enabled);
  for (const source of enabledSources) {
    try {
      const cfg = source.config || {};

      if (source.type === 'stdio' || source.type === 'local') {
        // stdio/local → OpenCode local
        // Handle command as string (UI format) or string[] (OpenCode format)
        let command: string[];
        if (Array.isArray(cfg.command)) {
          command = cfg.command as string[];
        } else if (typeof cfg.command === 'string') {
          const args = (cfg.args as string[]) || [];
          command = [cfg.command, ...args];
        } else {
          continue; // Skip — no valid command
        }
        const entry: Record<string, unknown> = { type: 'local', command, enabled: true };
        const envVars = (cfg.environment && typeof cfg.environment === 'object') ? cfg.environment : (cfg.env && typeof cfg.env === 'object') ? cfg.env : null;
        if (envVars) entry.environment = envVars;
        if (typeof cfg.timeout === 'number') entry.timeout = cfg.timeout;
        config.mcp[source.name] = entry as any;

      } else if (source.type === 'sse' || source.type === 'remote') {
        // sse/remote → OpenCode remote
        const url = cfg.url as string;
        if (!url) continue; // Skip — no valid URL
        const entry: Record<string, unknown> = { type: 'remote', url, enabled: true };
        if (cfg.headers && typeof cfg.headers === 'object') entry.headers = cfg.headers;
        if (cfg.oauth !== undefined) entry.oauth = cfg.oauth;
        if (typeof cfg.timeout === 'number') entry.timeout = cfg.timeout;
        config.mcp[source.name] = entry as any;

      } else {
        // Unknown type — skip to avoid OpenCode config validation errors.
        // OpenCode has additionalProperties: false, so passing through unknown
        // fields would crash the server.
        continue;
      }
    } catch {
      // Skip sources with invalid config — better to lose one MCP than crash OpenCode
      continue;
    }
  }

  return config;
}

/**
 * Serialize config to JSON string for writing to sandbox.
 */
export function serializeOpenCodeConfig(config: OpenCodeConfig): string {
  return JSON.stringify(config, null, 2);
}
