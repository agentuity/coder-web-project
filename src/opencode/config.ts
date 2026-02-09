/**
 * OpenCode configuration generator.
 * Creates opencode.json content for sandboxes based on workspace settings.
 */

export interface OpenCodeConfig {
  $schema: string;
  plugin: string[];
  agent?: Record<string, {
    mode?: string;
    model?: string;
    permission?: Record<string, string>;
    tools?: Record<string, boolean>;
  }>;
  rules?: string[];
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
}

export interface SkillConfig {
  name: string;
  content: string;
  enabled: boolean;
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
	skills: SkillConfig[] = [],
	sources: SourceConfig[] = [],
): OpenCodeConfig {
	const sessionModel = options.model ?? undefined;

	const config: OpenCodeConfig = {
		$schema: 'https://opencode.ai/config.json',
		plugin: ['@agentuity/opencode'],
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
		},
	};

  // Add user-defined skills as OpenCode rules
  const enabledSkills = skills.filter(s => s.enabled);
  if (enabledSkills.length > 0) {
    config.rules = enabledSkills.map(s => s.content);
  }

  // Add MCP sources — transform our DB format to OpenCode format
  const enabledSources = sources.filter(s => s.enabled);
  if (enabledSources.length > 0) {
    config.mcp = {};
    for (const source of enabledSources) {
      if (source.type === 'stdio') {
        // Our stdio → OpenCode local
        const cmd = source.config.command as string;
        const args = (source.config.args as string[]) || [];
        config.mcp[source.name] = {
          type: 'local',
          command: [cmd, ...args],
          enabled: true,
        };
      } else if (source.type === 'sse') {
        // Our sse → OpenCode remote
        config.mcp[source.name] = {
          type: 'remote',
          url: source.config.url as string,
          enabled: true,
        };
      } else {
        // Unknown type — pass through as-is with enabled flag
        config.mcp[source.name] = {
          ...(source.config as Record<string, unknown>),
          type: source.type,
          enabled: true,
        };
      }
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
