/**
 * Setup Check — validates prerequisites for Agentuity Coder
 * Run with: bun run setup:check
 */

export {};

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

type Level = "PASS" | "FAIL" | "WARN" | "INFO";

const levelColors: Record<Level, string> = {
	PASS: GREEN,
	FAIL: RED,
	WARN: YELLOW,
	INFO: CYAN,
};

let passCount = 0;
let failCount = 0;

function log(level: Level, message: string) {
	const color = levelColors[level];
	console.log(`${color}[${level}]${RESET} ${message}`);
	if (level === "PASS") passCount++;
	if (level === "FAIL") failCount++;
}

async function runCommand(
	cmd: string[],
): Promise<{ ok: boolean; output: string }> {
	try {
		const proc = Bun.spawn(cmd, {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;
		return {
			ok: exitCode === 0,
			output: (stdout || stderr).trim(),
		};
	} catch {
		return { ok: false, output: "" };
	}
}

async function checkBun() {
	log("PASS", `Bun v${Bun.version}`);
}

async function checkAgentuityCliInstalled() {
	const result = await runCommand(["agentuity", "version"]);
	if (result.ok) {
		log("PASS", `Agentuity CLI installed (${result.output})`);
	} else {
		log(
			"FAIL",
			"Agentuity CLI not found — install from https://agentuity.dev",
		);
	}
}

async function checkAgentuityJson() {
	const file = Bun.file("agentuity.json");
	const exists = await file.exists();
	if (!exists) {
		log(
			"FAIL",
			"agentuity.json not found — run 'agentuity deploy' to initialize",
		);
		return;
	}
	try {
		const content = await file.json();
		if (content.projectId) {
			log("PASS", "agentuity.json configured");
		} else {
			log(
				"FAIL",
				"agentuity.json missing projectId — run 'agentuity deploy' to initialize",
			);
		}
	} catch {
		log("FAIL", "agentuity.json is invalid JSON");
	}
}

async function checkEnvFile() {
	const file = Bun.file(".env");
	const exists = await file.exists();
	if (exists) {
		log("PASS", ".env file found");
	} else {
		log(
			"FAIL",
			".env file not found — copy .env.example to .env and fill in values",
		);
	}
}

function checkDatabaseUrl() {
	const url = Bun.env.DATABASE_URL;
	if (!url) {
		log(
			"FAIL",
			"DATABASE_URL not set — run 'agentuity cloud database create' then add the URL to .env",
		);
		return;
	}
	if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
		log("PASS", "DATABASE_URL configured");
	} else {
		log(
			"WARN",
			"DATABASE_URL does not look like a PostgreSQL connection string",
		);
	}
}

function checkAuthSecret() {
	const secret = Bun.env.AGENTUITY_AUTH_SECRET;
	if (!secret) {
		log(
			"FAIL",
			"AGENTUITY_AUTH_SECRET not set — generate with: openssl rand -base64 32",
		);
		return;
	}
	if (secret.length < 32) {
		log(
			"WARN",
			`AGENTUITY_AUTH_SECRET is short (${secret.length} chars) — recommended 32+ chars`,
		);
	} else {
		log("PASS", `AGENTUITY_AUTH_SECRET configured (${secret.length} chars)`);
	}
}

function checkGoogleOAuth() {
	const clientId = Bun.env.GOOGLE_CLIENT_ID;
	const clientSecret = Bun.env.GOOGLE_CLIENT_SECRET;
	if (clientId && clientSecret) {
		log("INFO", "Google OAuth: configured");
	} else {
		log(
			"INFO",
			"Google OAuth: not configured (email/password auth will be used)",
		);
	}
}

function checkGhToken() {
	const token = Bun.env.GH_TOKEN;
	if (token) {
		log("INFO", "GH_TOKEN: configured");
	} else {
		log(
			"INFO",
			"GH_TOKEN: not configured (GitHub features will be disabled)",
		);
	}
}

// --- Main ---

console.log();
console.log(`${BOLD}Agentuity Coder — Setup Check${RESET}`);
console.log("==============================");
console.log();

await checkBun();
await checkAgentuityCliInstalled();
await checkAgentuityJson();
await checkEnvFile();
checkDatabaseUrl();
checkAuthSecret();
checkGoogleOAuth();
checkGhToken();

console.log();
if (failCount === 0) {
	console.log(
		`${GREEN}All checks passed.${RESET} Run 'bun run dev' to start locally or 'bun run deploy' to deploy.`,
	);
} else {
	console.log(
		`${passCount} checks passed, ${RED}${failCount} failed${RESET}. Fix the issues above and run again.`,
	);
}
console.log();

process.exit(failCount > 0 ? 1 : 0);
