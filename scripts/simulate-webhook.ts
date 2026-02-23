#!/usr/bin/env bun
/**
 * Simulates a GitHub push-to-main webhook event against a local or remote
 * webhook trigger endpoint.  Uses only Bun / Node built-ins (crypto, fetch).
 *
 * Usage:
 *   bun run scripts/simulate-webhook.ts \
 *     --url https://app.agentuity.com/api/webhooks/abc123/trigger \
 *     --secret my-webhook-secret \
 *     --repo agentuity/coder-web-project \
 *     --branch main \
 *     --message "feat: add dark mode toggle" \
 *     --pr 42
 *
 *   # With real commit data from GitHub:
 *   bun run scripts/simulate-webhook.ts \
 *     --url http://localhost:3500/api/webhooks/abc/trigger \
 *     --secret my-secret \
 *     --commit https://github.com/agentuity/app/commit/3d9efe497c262fc0e0860fdbb4b79d270c0ed797
 *
 * Environment variable fallbacks:
 *   WEBHOOK_URL    — trigger URL
 *   WEBHOOK_SECRET — HMAC signing secret
 */

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
	const flag = `--${name}`;
	const idx = process.argv.indexOf(flag);
	if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
	return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

function printUsage(): void {
	console.log(`
simulate-webhook — send a signed GitHub push webhook to a trigger URL

Usage:
  bun run scripts/simulate-webhook.ts --url <URL> --secret <SECRET> [options]

Required (flag or env var):
  --url <URL>          Webhook trigger URL            (env: WEBHOOK_URL)
  --secret <SECRET>    Webhook HMAC secret            (env: WEBHOOK_SECRET)

Options:
  --repo <owner/repo>  Repository full name           (default: agentuity/coder-web-project)
  --branch <name>      Branch name                    (default: main)
  --message <msg>      Commit message                 (default: "feat: test webhook integration")
  --pr <number>        PR number — overrides message  (e.g. --pr 42)
  --commit <sha|url>   Fetch real commit data from GitHub via gh CLI
                         • Full SHA: --commit 3d9efe497c262fc0e0860fdbb4b79d270c0ed797
                         • Short SHA: --commit 3d9efe4 (requires --repo)
                         • GitHub URL: --commit https://github.com/owner/repo/commit/SHA
  --help               Show this help message

Examples:
  # Fake payload (default)
  bun run scripts/simulate-webhook.ts --url <URL> --secret <SECRET>

  # Real commit from GitHub URL (extracts repo + SHA)
  bun run scripts/simulate-webhook.ts --url <URL> --secret <SECRET> \\
    --commit https://github.com/agentuity/app/commit/3d9efe4

  # Real commit from SHA + repo
  bun run scripts/simulate-webhook.ts --url <URL> --secret <SECRET> \\
    --repo agentuity/app --commit 3d9efe4
`.trim());
}

// ---------------------------------------------------------------------------
// GitHub commit fetching
// ---------------------------------------------------------------------------

interface GitHubCommitFile {
	filename: string;
	status: string;
}

interface GitHubCommitResponse {
	sha: string;
	commit: {
		message: string;
		author: {
			name: string;
			email: string;
			date: string;
		};
		committer: {
			name: string;
			email: string;
			date: string;
		};
	};
	author?: {
		login: string;
		id: number;
		avatar_url: string;
	} | null;
	committer?: {
		login: string;
		id: number;
		avatar_url: string;
	} | null;
	files?: GitHubCommitFile[];
}

/**
 * Parse a `--commit` value.  Accepts either a GitHub URL like
 * `https://github.com/owner/repo/commit/SHA` or a bare SHA (short or full).
 * Returns the extracted repo (if present in URL) and the SHA.
 */
function parseCommitArg(value: string): { repo?: string; sha: string } {
	const urlPattern =
		/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/commit\/([0-9a-fA-F]+)/;
	const match = value.match(urlPattern);
	if (match) {
		return { repo: match[1], sha: match[2] };
	}
	// Bare SHA (short or full)
	return { sha: value };
}

/**
 * Fetch commit details from GitHub using the `gh` CLI.
 */
