/**
 * GitHub integration routes — git status, branch, commit, PR, and diff.
 *
 * All commands run in the session's sandbox via `sandboxExecute`.
 * Working directory: /home/agentuity/project
 */
import { createRouter } from "@agentuity/runtime";
import { db } from "../db";
import { chatSessions } from "../db/schema";
import { and, eq } from "@agentuity/drizzle";
import { sandboxExecute } from "@agentuity/server";
import { parseMetadata } from "../lib/parse-metadata";
import { SpanStatusCode } from "@opentelemetry/api";

const api = createRouter();

const SANDBOX_HOME = "/home/agentuity";
const PROJECT_DIR = "/home/agentuity/project";

type GitLogEntry = {
  hash: string;
  parents: string[];
  branch: string;
  message: string;
  committerDate: string;
  author?: {
    name: string;
    email: string;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute a shell command in the session sandbox and return stdout/stderr. */
async function execInSandbox(
  apiClient: any,
  sandboxId: string,
  command: string,
  workDir: string = PROJECT_DIR,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Use GIT_CEILING_DIRECTORIES to prevent git from walking up to parent dirs
  const execution = await sandboxExecute(apiClient, {
    sandboxId,
    options: {
      command: [
        "bash",
        "-c",
        `cd '${workDir}' && GIT_CEILING_DIRECTORIES='${SANDBOX_HOME}' ${command}`,
      ],
      timeout: "30s",
    },
  });

  let stdout = "";
  let stderr = "";

  if (execution.stdoutStreamUrl) {
    const res = await fetch(execution.stdoutStreamUrl);
    stdout = await res.text();
  }
  if (execution.stderrStreamUrl) {
    const res = await fetch(execution.stderrStreamUrl);
    stderr = await res.text();
  }

  // sandboxExecute often returns status:"queued" with null exitCode even when
  // the command completed successfully and stdout/stderr are available.
  // If we have a real numeric exitCode, trust it. Otherwise, assume success (0)
  // since the sandbox did execute and return streams.
  const exitCode =
    typeof execution.exitCode === "number" ? execution.exitCode : 0;

  return { stdout, stderr, exitCode };
}

/** Ensure a sandbox file path is absolute (rooted at /home/agentuity). */
function toAbsoluteSandboxPath(p: string): string {
  if (p.startsWith(SANDBOX_HOME)) {
    // Even if it starts with SANDBOX_HOME, normalize to prevent /home/agentuity/../../../etc/passwd
    const normalized = new URL(p, "file:///").pathname;
    if (!normalized.startsWith(SANDBOX_HOME)) {
      throw new Error("Path traversal detected");
    }
    return normalized;
  }
  const rel = p.startsWith("/") ? p.slice(1) : p;
  const joined = `${SANDBOX_HOME}/${rel}`;
  // Use URL to normalize the path (resolves .., ., double slashes)
  const normalized = new URL(joined, "file:///").pathname;
  if (!normalized.startsWith(SANDBOX_HOME)) {
    throw new Error("Path traversal detected");
  }
  return normalized;
}

function toRepoRelativePath(rawPath: string, projectDir: string) {
  const absolute = toAbsoluteSandboxPath(rawPath);
  if (absolute === projectDir) return "";
  if (absolute.startsWith(`${projectDir}/`)) {
    return absolute.slice(projectDir.length + 1);
  }
  return rawPath.replace(/^\/+/, "");
}

function getProjectDir(session: typeof chatSessions.$inferSelect) {
  const metadata = parseMetadata(session);
  const repoUrl =
    typeof metadata.repoUrl === "string" ? metadata.repoUrl : undefined;
  if (!repoUrl) return PROJECT_DIR;
  const repoName = repoUrl.split("/").pop()?.replace(".git", "");
  if (!repoName) return PROJECT_DIR;
  // Sanitize: only allow alphanumeric, hyphens, underscores, dots
  const safeName = repoName.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safeName) return PROJECT_DIR;
  return `/home/agentuity/${safeName}`;
}

function normalizeGitFile(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const renameMatch = trimmed.match(/->\s*(.+)$/);
  if (renameMatch?.[1]) return renameMatch[1].trim();
  return trimmed.replace(/^[ MADRCU?!]{1,2}\s+/, "");
}

function parseGitBranch(refs: string): string {
  const entries = refs
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);
  const headRef = entries.find((ref) => ref.startsWith("HEAD -> "));
  if (headRef) return headRef.replace("HEAD -> ", "").trim();
  const branchRef = entries.find(
    (ref) =>
      !ref.startsWith("tag: ") &&
      !ref.startsWith("origin/") &&
      !ref.startsWith("refs/"),
  );
  return branchRef ? branchRef.trim() : "";
}

