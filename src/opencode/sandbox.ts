/**
 * Sandbox lifecycle management for OpenCode servers.
 * Each chat session gets its own sandbox with an OpenCode server.
 */
import { sandboxExecute } from '@agentuity/server';
import { JSON_RENDER_CORE_SKILL, JSON_RENDER_REACT_SKILL, UI_SPEC_INSTRUCTIONS } from './json-render-skills';

const OPENCODE_PORT = 4096;
const OPENCODE_RUNTIME = 'opencode:latest';

type ExecutionLike = {
	status?: string;
	exitCode?: number;
	stdoutStreamUrl?: string;
	stderrStreamUrl?: string;
};

async function readExecutionStreams(execution: ExecutionLike): Promise<{ stdout?: string; stderr?: string }> {
	const [stdout, stderr] = await Promise.all([
		execution.stdoutStreamUrl
			? fetch(execution.stdoutStreamUrl)
					.then((resp) => (resp.ok ? resp.text() : undefined))
					.catch(() => undefined)
			: Promise.resolve(undefined),
		execution.stderrStreamUrl
			? fetch(execution.stderrStreamUrl)
					.then((resp) => (resp.ok ? resp.text() : undefined))
					.catch(() => undefined)
			: Promise.resolve(undefined),
	]);

	return { stdout, stderr };
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
    /** Low-level API client for sandboxExecute with timeout support */
    client?: any;
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
): Promise<{ sandboxId: string; sandboxUrl: string; cloneError?: string }> {
  ctx.logger.info('Creating sandbox with OpenCode server...');

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
    // ── Batch 1: Pre-clone setup ──────────────────────────────────────────
    // Write opencode.json to global config + setup gh auth in a single execution.
    // OpenCode reads global config from ~/.config/opencode/opencode.json.
    // gh auth may fail if no token — that's fine (|| true).
    await sandbox.execute({
      command: [
        'bash', '-c',
        [
          `mkdir -p ~/.config/opencode/skills`,
          `cat > ~/.config/opencode/opencode.json << 'OPENCODEEOF'\n${config.opencodeConfigJson}\nOPENCODEEOF`,
          `gh auth setup-git 2>/dev/null || true`,
        ].join('\n'),
      ],
    });

    // ── Batch 2: Git clone (KEEP SEPARATE — needs sandboxExecute with timeout) ──
    let cloneError: string | undefined;
    let cloneSucceeded = false;

    if (config.repoUrl) {
      try {
        // Use sandboxExecute with timeout for reliable git clone.
        // sandbox.execute() returns immediately with status:"queued" — it does NOT
        // wait for the command to finish. sandboxExecute with a timeout parameter
        // waits for completion.
        const apiClient = ctx.sandbox.client;
        if (apiClient) {
          const cloneExecution = await sandboxExecute(apiClient, {
            sandboxId,
            options: {
              command: ['bash', '-c', `cd /home/agentuity && git clone ${config.repoUrl} ${repoName} 2>&1`],
              timeout: '2m',
            },
          });

          // sandboxExecute often returns status:"queued" with null exitCode even when
          // the command completed successfully and stdout/stderr are available.
          // If we have a real numeric exitCode, trust it. Otherwise check for streams.
          const cloneExitCode = typeof cloneExecution?.exitCode === 'number' ? cloneExecution.exitCode : null;
          const hasStreams = Boolean(cloneExecution?.stdoutStreamUrl || cloneExecution?.stderrStreamUrl);

          if (cloneExitCode !== null && cloneExitCode !== 0) {
            // Definite failure
            const { stdout, stderr } = await readExecutionStreams(cloneExecution ?? {});
            const errorDetail = stderr || stdout || `exit code ${cloneExitCode}`;
            cloneError = `Git clone failed for ${config.repoUrl}: ${errorDetail}`.slice(0, 500);
            ctx.logger.warn('Git clone failed', {
              repoUrl: config.repoUrl,
              status: cloneExecution?.status,
              exitCode: cloneExitCode,
              stdout,
              stderr,
            });
          } else if (cloneExecution?.status === 'completed' || (hasStreams && cloneExitCode === null)) {
            // Success or likely success (has streams, no error exit code)
            cloneSucceeded = true;
          } else if (cloneExecution?.status === 'failed' || cloneExecution?.status === 'timeout') {
            const { stdout, stderr } = await readExecutionStreams(cloneExecution ?? {});
            cloneError = `Git clone ${cloneExecution.status} for ${config.repoUrl}: ${stderr || stdout || 'unknown error'}`.slice(0, 500);
            ctx.logger.warn('Git clone failed', {
              repoUrl: config.repoUrl,
              status: cloneExecution.status,
              stdout,
              stderr,
            });
          } else {
            // Ambiguous (queued/running but no exit code or streams) — check if dir exists
            ctx.logger.info('Git clone returned ambiguous status, checking directory', {
              repoUrl: config.repoUrl,
              status: cloneExecution?.status,
            });
            // Give it a moment to settle, then check
            await new Promise((r) => setTimeout(r, 3000));
            const dirCheck = await sandbox.execute({
              command: ['bash', '-c', `test -d ${workDir}/.git && echo "ok"`],
            });
            const checkOutput = dirCheck?.stdoutStreamUrl
              ? await fetch(dirCheck.stdoutStreamUrl).then((r) => r.text()).catch(() => '')
              : '';
            if (checkOutput.includes('ok')) {
              cloneSucceeded = true;
            } else {
              cloneError = `Git clone may have failed for ${config.repoUrl}: command returned status ${cloneExecution?.status}`.slice(0, 500);
              ctx.logger.warn('Git clone directory check failed after ambiguous status', {
                repoUrl: config.repoUrl,
                status: cloneExecution?.status,
              });
            }
          }
        } else {
          // Fallback: no apiClient available, use sandbox.execute() (may return queued)
          ctx.logger.warn('No apiClient available for sandboxExecute, using sandbox.execute() fallback');
          const cloneExecution: ExecutionLike | null = await sandbox.execute({
            command: ['bash', '-c', `cd /home/agentuity && git clone ${config.repoUrl} ${repoName} 2>&1`],
          });
          // Since sandbox.execute() may return immediately, wait and check
          await new Promise((r) => setTimeout(r, 15000));
          const dirCheck = await sandbox.execute({
            command: ['bash', '-c', `test -d ${workDir}/.git && echo "ok"`],
          });
          const checkOutput = dirCheck?.stdoutStreamUrl
            ? await fetch(dirCheck.stdoutStreamUrl).then((r) => r.text()).catch(() => '')
            : '';
          if (checkOutput.includes('ok')) {
            cloneSucceeded = true;
          } else {
            const { stdout, stderr } = await readExecutionStreams(cloneExecution ?? {});
            cloneError = `Git clone failed for ${config.repoUrl}: ${stderr || stdout || 'unknown error'}`.slice(0, 500);
            ctx.logger.warn('Git clone failed (fallback path)', {
              repoUrl: config.repoUrl,
              stdout,
              stderr,
            });
          }
        }
      } catch (error) {
        cloneError = `Git clone error for ${config.repoUrl}: ${String(error)}`.slice(0, 500);
        ctx.logger.warn('Git clone execution error', { repoUrl: config.repoUrl, error: String(error) });
      }

      if (!cloneSucceeded) {
        // Clone failed — create workdir with marker (in batch 3 script)
        ctx.logger.warn('Git clone did not succeed, workdir will be created in post-clone setup', {
          repoUrl: config.repoUrl,
        });
      } else {
        ctx.logger.info('Git clone succeeded', { repoUrl: config.repoUrl, workDir });
      }
    }

    // ── Batch 3: Post-clone setup ─────────────────────────────────────────
    // Combine workdir setup, branch checkout, all skill installations, and
    // ui-spec instructions into a single bash script execution.
    ctx.logger.info('Running post-clone setup (skills, branch checkout, ui-spec)...');
    const postCloneScriptParts: string[] = [];

    // 3a. Ensure workdir exists + handle clone failure markers
    if (config.repoUrl && !cloneSucceeded) {
      postCloneScriptParts.push(`mkdir -p ${workDir}`);
      postCloneScriptParts.push(`touch ${workDir}/.opencode-clone-failed`);
    } else if (!config.repoUrl) {
      postCloneScriptParts.push(`mkdir -p ${workDir}`);
    }
    // Always ensure workdir exists as a safety net
    postCloneScriptParts.push(`mkdir -p ${workDir}`);

    // 3b. Branch checkout (only if repo was cloned and branch specified)
    if (config.repoUrl && config.branch) {
      const sanitizedBranch = config.branch.trim().replace(/[^a-zA-Z0-9._\-/]/g, '-');
      if (sanitizedBranch) {
        if (cloneSucceeded) {
          // Checkout branch — try creating new branch first, fall back to existing
          postCloneScriptParts.push(
            `cd ${workDir} && (git checkout -b '${sanitizedBranch}' || git checkout '${sanitizedBranch}') 2>/dev/null || true`,
          );
        } else {
          postCloneScriptParts.push(`# Skipping branch checkout — git repo is missing`);
          ctx.logger.warn('Skipping branch checkout because git repo is missing', {
            workDir,
            branch: config.branch,
          });
        }
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
        postCloneScriptParts.push(
          `mkdir -p "${skillDir}" && cat > "${skillDir}/SKILL.md" << 'SKILLEOF_${i}'\n${skillContent}\nSKILLEOF_${i}`,
        );
      }
    }

    // 3d. Registry skills — install via bunx (may fail, use || true)
    if (config.registrySkills && config.registrySkills.length > 0) {
      for (const skill of config.registrySkills) {
        postCloneScriptParts.push(
          `cd /tmp && bunx skills add "${skill.repo}" --skill "${skill.skillName}" --agent opencode -y 2>/dev/null && cp -r /tmp/.agents/skills/* ~/.config/opencode/skills/ 2>/dev/null || true`,
        );
      }
    }

    // 3e. json-render skills — write skill files with unique heredoc delimiters
    const jsonRenderSkills = getJsonRenderSkills();
    for (const [i, jrSkill] of jsonRenderSkills.entries()) {
      const skillDir = `~/.config/opencode/skills/${jrSkill.slug}`;
      postCloneScriptParts.push(
        `mkdir -p "${skillDir}" && cat > "${skillDir}/SKILL.md" << 'JREOF_${i}'\n${jrSkill.content}\nJREOF_${i}`,
      );
    }

    // 3f. ui-spec instructions
    postCloneScriptParts.push(
      `cat > ~/.config/opencode/ui-spec-instructions.md << 'UISPECEOF'\n${getUISpecInstructions()}\nUISPECEOF`,
    );

    // Execute post-clone setup AND server start in parallel.
    // Skills are read from disk at query time, not at boot, so the server
    // can start while skills are still being written.
    ctx.logger.info('Starting OpenCode server + installing skills in parallel...');
    sandbox.execute({
      command: [
        'bash', '-c',
        postCloneScriptParts.join('\n'),
      ],
    });

    // ── Batch 4: Start server + health check (runs in parallel with skills) ──
    await sandbox.execute({
      command: [
        'bash', '-c',
        [
          `cd ${workDir} && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
          `for i in $(seq 1 45); do`,
          `  if curl -sf http://localhost:${OPENCODE_PORT}/global/health > /dev/null 2>&1; then`,
          `    if curl -sf http://localhost:${OPENCODE_PORT}/session > /dev/null 2>&1; then`,
          `      exit 0`,
          `    fi`,
          `  fi`,
          `  sleep 1`,
          `done`,
          `exit 1`,
        ].join('\n'),
      ],
    });

    // 7. Get sandbox info for URL
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;

    ctx.logger.info(`OpenCode server ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl, ...(cloneError ? { cloneError } : {}) };
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
): Promise<{ sandboxId: string; sandboxUrl: string; snapshotId: string }> {
  ctx.logger.info(`Forking sandbox ${config.sourceSandboxId}...`);

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
      ...(config.githubToken
        ? { GH_TOKEN: config.githubToken, GITHUB_TOKEN: config.githubToken }
        : {}),
      ...(config.env || {}),
    },
  });

  const sandboxId = sandbox.id as string;
  ctx.logger.info(`Fork sandbox created: ${sandboxId}`);

  try {
    // 3. Setup GitHub auth if token available
    if (config.githubToken) {
      try {
        await sandbox.execute({
          command: ['bash', '-c', 'gh auth setup-git'],
        });
      } catch (error) {
        ctx.logger.warn('gh auth setup-git failed in fork sandbox', { error });
      }
    }

    // 4. Start OpenCode server (filesystem already has everything from snapshot)
    await sandbox.execute({
      command: [
        'bash', '-c',
        `cd ${config.workDir} && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
      ],
    });

    // 5. Wait for health check — verify both /global/health AND /session API
    ctx.logger.info('Waiting for OpenCode server to be ready in fork sandbox...');
    await sandbox.execute({
      command: [
        'bash', '-c',
        `for i in $(seq 1 45); do if curl -sf http://localhost:${OPENCODE_PORT}/global/health > /dev/null 2>&1; then if curl -sf http://localhost:${OPENCODE_PORT}/session > /dev/null 2>&1; then exit 0; fi; fi; sleep 1; done; exit 1`,
      ],
    });

    // 6. Get sandbox info for URL
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;

    ctx.logger.info(`Fork sandbox ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl, snapshotId };
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
): Promise<{ sandboxId: string; sandboxUrl: string }> {
  ctx.logger.info(`Creating sandbox from snapshot ${config.snapshotId}...`);

  // 1. Create sandbox from snapshot
  const sandbox = await ctx.sandbox.create({
    snapshot: config.snapshotId,
    network: { enabled: true, port: OPENCODE_PORT },
    resources: { memory: '4Gi', cpu: '4000m' },
    timeout: { idle: '2h' },
    env: {
      ANTHROPIC_API_KEY: '${secret:ANTHROPIC_API_KEY}',
      OPENAI_API_KEY: '${secret:OPENAI_API_KEY}',
      ...(config.githubToken
        ? { GH_TOKEN: config.githubToken, GITHUB_TOKEN: config.githubToken }
        : {}),
      ...(config.env || {}),
    },
  });

  const sandboxId = sandbox.id as string;
  ctx.logger.info(`Snapshot sandbox created: ${sandboxId}`);

  try {
    // 2. Write updated opencode config + setup gh auth
    await sandbox.execute({
      command: [
        'bash', '-c',
        [
          `mkdir -p ~/.config/opencode/skills`,
          `cat > ~/.config/opencode/opencode.json << 'OPENCODEEOF'\n${config.opencodeConfigJson}\nOPENCODEEOF`,
          `gh auth setup-git 2>/dev/null || true`,
        ].join('\n'),
      ],
    });

    // 3. Start OpenCode server (filesystem already has everything from snapshot)
    await sandbox.execute({
      command: [
        'bash', '-c',
        `cd ${config.workDir} && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
      ],
    });

    // 4. Wait for health check
    ctx.logger.info('Waiting for OpenCode server to be ready in snapshot sandbox...');
    await sandbox.execute({
      command: [
        'bash', '-c',
        `for i in $(seq 1 45); do if curl -sf http://localhost:${OPENCODE_PORT}/global/health > /dev/null 2>&1; then if curl -sf http://localhost:${OPENCODE_PORT}/session > /dev/null 2>&1; then exit 0; fi; fi; sleep 1; done; exit 1`,
      ],
    });

    // 5. Get sandbox info for URL
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;

    ctx.logger.info(`Snapshot sandbox ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl };
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