async function fetchCommitData(
	owner_repo: string,
	sha: string,
): Promise<GitHubCommitResponse> {
	const proc = Bun.spawn(
		["gh", "api", `repos/${owner_repo}/commits/${sha}`],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);

	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		throw new Error(
			`gh api failed (exit ${exitCode}): ${stderr.trim() || "unknown error"}`,
		);
	}

	return JSON.parse(stdout) as GitHubCommitResponse;
}

// ---------------------------------------------------------------------------
// Resolve configuration
// ---------------------------------------------------------------------------

if (hasFlag("help")) {
	printUsage();
	process.exit(0);
}

const url = arg("url") ?? process.env.WEBHOOK_URL;
const secret = arg("secret") ?? process.env.WEBHOOK_SECRET;
const branch = arg("branch") ?? "main";
const prNumber = arg("pr");
const commitArg = arg("commit");

if (!url || !secret) {
	console.error(
		"Error: --url and --secret are required (or set WEBHOOK_URL / WEBHOOK_SECRET).\n",
	);
	printUsage();
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Build payload
// ---------------------------------------------------------------------------

let repo: string;
let headCommit: {
	id: string;
	message: string;
	timestamp: string;
	url: string;
	author: { name: string; email: string; username: string };
	committer: { name: string; email: string; username: string };
	added: string[];
	removed: string[];
	modified: string[];
};
let senderLogin: string;
let senderId: number;
let senderAvatar: string;
let pusherName: string;
let pusherEmail: string;

if (commitArg) {
	// ---- Real commit mode ----
	const parsed = parseCommitArg(commitArg);
	// URL-extracted repo takes priority, then --repo flag, then default
	repo = parsed.repo ?? arg("repo") ?? "agentuity/coder-web-project";
	const sha = parsed.sha;

	console.log(`\n⏳ Fetching commit ${sha.slice(0, 7)} from ${repo}…\n`);

	let commitData: GitHubCommitResponse;
	try {
		commitData = await fetchCommitData(repo, sha);
	} catch (err) {
		console.error(`❌ Failed to fetch commit data: ${(err as Error).message}`);
		console.error(
			"   Make sure the `gh` CLI is installed and authenticated.",
		);
		process.exit(1);
	}

	const files = commitData.files ?? [];
	const added = files
		.filter((f) => f.status === "added")
		.map((f) => f.filename);
	const removed = files
		.filter((f) => f.status === "removed")
		.map((f) => f.filename);
	const modified = files
		.filter((f) => f.status !== "added" && f.status !== "removed")
		.map((f) => f.filename);

	const authorLogin = commitData.author?.login ?? "unknown";
	const authorId = commitData.author?.id ?? 0;
	const authorAvatar =
		commitData.author?.avatar_url ??
		"https://avatars.githubusercontent.com/u/0?v=4";

	headCommit = {
		id: commitData.sha,
		message: commitData.commit.message,
		timestamp: commitData.commit.author.date,
		url: `https://github.com/${repo}/commit/${commitData.sha}`,
		author: {
			name: commitData.commit.author.name,
			email: commitData.commit.author.email,
			username: authorLogin,
		},
		committer: {
			name: commitData.commit.committer.name,
			email: commitData.commit.committer.email,
			username: commitData.committer?.login ?? authorLogin,
		},
		added,
		removed,
		modified,
	};

	senderLogin = authorLogin;
	senderId = authorId;
	senderAvatar = authorAvatar;
	pusherName = authorLogin;
	pusherEmail = commitData.commit.author.email;

	// Detect PR references in commit message
	const prRefMatch = commitData.commit.message.match(
		/(?:Merge pull request #(\d+)|(?:\(#(\d+)\)))/,
	);
	if (prRefMatch) {
		const prNum = prRefMatch[1] ?? prRefMatch[2];
		console.log(`📎 Commit references PR #${prNum}`);
	}

	console.log(`✅ Fetched commit data:`);
	console.log(`   SHA:      ${commitData.sha}`);
	console.log(
		`   Message:  ${commitData.commit.message.split("\n")[0]}`,
	);
	console.log(`   Author:   ${commitData.commit.author.name} <${commitData.commit.author.email}>`);
	console.log(`   Date:     ${commitData.commit.author.date}`);
	console.log(
		`   Files:    ${files.length} (${added.length} added, ${modified.length} modified, ${removed.length} removed)`,
	);
	console.log();
} else {
	// ---- Fake payload mode (existing behavior) ----
	repo = arg("repo") ?? "agentuity/coder-web-project";
	const sha = crypto.randomBytes(20).toString("hex");
	const message =
		prNumber != null
			? `Merge pull request #${prNumber} from feature-branch`
			: (arg("message") ?? "feat: test webhook integration");

	headCommit = {
		id: sha,
		message,
		timestamp: new Date().toISOString(),
		url: `https://github.com/${repo}/commit/${sha}`,
		author: {
			name: "Test User",
			email: "test@example.com",
			username: "test-user",
		},
		committer: {
			name: "Test User",
			email: "test@example.com",
			username: "test-user",
		},
		added: [],
		removed: [],
		modified: ["README.md"],
	};

	senderLogin = "test-user";
	senderId = 1;
	senderAvatar = "https://avatars.githubusercontent.com/u/1?v=4";
	pusherName = "test-user";
	pusherEmail = "test@example.com";
}

const repoUrl = `https://github.com/${repo}`;

const payload = {
	ref: `refs/heads/${branch}`,
	before: crypto.randomBytes(20).toString("hex"),
	after: headCommit.id,
	created: false,
	deleted: false,
	forced: false,
	compare: `${repoUrl}/compare/${crypto.randomBytes(20).toString("hex").slice(0, 12)}...${headCommit.id.slice(0, 12)}`,
	commits: [headCommit],
	head_commit: headCommit,
	repository: {
		id: 123456789,
		name: repo.split("/")[1],
		full_name: repo,
		private: true,
		html_url: repoUrl,
		url: `https://api.github.com/repos/${repo}`,
		default_branch: "main",
		owner: {
			login: repo.split("/")[0],
			id: 1,
		},
	},
	pusher: {
		name: pusherName,
		email: pusherEmail,
	},
	sender: {
		login: senderLogin,
		id: senderId,
		avatar_url: senderAvatar,
		type: "User",
	},
};

// ---------------------------------------------------------------------------
// Sign & send
// ---------------------------------------------------------------------------

const body = JSON.stringify(payload);
const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
const signature = `sha256=${hmac}`;
const deliveryId = crypto.randomUUID();

console.log("── Simulate GitHub Push Webhook ──────────────────────────");
console.log(`  URL:       ${url}`);
console.log(`  Repo:      ${repo}`);
console.log(`  Branch:    ${branch}`);
console.log(`  Commit:    ${headCommit.id.slice(0, 7)}`);
console.log(`  Message:   ${headCommit.message.split("\n")[0]}`);
console.log(`  Author:    ${headCommit.author.name} <${headCommit.author.email}>`);
console.log(`  Delivery:  ${deliveryId}`);
console.log(`  Signature: ${signature.slice(0, 20)}…`);
if (commitArg) {
	console.log(`  Mode:      real commit data (via gh CLI)`);
} else {
	console.log(`  Mode:      simulated (fake data)`);
}
console.log("──────────────────────────────────────────────────────────\n");

try {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Hub-Signature-256": signature,
			"X-GitHub-Event": "push",
			"X-GitHub-Delivery": deliveryId,
		},
		body,
	});

	const responseBody = await response.text();

	console.log(`Status: ${response.status} ${response.statusText}`);

	if (responseBody) {
		try {
			console.log("Body:", JSON.stringify(JSON.parse(responseBody), null, 2));
		} catch {
			console.log("Body:", responseBody);
		}
	}

	if (response.ok) {
		console.log("\n✅ Webhook delivered successfully.");
	} else {
		console.error(`\n❌ Webhook delivery failed (HTTP ${response.status}).`);
		process.exit(1);
	}
} catch (err) {
	console.error("\n❌ Request failed:", (err as Error).message);
	process.exit(1);
}
