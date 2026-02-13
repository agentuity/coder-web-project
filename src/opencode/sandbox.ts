/**
 * Sandbox lifecycle management for OpenCode servers.
 * Each chat session gets its own sandbox with an OpenCode server.
 */
import { JSON_RENDER_CORE_SKILL, JSON_RENDER_REACT_SKILL, UI_SPEC_INSTRUCTIONS } from './json-render-skills';
import { randomBytes } from 'node:crypto';

const OPENCODE_PORT = 4096;
const OPENCODE_RUNTIME = 'opencode:latest';
const OPENCODE_USERNAME = 'opencode';

/** Generate a short random password for OpenCode server auth. */
function generatePassword(): string {
  return randomBytes(8).toString('hex'); // 16 chars
}

/** Build Basic Auth header value for OpenCode server. */
export function buildBasicAuthHeader(password: string): string {
  return `Basic ${Buffer.from(`${OPENCODE_USERNAME}:${password}`).toString('base64')}`;
}

export interface SandboxConfig {
  repoUrl?: string;
  branch?: string;
  opencodeConfigJson: string;
  env?: Record<string, string>;
  customSkills?: Array<{ name: string; content: string }>;
  registrySkills?: Array<{ repo: string; skillName: string }>;
  githubToken?: string;
}

export interface SandboxContext {
  sandbox: {
    create: (opts: any) => Promise<any>;
    get: (id: string) => Promise<any>;
    destroy: (id: string) => Promise<void>;
    snapshot: {
      create: (sandboxId: string, opts?: { name?: string; description?: string; tag?: string }) => Promise<{ snapshotId: string }>;
      delete: (snapshotId: string) => Promise<void>;
    };
  };
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

/**
 * Create a new sandbox with OpenCode server.
 * Returns sandbox ID and URL once the server is healthy.
 */
export async function createSandbox(
  ctx: SandboxContext,
  config: SandboxConfig,
): Promise<{ sandboxId: string; sandboxUrl: string; password: string; cloneError?: string }> {
  ctx.logger.info('Creating sandbox with OpenCode server...');

  const password = generatePassword();

  // 1. Create the sandbox with org-level secrets for provider API keys.
  //    Uses Agentuity ${secret:KEY} interpolation to inject org secrets.
  const sandbox = await ctx.sandbox.create({
    runtime: OPENCODE_RUNTIME,
    network: { enabled: true, port: OPENCODE_PORT },
    resources: { memory: '4Gi', cpu: '4000m' },
    timeout: { idle: '2h' },
    env: {
      ANTHROPIC_API_KEY: '${secret:ANTHROPIC_API_KEY}',
      OPENAI_API_KEY: '${secret:OPENAI_API_KEY}',
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_SERVER_USERNAME: OPENCODE_USERNAME,
      ...(config.githubToken
        ? { GH_TOKEN: config.githubToken, GITHUB_TOKEN: config.githubToken }
        : {}),
      ...(config.env || {}),
    },
    dependencies: ['git', 'gh'],
  });

  const sandboxId = sandbox.id as string;
  ctx.logger.info(`Sandbox created: ${sandboxId}`);

  // Note: ANTHROPIC_API_KEY and OPENAI_API_KEY are injected via ${secret:...} interpolation.
  // If org secrets are not configured, the sandbox will start but API calls will fail.
  // There's no way to validate the interpolated values here — if the OpenCode session fails
  // to connect or returns auth errors, check that org secrets are set via:
  //   agentuity cloud env set ANTHROPIC_API_KEY <key>
  //   agentuity cloud env set OPENAI_API_KEY <key>
  ctx.logger.info('Sandbox env uses org secrets for ANTHROPIC_API_KEY and OPENAI_API_KEY. Ensure these are configured via "agentuity cloud env set" if not already.');
  const repoName = config.repoUrl ? config.repoUrl.split('/').pop()?.replace('.git', '') || 'project' : 'project';
  const workDir = `/home/agentuity/${repoName}`;

  try {
    // ── SINGLE sandbox.execute() call for ALL setup ──────────────────────
    // CRITICAL: Multiple back-to-back sandbox.execute() calls are unreliable —
    // the Agentuity platform may silently drop subsequent commands when fired
    // rapidly. We combine EVERYTHING into a single bash script:
    //   1. Write opencode config + gh auth
    //   2. Git clone (if repo specified)
    //   3. Branch checkout, skills, ui-spec instructions
    //   4. Start OpenCode server
    //
    // Clone errors are detected later via external polling (we check if the
    // workdir has a .git directory). This is simpler and more reliable than
    // trying to check clone status via multiple sandbox.execute() calls.
    ctx.logger.info('Building combined setup script...');
    const setupScriptParts: string[] = [];
    let cloneError: string | undefined;

    // 1. Write opencode.json + gh auth
    setupScriptParts.push(`mkdir -p ~/.config/opencode/skills`);
    setupScriptParts.push(
      `cat > ~/.config/opencode/opencode.json << 'OPENCODEEOF'\n${config.opencodeConfigJson}\nOPENCODEEOF`,
    );
    setupScriptParts.push(`gh auth setup-git 2>/dev/null || true`);

    // 2. Git clone (synchronous within the script — runs to completion before next step)
    if (config.repoUrl) {
      setupScriptParts.push(`cd /home/agentuity && git clone ${config.repoUrl} ${repoName} 2>&1 || true`);
    }

    // 3a. Ensure workdir exists (safety net — covers no-repo and clone-failure cases)
    setupScriptParts.push(`mkdir -p ${workDir}`);

    // 3b. Branch checkout (only if repo specified and branch given)
    if (config.repoUrl && config.branch) {
      const sanitizedBranch = config.branch.trim().replace(/[^a-zA-Z0-9._\-/]/g, '-');
      if (sanitizedBranch) {
        setupScriptParts.push(
          `cd '${workDir}' && (git checkout -b '${sanitizedBranch}' || git checkout '${sanitizedBranch}') 2>/dev/null || true`,
        );
      }
    }

    // 3c. Custom skills — write each SKILL.md via heredoc with unique delimiter
    if (config.customSkills && config.customSkills.length > 0) {
      for (const [i, skill] of config.customSkills.entries()) {
        const slug = skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const skillDir = `~/.config/opencode/skills/custom-${slug}`;
        const skillContent = skill.content.startsWith('---')
          ? skill.content
          : `---\nname: "${skill.name}"\n---\n\n${skill.content}`;
        setupScriptParts.push(
          `mkdir -p "${skillDir}" && cat > "${skillDir}/SKILL.md" << 'SKILLEOF_${i}'\n${skillContent}\nSKILLEOF_${i}`,
        );
      }
    }

    // 3d. Registry skills — install via bunx (may fail, use || true)
    if (config.registrySkills && config.registrySkills.length > 0) {
      for (const skill of config.registrySkills) {
        setupScriptParts.push(
          `cd /tmp && bunx skills add "${skill.repo}" --skill "${skill.skillName}" --agent opencode -y 2>/dev/null && cp -r /tmp/.agents/skills/* ~/.config/opencode/skills/ 2>/dev/null || true`,
        );
      }
    }

    // 3e. json-render skills — write skill files with unique heredoc delimiters
    const jsonRenderSkills = getJsonRenderSkills();
    for (const [i, jrSkill] of jsonRenderSkills.entries()) {
      const skillDir = `~/.config/opencode/skills/${jrSkill.slug}`;
      setupScriptParts.push(
        `mkdir -p "${skillDir}" && cat > "${skillDir}/SKILL.md" << 'JREOF_${i}'\n${jrSkill.content}\nJREOF_${i}`,
      );
    }

    // 3f. ui-spec instructions
    setupScriptParts.push(
      `cat > ~/.config/opencode/ui-spec-instructions.md << 'UISPECEOF'\n${getUISpecInstructions()}\nUISPECEOF`,
    );

    // 4. Start OpenCode server (nohup — runs in background, script continues)
    setupScriptParts.push(
      `cd '${workDir}' && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
    );

    // Fire the single combined script
    ctx.logger.info('Executing combined setup script (config + clone + skills + server start)...');
    sandbox.execute({
      command: [
        'bash', '-c',
        setupScriptParts.join('\n'),
      ],
    });

    // Get the sandbox's public URL for external health polling.
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;

    // Poll the sandbox's public URL until the OpenCode server is ready.
    // This is the ONLY reliable approach — sandbox.execute() returns immediately.
    const authHeader = buildBasicAuthHeader(password);
    ctx.logger.info(`Polling OpenCode server health at ${sandboxUrl}...`);
    let serverReady = false;
    for (let i = 0; i < 90; i++) {
      try {
        const resp = await fetch(`${sandboxUrl}/global/health`, {
          signal: AbortSignal.timeout(3000),
          headers: { Authorization: authHeader },
        });
        if (resp.ok) {
          // Also verify the session API is responsive
          const sessionResp = await fetch(`${sandboxUrl}/session`, {
            signal: AbortSignal.timeout(3000),
            headers: { Authorization: authHeader },
          });
          if (sessionResp.ok) {
            ctx.logger.info(`OpenCode server ready after ${i + 1}s`);
            serverReady = true;
            break;
          }
        }
      } catch {
        // Not ready yet — server still starting
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!serverReady) {
      ctx.logger.warn('OpenCode server did not become ready within 90s');
    }

    ctx.logger.info(`OpenCode server ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl, password, ...(cloneError ? { cloneError } : {}) };
  } catch (error) {
    ctx.logger.error('Failed to setup sandbox, destroying...', { error });
    try {
      await ctx.sandbox.destroy(sandboxId);
    } catch {
      // Ignore destroy errors
    }
    throw error;
  }
}

export interface ForkSandboxConfig {
  /** Sandbox ID of the source session to snapshot */
  sourceSandboxId: string;
  /** Environment variables (API keys, GitHub token, etc.) */
  env?: Record<string, string>;
  /** GitHub token for git operations */
  githubToken?: string;
  /** Working directory inside the sandbox (e.g. /home/agentuity/myrepo) */
  workDir: string;
}

/**
 * Fork a sandbox by snapshotting and creating a new one from that snapshot.
 * The new sandbox inherits the full filesystem state (code, git, OpenCode data, deps).
 * After boot, the caller should use the OpenCode fork API to create a new session.
 */
export async function forkSandbox(
  ctx: SandboxContext,
  config: ForkSandboxConfig,
): Promise<{ sandboxId: string; sandboxUrl: string; password: string; snapshotId: string }> {
  ctx.logger.info(`Forking sandbox ${config.sourceSandboxId}...`);
  const password = generatePassword();

  // 1. Snapshot the source sandbox
  ctx.logger.info('Creating snapshot of source sandbox...');
  const snapshot = await ctx.sandbox.snapshot.create(config.sourceSandboxId, {
    name: `fork-${Date.now()}`,
    description: `Fork snapshot from sandbox ${config.sourceSandboxId}`,
  });
  const snapshotId = snapshot.snapshotId;
  ctx.logger.info(`Snapshot created: ${snapshotId}`);

  // 2. Create new sandbox from the snapshot
  ctx.logger.info('Creating new sandbox from snapshot...');
  const sandbox = await ctx.sandbox.create({
    snapshot: snapshotId,
    network: { enabled: true, port: OPENCODE_PORT },
    resources: { memory: '4Gi', cpu: '4000m' },
    timeout: { idle: '2h' },
    env: {
      ANTHROPIC_API_KEY: '${secret:ANTHROPIC_API_KEY}',
      OPENAI_API_KEY: '${secret:OPENAI_API_KEY}',
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_SERVER_USERNAME: OPENCODE_USERNAME,
      ...(config.githubToken
        ? { GH_TOKEN: config.githubToken, GITHUB_TOKEN: config.githubToken }
        : {}),
      ...(config.env || {}),
    },
  });

  const sandboxId = sandbox.id as string;
  ctx.logger.info(`Fork sandbox created: ${sandboxId}`);

  try {
    // 3. Setup GitHub auth + start server in ONE sandbox.execute() call.
    // CRITICAL: Multiple back-to-back sandbox.execute() calls are unreliable —
    // the platform may silently drop subsequent commands. Combine into single script.
    const forkSetupParts: string[] = [];
    if (config.githubToken) {
      forkSetupParts.push('gh auth setup-git 2>/dev/null || true');
    }
    forkSetupParts.push(
      `cd ${config.workDir} && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
    );
    sandbox.execute({
      command: ['bash', '-c', forkSetupParts.join('\n')],
    });

    // 5. Poll the sandbox's public URL until the OpenCode server is ready.
    const authHeader = buildBasicAuthHeader(password);
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;
    ctx.logger.info(`Polling fork sandbox health at ${sandboxUrl}...`);
    for (let i = 0; i < 90; i++) {
      try {
        const resp = await fetch(`${sandboxUrl}/global/health`, {
          signal: AbortSignal.timeout(3000),
          headers: { Authorization: authHeader },
        });
        if (resp.ok) {
          const sessionResp = await fetch(`${sandboxUrl}/session`, {
            signal: AbortSignal.timeout(3000),
            headers: { Authorization: authHeader },
          });
          if (sessionResp.ok) {
            ctx.logger.info(`Fork sandbox health check passed after ${i + 1}s`);
            break;
          }
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    ctx.logger.info(`Fork sandbox ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl, password, snapshotId };
  } catch (error) {
    ctx.logger.error('Failed to setup fork sandbox, destroying...', { error });
    try {
      await ctx.sandbox.destroy(sandboxId);
    } catch {
      // Ignore destroy errors
    }
    // Also clean up the snapshot on failure
    try {
      await ctx.sandbox.snapshot.delete(snapshotId);
    } catch {
      // Ignore snapshot cleanup errors
    }
    throw error;
  }
}

export interface SnapshotSandboxConfig {
  /** Agentuity snapshot ID to create the sandbox from */
  snapshotId: string;
  /** Working directory inside the sandbox */
  workDir: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** GitHub token for git operations */
  githubToken?: string;
  /** OpenCode config JSON to write (may have changed since snapshot) */
  opencodeConfigJson: string;
}

/**
 * Create a new sandbox from a saved snapshot.
 * Similar to forkSandbox but uses an existing (persistent) snapshot ID
 * rather than creating a new ephemeral snapshot.
 */
export async function createSandboxFromSnapshot(
  ctx: SandboxContext,
  config: SnapshotSandboxConfig,
): Promise<{ sandboxId: string; sandboxUrl: string; password: string }> {
  ctx.logger.info(`Creating sandbox from snapshot ${config.snapshotId}...`);

  const password = generatePassword();

  // 1. Create sandbox from snapshot
  const sandbox = await ctx.sandbox.create({
    snapshot: config.snapshotId,
    network: { enabled: true, port: OPENCODE_PORT },
    resources: { memory: '4Gi', cpu: '4000m' },
    timeout: { idle: '2h' },
    env: {
      ANTHROPIC_API_KEY: '${secret:ANTHROPIC_API_KEY}',
      OPENAI_API_KEY: '${secret:OPENAI_API_KEY}',
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_SERVER_USERNAME: OPENCODE_USERNAME,
      ...(config.githubToken
        ? { GH_TOKEN: config.githubToken, GITHUB_TOKEN: config.githubToken }
        : {}),
      ...(config.env || {}),
    },
  });

  const sandboxId = sandbox.id as string;
  ctx.logger.info(`Snapshot sandbox created: ${sandboxId}`);

  try {
    // 2. Write updated opencode config + setup gh auth + start server in ONE call.
    // CRITICAL: Multiple back-to-back sandbox.execute() calls are unreliable —
    // the platform may silently drop subsequent commands. Combine into single script.
    sandbox.execute({
      command: [
        'bash', '-c',
        [
          `mkdir -p ~/.config/opencode/skills`,
          `cat > ~/.config/opencode/opencode.json << 'OPENCODEEOF'\n${config.opencodeConfigJson}\nOPENCODEEOF`,
          `gh auth setup-git 2>/dev/null || true`,
          `cd ${config.workDir} && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
        ].join('\n'),
      ],
    });

    // 4. Get sandbox URL and poll until the OpenCode server is ready.
    const authHeader = buildBasicAuthHeader(password);
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;
    ctx.logger.info(`Polling snapshot sandbox health at ${sandboxUrl}...`);
    for (let i = 0; i < 90; i++) {
      try {
        const resp = await fetch(`${sandboxUrl}/global/health`, {
          signal: AbortSignal.timeout(3000),
          headers: { Authorization: authHeader },
        });
        if (resp.ok) {
          const sessionResp = await fetch(`${sandboxUrl}/session`, {
            signal: AbortSignal.timeout(3000),
            headers: { Authorization: authHeader },
          });
          if (sessionResp.ok) {
            ctx.logger.info(`Snapshot sandbox health check passed after ${i + 1}s`);
            break;
          }
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    ctx.logger.info(`Snapshot sandbox ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl, password };
  } catch (error) {
    ctx.logger.error('Failed to setup snapshot sandbox, destroying...', { error });
    try {
      await ctx.sandbox.destroy(sandboxId);
    } catch {
      // Ignore destroy errors
    }
    throw error;
  }
}

/**
 * Destroy a sandbox and clean up.
 */
export async function destroySandbox(
  ctx: SandboxContext,
  sandboxId: string,
): Promise<void> {
  ctx.logger.info(`Destroying sandbox: ${sandboxId}`);
  try {
    await ctx.sandbox.destroy(sandboxId);
  } catch (error) {
    ctx.logger.warn('Failed to destroy sandbox', { sandboxId, error });
  }
}

/**
 * Check if a sandbox's OpenCode server is healthy.
 */
export async function checkSandboxHealth(
  ctx: SandboxContext,
  sandboxId: string,
): Promise<boolean> {
  try {
    const sandbox = await ctx.sandbox.get(sandboxId);
    if (!sandbox) return false;
    // Try a health check via the sandbox
    await sandbox.execute({
      command: ['bash', '-c', `curl -sf http://localhost:${OPENCODE_PORT}/global/health > /dev/null 2>&1`],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the json-render skill files to install in sandboxes.
 * These are embedded at build time from the skill markdown files.
 */
function getJsonRenderSkills(): Array<{ slug: string; content: string }> {
  return [
    {
      slug: 'json-render-core',
      content: JSON_RENDER_CORE_SKILL,
    },
    {
      slug: 'json-render-react',
      content: JSON_RENDER_REACT_SKILL,
    },
  ];
}

/**
 * Instructions for the agent on how to output ui_spec code fences.
 */
function getUISpecInstructions(): string {
  return UI_SPEC_INSTRUCTIONS;
}

export { OPENCODE_PORT };
