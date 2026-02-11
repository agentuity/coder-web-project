/**
 * Sandbox lifecycle management for OpenCode servers.
 * Each chat session gets its own sandbox with an OpenCode server.
 */

const OPENCODE_PORT = 4096;
const OPENCODE_RUNTIME = 'opencode:latest';

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
): Promise<{ sandboxId: string; sandboxUrl: string }> {
  ctx.logger.info('Creating sandbox with OpenCode server...');

  // 1. Create the sandbox with org-level secrets for provider API keys.
  //    Uses Agentuity ${secret:KEY} interpolation to inject org secrets.
  const sandbox = await ctx.sandbox.create({
    runtime: OPENCODE_RUNTIME,
    network: { enabled: true, port: OPENCODE_PORT },
    resources: { memory: '2Gi', cpu: '2000m' },
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
  const repoName = config.repoUrl ? config.repoUrl.split('/').pop()?.replace('.git', '') || 'project' : 'project';
  const workDir = `/home/agentuity/${repoName}`;

  try {
    // 2. Write opencode.json to the global config location (~/.config/opencode/)
    //    so it doesn't appear as a new file in the cloned repo's git status.
    //    OpenCode reads global config from ~/.config/opencode/opencode.json.
    await sandbox.execute({
      command: [
        'bash', '-c',
        `mkdir -p ~/.config/opencode && cat > ~/.config/opencode/opencode.json << 'OPENCODEEOF'\n${config.opencodeConfigJson}\nOPENCODEEOF`,
      ],
    });

    try {
      await sandbox.execute({
        command: ['bash', '-c', 'gh auth setup-git'],
      });
    } catch (error) {
      ctx.logger.warn('gh auth setup-git failed', { error });
    }

    // 3. Clone repo if specified
    if (config.repoUrl) {
      await sandbox.execute({
        command: [
          'bash', '-c',
          `cd /home/agentuity && git clone ${config.repoUrl} ${repoName}`,
        ],
      });

      if (config.branch) {
        const sanitizedBranch = config.branch.trim().replace(/[^a-zA-Z0-9._\-/]/g, '-');
        if (sanitizedBranch) {
          await sandbox.execute({
            command: [
              'bash', '-c',
              `cd ${workDir} && git checkout -b '${sanitizedBranch}' || git checkout '${sanitizedBranch}'`,
            ],
          });
        }
      }
    } else {
      // Create a default project directory
      await sandbox.execute({
        command: ['bash', '-c', `mkdir -p ${workDir}`],
      });
    }

    // 3b. Install skills
    if (config.customSkills && config.customSkills.length > 0) {
      for (const skill of config.customSkills) {
        const slug = skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const skillDir = `${workDir}/.agents/skills/custom-${slug}`;
        const skillContent = skill.content.startsWith('---')
          ? skill.content
          : `---\nname: "${skill.name}"\n---\n\n${skill.content}`;
        await sandbox.execute({
          command: [
            'bash', '-c',
            `mkdir -p "${skillDir}" && cat > "${skillDir}/SKILL.md" << 'SKILLEOF'\n${skillContent}\nSKILLEOF`,
          ],
        });
      }
    }

    if (config.registrySkills && config.registrySkills.length > 0) {
      for (const skill of config.registrySkills) {
        try {
          await sandbox.execute({
            command: [
              'bash', '-c',
              `cd "${workDir}" && bunx skills add "${skill.repo}" --skill "${skill.skillName}" --agent opencode -y`,
            ],
          });
        } catch (err) {
          ctx.logger.warn(`Failed to install registry skill ${skill.repo}@${skill.skillName}`, { error: err });
        }
      }
    }

    // 4. Start OpenCode server

    await sandbox.execute({
      command: [
        'bash', '-c',
        `cd ${workDir} && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &`,
      ],
    });

    // 5. Wait for health check
    ctx.logger.info('Waiting for OpenCode server to be ready...');
    await sandbox.execute({
      command: [
        'bash', '-c',
        `for i in $(seq 1 30); do curl -sf http://localhost:${OPENCODE_PORT}/global/health > /dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
      ],
    });

    // 6. Get sandbox info for URL
    const sandboxInfo = await ctx.sandbox.get(sandboxId);
    const sandboxUrl = (sandboxInfo.url as string) || `http://localhost:${OPENCODE_PORT}`;

    ctx.logger.info(`OpenCode server ready at ${sandboxUrl}`);
    return { sandboxId, sandboxUrl };
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
    resources: { memory: '2Gi', cpu: '2000m' },
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

    // 5. Wait for health check
    ctx.logger.info('Waiting for OpenCode server to be ready in fork sandbox...');
    await sandbox.execute({
      command: [
        'bash', '-c',
        `for i in $(seq 1 30); do curl -sf http://localhost:${OPENCODE_PORT}/global/health > /dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
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

export { OPENCODE_PORT };