/** Look up a session and validate it has a sandbox. */
async function getSession(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.createdBy, userId)),
    );

  if (!session) return { error: "Session not found", status: 404 as const };
  if (!session.sandboxId) return { error: "No sandbox", status: 503 as const };

  return { session };
}

// ---------------------------------------------------------------------------
// GET /:id/github/status — git branch, dirty state, changed files, remotes
// ---------------------------------------------------------------------------
api.get("/:id/github/status", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-status";
  c.var.session.metadata.sessionDbId = session.id;

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);

    const checkResult = await execInSandbox(
      apiClient,
      session.sandboxId!,
      'test -d .git && echo "YES" || echo "NO"',
      projectDir,
    );
    const hasRepo = checkResult.stdout.trim() === "YES";
    if (!hasRepo) {
      return c.json({
        hasRepo: false,
        branch: null,
        isDirty: false,
        changedFiles: [],
        remotes: [],
        message: "No git repository found. Initialize one or clone a repo.",
      });
    }

    // Run git commands separated by markers
    const { stdout, stderr, exitCode } = await execInSandbox(
      apiClient,
      session.sandboxId!,
      'git status --porcelain -uall 2>/dev/null; echo "---SEPARATOR---"; git branch --show-current 2>/dev/null; echo "---SEPARATOR---"; git remote -v 2>/dev/null',
      projectDir,
    );

    if (exitCode !== 0 && !stdout.trim()) {
      return c.json({
        hasRepo: true,
        branch: null,
        isDirty: false,
        changedFiles: [],
        remotes: [],
        error: stderr.trim() || "Git not initialized",
      });
    }

    const parts = stdout.split("---SEPARATOR---");
    const statusOutput = (parts[0] || "").trim();
    const branch = (parts[1] || "").trim() || null;
    const remoteOutput = (parts[2] || "").trim();

    const changedFiles = statusOutput
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.trim());

    const remotes = remoteOutput
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.trim());

    return c.json({
      hasRepo: true,
      branch,
      isDirty: changedFiles.length > 0,
      changedFiles,
      remotes,
    });
  } catch (error) {
    const errStr = String(error);
    // If the sandbox is not reachable, return 503 (retryable) instead of 500
    if (
      errStr.includes("fetch failed") ||
      errStr.includes("ECONNREFUSED") ||
      errStr.includes("timeout") ||
      errStr.includes("AbortError")
    ) {
      return c.json({ error: "Sandbox not reachable", details: errStr }, 503);
    }
    return c.json({ error: "Failed to get git status", details: errStr }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/github/log — git commit history
// ---------------------------------------------------------------------------
api.get("/:id/github/log", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-log";
  c.var.session.metadata.sessionDbId = session.id;

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);

    const checkResult = await execInSandbox(
      apiClient,
      session.sandboxId!,
      'test -d .git && echo "YES" || echo "NO"',
      projectDir,
    );

    if (checkResult.stdout.trim() !== "YES") {
      return c.json([] as GitLogEntry[]);
    }

    const { stdout, stderr, exitCode } = await execInSandbox(
      apiClient,
      session.sandboxId!,
      "git log --all --pretty=format:'%h|||%p|||%D|||%s|||%cd|||%an|||%ae' --date=iso -50",
      projectDir,
    );

    if (exitCode !== 0) {
      const errMsg = stderr.trim();
      if (
        errMsg.includes("does not have any commits") ||
        errMsg.includes("bad default revision")
      ) {
        return c.json([] as GitLogEntry[]);
      }
      return c.json({ error: errMsg || "Failed to load git log" }, 500);
    }

    const entries: GitLogEntry[] = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [
          hash,
          parentsRaw,
          refsRaw,
          message,
          committerDate,
          authorName,
          authorEmail,
        ] = line.split("|||");
        const parents = parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [];
        const refs = refsRaw?.trim() ?? "";
        return {
          hash: hash?.trim() ?? "",
          parents,
          branch: refs ? parseGitBranch(refs) : "",
          message: message?.trim() ?? "",
          committerDate: committerDate?.trim() ?? "",
          author: {
            name: authorName?.trim() ?? "",
            email: authorEmail?.trim() ?? "",
          },
        };
      })
      .filter((entry) => entry.hash);

    return c.json(entries);
  } catch (error) {
    return c.json(
      { error: "Failed to load git log", details: String(error) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /:id/github/init — initialize a new git repository
// ---------------------------------------------------------------------------
api.post("/:id/github/init", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-init";
  c.var.session.metadata.sessionDbId = session.id;

  const body = await c.req
    .json<{ remoteUrl?: string }>()
    .catch(() => ({}) as { remoteUrl?: string });
  const remoteUrl =
    typeof body.remoteUrl === "string" ? body.remoteUrl.trim() : "";

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);

    const { stderr, exitCode } = await execInSandbox(
      apiClient,
      session.sandboxId!,
      "git init",
      projectDir,
    );

    if (exitCode !== 0) {
      return c.json(
        {
          success: false,
          error: stderr.trim() || "Failed to initialize repository",
        },
        400,
      );
    }

    if (remoteUrl) {
      const safeRemote = remoteUrl.replace(/'/g, "'\\''");
      await execInSandbox(
        apiClient,
        session.sandboxId!,
        `git remote add origin '${safeRemote}'`,
        projectDir,
      );
      const metadata = parseMetadata(session);
      await db
        .update(chatSessions)
        .set({ metadata: { ...metadata, repoUrl: remoteUrl } })
        .where(eq(chatSessions.id, session.id));
    }

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: "Failed to initialize repository", details: String(error) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /:id/github/create-repo — create a GitHub repo and push
// ---------------------------------------------------------------------------
api.post("/:id/github/create-repo", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-create-repo";
  c.var.session.metadata.sessionDbId = session.id;

  const body = await c.req
    .json<{ name: string; description?: string; isPrivate?: boolean }>()
    .catch(
      () => ({}) as { name: string; description?: string; isPrivate?: boolean },
    );
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const isPrivate = body.isPrivate !== false;

  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return c.json({ success: false, error: "Invalid repository name" }, 400);
  }

  return c.var.tracer.startActiveSpan("git.create-repo", async (span) => {
    span.setAttribute("sessionDbId", session.id);
    span.setAttribute("repoName", name);
    try {
      const apiClient = (c.var.sandbox as any).client;
      const projectDir = getProjectDir(session);
      const safeName = name.replace(/'/g, "'\\''");
      const safeDescription = description
        ? description.replace(/'/g, "'\\''")
        : "";

      const repoCheck = await execInSandbox(
        apiClient,
        session.sandboxId!,
        'test -d .git && echo "YES" || echo "NO"',
        projectDir,
      );

      if (repoCheck.stdout.trim() !== "YES") {
        const { stderr, exitCode } = await execInSandbox(
          apiClient,
          session.sandboxId!,
          "git init",
          projectDir,
        );
        if (exitCode !== 0) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: stderr.trim(),
          });
          return c.json(
            {
              success: false,
              error: stderr.trim() || "Failed to initialize repository",
            },
            400,
          );
        }
      }

      const commitCheck = await execInSandbox(
        apiClient,
        session.sandboxId!,
        "git rev-parse --verify HEAD",
        projectDir,
      );

      if (commitCheck.exitCode !== 0) {
        const addResult = await execInSandbox(
          apiClient,
          session.sandboxId!,
          "git add -A",
          projectDir,
        );
        if (addResult.exitCode !== 0) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: addResult.stderr.trim(),
          });
          return c.json(
            {
              success: false,
              error: addResult.stderr.trim() || "Failed to stage files",
            },
            400,
          );
        }

        const commitResult = await execInSandbox(
          apiClient,
          session.sandboxId!,
          "git commit -m 'Initial commit'",
          projectDir,
        );

        if (commitResult.exitCode !== 0) {
          const allowEmptyResult = await execInSandbox(
            apiClient,
            session.sandboxId!,
            "git commit --allow-empty -m 'Initial commit'",
            projectDir,
          );
          if (allowEmptyResult.exitCode !== 0) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: allowEmptyResult.stderr.trim(),
            });
            return c.json(
              {
                success: false,
                error:
                  allowEmptyResult.stderr.trim() ||
                  allowEmptyResult.stdout.trim() ||
                  "Failed to commit",
              },
              400,
            );
          }
        }
      }

      const authResult = await execInSandbox(
        apiClient,
        session.sandboxId!,
        "gh auth setup-git",
        projectDir,
      );
      if (authResult.exitCode !== 0) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: authResult.stderr.trim(),
        });
        return c.json(
          {
            success: false,
            error:
              authResult.stderr.trim() || "Failed to setup git authentication",
          },
          400,
        );
      }

      const visibilityFlag = isPrivate ? "--private" : "--public";
      const descriptionFlag = safeDescription
        ? ` --description '${safeDescription}'`
        : "";
      const createCmd = `gh repo create '${safeName}' ${visibilityFlag} --source=. --push${descriptionFlag}`;
      const { stdout, stderr, exitCode } = await execInSandbox(
        apiClient,
        session.sandboxId!,
        createCmd,
        projectDir,
      );

      if (exitCode !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: stderr.trim() });
        return c.json(
          {
            success: false,
            error: stderr.trim() || "Failed to create GitHub repository",
          },
          400,
        );
      }

      const urlMatch = stdout.match(/https?:\/\/\S+/);
      const repoUrl = urlMatch ? urlMatch[0].replace(/\.git$/, "") : undefined;

      if (repoUrl) {
        const metadata = parseMetadata(session);
        await db
          .update(chatSessions)
          .set({ metadata: { ...metadata, repoUrl } })
          .where(eq(chatSessions.id, session.id));
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return c.json({ success: true, repoUrl });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      return c.json(
        { error: "Failed to create GitHub repository", details: String(error) },
        500,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// POST /:id/github/branch — create and checkout a new branch
// ---------------------------------------------------------------------------
api.post("/:id/github/branch", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-branch";
  c.var.session.metadata.sessionDbId = session.id;

  const body = await c.req.json<{ name: string }>();
  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Branch name is required" }, 400);
  }

  // Sanitize branch name — only allow safe characters
  const branchName = body.name.trim().replace(/[^a-zA-Z0-9._\-/]/g, "-");

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);
    const { stdout, stderr, exitCode } = await execInSandbox(
      apiClient,
      session.sandboxId!,
      `git checkout -b '${branchName}'`,
      projectDir,
    );

    // git checkout -b writes success message to stderr (e.g., "Switched to a new branch 'test'")
    const stderrMsg = stderr.trim();
    const isGitSuccess = stderrMsg.startsWith("Switched to");
    if (exitCode !== 0 && !isGitSuccess) {
      return c.json(
        {
          success: false,
          error: stderrMsg || "Failed to create branch",
        },
        400,
      );
    }

    const metadata = parseMetadata(session);
    await db
      .update(chatSessions)
      .set({ metadata: { ...metadata, branch: branchName } })
      .where(eq(chatSessions.id, session.id));

    return c.json({ branch: branchName, success: true });
  } catch (error) {
    return c.json(
      { error: "Failed to create branch", details: String(error) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /:id/github/checkout — create and switch to a new branch from a commit
// ---------------------------------------------------------------------------
api.post("/:id/github/checkout", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-checkout";
  c.var.session.metadata.sessionDbId = session.id;

  const body = await c.req.json<{ name: string; startPoint?: string }>();
  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Branch name is required" }, 400);
  }

  const branchName = body.name.trim().replace(/[^a-zA-Z0-9._\-/]/g, "-");
  const startPoint =
    body.startPoint?.trim().replace(/[^a-zA-Z0-9._\-/]/g, "") || "";

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);

    const cmd = startPoint
      ? `git checkout -b '${branchName}' '${startPoint}'`
      : `git checkout -b '${branchName}'`;

    const { stdout, stderr, exitCode } = await execInSandbox(
      apiClient,
      session.sandboxId!,
      cmd,
      projectDir,
    );

    const stderrMsg = stderr.trim();
    const isGitSuccess = stderrMsg.startsWith("Switched to");
    if (exitCode !== 0 && !isGitSuccess) {
      return c.json(
        {
          success: false,
          error: stderrMsg || "Failed to create branch",
        },
        400,
      );
    }

    const metadata = parseMetadata(session);
    await db
      .update(chatSessions)
      .set({ metadata: { ...metadata, branch: branchName } })
      .where(eq(chatSessions.id, session.id));

    return c.json({ branch: branchName, success: true });
  } catch (error) {
    return c.json(
      { error: "Failed to checkout branch", details: String(error) },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// POST /:id/github/commit — stage and commit changes
// ---------------------------------------------------------------------------
api.post("/:id/github/commit", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-commit";
  c.var.session.metadata.sessionDbId = session.id;

  const body = await c.req.json<{ message: string; files?: string[] }>();
  if (!body.message || !body.message.trim()) {
    return c.json({ error: "Commit message is required" }, 400);
  }

  return c.var.tracer.startActiveSpan("git.commit", async (span) => {
    span.setAttribute("sessionDbId", session.id);
    try {
      const apiClient = (c.var.sandbox as any).client;
      const projectDir = getProjectDir(session);

      // Stage files
      let addCmd: string;
      if (body.files && body.files.length > 0) {
        const normalized = body.files.map(normalizeGitFile).filter(Boolean);
        if (normalized.length === 0) {
          addCmd = "git add -A";
        } else {
          const safeFiles = normalized
            .map((f) => `'${f.replace(/'/g, "'\\''")}'`)
            .join(" ");
          addCmd = `git add ${safeFiles}`;
        }
      } else {
        addCmd = "git add -A";
      }

      const { stderr: addErr, exitCode: addExit } = await execInSandbox(
        apiClient,
        session.sandboxId!,
        addCmd,
        projectDir,
      );

      if (addExit !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: addErr.trim() });
        return c.json(
          {
            success: false,
            error: addErr.trim() || "Failed to stage files",
          },
          400,
        );
      }

      // Write commit message to temp file via single-quoted heredoc (prevents all shell interpretation)
      const writeMsgCmd = `cat > /tmp/.commit-msg <<'COMMIT_MSG_EOF'\n${body.message.trim()}\nCOMMIT_MSG_EOF`;
      await execInSandbox(
        apiClient,
        session.sandboxId!,
        writeMsgCmd,
        projectDir,
      );

      // Commit using -F to read message from file (no shell interpretation)
      const { stdout, stderr, exitCode } = await execInSandbox(
        apiClient,
        session.sandboxId!,
        "git commit -F /tmp/.commit-msg",
        projectDir,
      );

      if (exitCode !== 0) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: stderr.trim() || stdout.trim(),
        });
        return c.json(
          {
            success: false,
            error: stderr.trim() || stdout.trim() || "Failed to commit",
          },
          400,
        );
      }

      // Extract commit hash
      const hashMatch = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
      const hash = hashMatch ? hashMatch[1] : null;

      const metadata = parseMetadata(session);
      await db
        .update(chatSessions)
        .set({
          metadata: {
            ...metadata,
            lastCommit: {
              hash,
              message: body.message.trim(),
              timestamp: new Date().toISOString(),
            },
          },
        })
        .where(eq(chatSessions.id, session.id));

      span.setAttribute("commitHash", hash || "unknown");
      span.setStatus({ code: SpanStatusCode.OK });
      return c.json({
        hash,
        message: body.message.trim(),
        success: true,
      });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      return c.json({ error: "Failed to commit", details: String(error) }, 500);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /:id/github/pr — push and create a pull request via gh CLI
// ---------------------------------------------------------------------------
api.post("/:id/github/pr", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-pr";
  c.var.session.metadata.sessionDbId = session.id;

  const body = await c.req.json<{
    title: string;
    body?: string;
    base?: string;
  }>();
  if (!body.title || !body.title.trim()) {
    return c.json({ error: "PR title is required" }, 400);
  }

  // Sanitize PR title — escape shell-dangerous characters ($, `, \, ")
  const sanitizedTitle = body.title
    .replace(/[`$\\]/g, "\\$&")
    .replace(/"/g, '\\"');
  // Sanitize base branch — only allow safe git ref characters
  const sanitizedBase = (body.base || "main").replace(
    /[^a-zA-Z0-9._\-/]/g,
    "-",
  );

  return c.var.tracer.startActiveSpan("git.create-pr", async (span) => {
    span.setAttribute("sessionDbId", session.id);
    try {
      const apiClient = (c.var.sandbox as any).client;
      const projectDir = getProjectDir(session);

      // Push the branch
      const { stderr: pushErr, exitCode: pushExit } = await execInSandbox(
        apiClient,
        session.sandboxId!,
        "git push -u origin HEAD",
        projectDir,
      );

      if (pushExit !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: pushErr.trim() });
        return c.json(
          {
            success: false,
            error: pushErr.trim() || "Failed to push branch",
          },
          400,
        );
      }

      // Write PR body to temp file via single-quoted heredoc (prevents all shell interpretation)
      const writeBodyCmd = `cat > /tmp/.pr-body <<'PR_BODY_EOF'\n${(body.body || "").trim()}\nPR_BODY_EOF`;
      await execInSandbox(
        apiClient,
        session.sandboxId!,
        writeBodyCmd,
        projectDir,
      );

      // Create PR using --body-file for safe body handling, sanitized title and base
      const prCmd = `gh pr create --title "${sanitizedTitle}" --body-file /tmp/.pr-body --base "${sanitizedBase}"`;
      const { stdout, stderr, exitCode } = await execInSandbox(
        apiClient,
        session.sandboxId!,
        prCmd,
        projectDir,
      );

      if (exitCode !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: stderr.trim() });
        return c.json(
          {
            success: false,
            error: stderr.trim() || "Failed to create PR",
          },
          400,
        );
      }

      // The gh pr create command outputs the PR URL
      const prUrl = stdout.trim();
      const numberMatch = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = numberMatch ? parseInt(numberMatch[1]!, 10) : null;

      const metadata = parseMetadata(session);
      await db
        .update(chatSessions)
        .set({
          metadata: {
            ...metadata,
            pullRequest: {
              url: prUrl,
              number: prNumber,
            },
          },
        })
        .where(eq(chatSessions.id, session.id));

      span.setAttribute("prUrl", prUrl);
      span.setStatus({ code: SpanStatusCode.OK });
      return c.json({
        url: prUrl,
        number: prNumber,
        success: true,
      });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      return c.json(
        { error: "Failed to create PR", details: String(error) },
        500,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// POST /:id/github/push — push current branch to remote
// ---------------------------------------------------------------------------
api.post("/:id/github/push", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-push";
  c.var.session.metadata.sessionDbId = session.id;

  return c.var.tracer.startActiveSpan("git.push", async (span) => {
    span.setAttribute("sessionDbId", session.id);
    try {
      const apiClient = (c.var.sandbox as any).client;
      const projectDir = getProjectDir(session);

      const { stderr, exitCode } = await execInSandbox(
        apiClient,
        session.sandboxId!,
        "git push -u origin HEAD",
        projectDir,
      );

      if (exitCode !== 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: stderr.trim() });
        return c.json(
          {
            success: false,
            error: stderr.trim() || "Failed to push branch",
          },
          400,
        );
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return c.json({ success: true });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      return c.json(
        { error: "Failed to push branch", details: String(error) },
        500,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// GET /:id/github/diff — current working tree diff
// ---------------------------------------------------------------------------
api.get("/:id/github/diff", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-diff";
  c.var.session.metadata.sessionDbId = session.id;

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);

    // Show both staged and unstaged diffs
    const { stdout } = await execInSandbox(
      apiClient,
      session.sandboxId!,
      "git diff HEAD 2>/dev/null || git diff 2>/dev/null",
      projectDir,
    );

    return c.json({ diff: stdout });
  } catch (error) {
    return c.json({ error: "Failed to get diff", details: String(error) }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/github/diff-file — per-file diff and content
// ---------------------------------------------------------------------------
api.get("/:id/github/diff-file", async (c) => {
  const result = await getSession(c.req.param("id")!, c.get("user")!.id);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  const { session } = result;

  c.var.session.metadata.action = "git-diff-file";
  c.var.session.metadata.sessionDbId = session.id;

  const rawPath = c.req.query("path");
  if (!rawPath) return c.json({ error: "path query is required" }, 400);

  try {
    const apiClient = (c.var.sandbox as any).client;
    const projectDir = getProjectDir(session);
    const repoPath = toRepoRelativePath(rawPath, projectDir);
    if (!repoPath) return c.json({ error: "Invalid file path" }, 400);
    const absolutePath = toAbsoluteSandboxPath(rawPath);
    const safeRepoPath = repoPath.replace(/'/g, "'\\''");
    const safeAbsolutePath = absolutePath.replace(/'/g, "'\\''");

    const statusResult = await execInSandbox(
      apiClient,
      session.sandboxId!,
      `git status --porcelain -- '${safeRepoPath}'`,
      projectDir,
    );
    const statusLine =
      statusResult.stdout.trim().split("\n").find(Boolean) || "";
    const status = statusLine.slice(0, 2).trim();
    const isUntracked = status === "??";
    const isAdded = status.includes("A");
    const isDeleted = status.includes("D");

    const diffResult = await execInSandbox(
      apiClient,
      session.sandboxId!,
      `git diff -- '${safeRepoPath}' 2>/dev/null`,
      projectDir,
    );

    let oldContent = "";
    let newContent = "";

    if (isDeleted) {
      const oldResult = await execInSandbox(
        apiClient,
        session.sandboxId!,
        `git show HEAD:'${safeRepoPath}' 2>/dev/null`,
        projectDir,
      );
      if (oldResult.exitCode === 0) {
        oldContent = oldResult.stdout;
      }
      newContent = "";
    } else if (isUntracked || isAdded) {
      const newResult = await execInSandbox(
        apiClient,
        session.sandboxId!,
        `cat '${safeRepoPath}' 2>/dev/null`,
        projectDir,
      );
      if (newResult.exitCode === 0) {
        newContent = newResult.stdout;
      }
      oldContent = "";
    } else {
      const oldResult = await execInSandbox(
        apiClient,
        session.sandboxId!,
        `git show HEAD:'${safeRepoPath}' 2>/dev/null`,
        projectDir,
      );
      if (oldResult.exitCode === 0) {
        oldContent = oldResult.stdout;
      }
      const newResult = await execInSandbox(
        apiClient,
        session.sandboxId!,
        `cat '${safeRepoPath}' 2>/dev/null`,
        projectDir,
      );
      if (newResult.exitCode === 0) {
        newContent = newResult.stdout;
      }
    }

    return c.json({
      path: rawPath,
      diff: diffResult.stdout,
      oldContent,
      newContent,
    });
  } catch (error) {
    return c.json(
      { error: "Failed to get diff file", details: String(error) },
      500,
    );
  }
});

export default api;
