# Agent Guidelines for Agentuity Coder

Agentuity Coder is a web-based AI coding IDE built on the Agentuity platform.
It uses Bun at runtime, Hono on the backend, and React 19 + Tailwind CSS v4 on the frontend.
Each coding session spins up an OpenCode server in a dedicated Agentuity sandbox and persists state in PostgreSQL.

---

## 1. Title and Overview

This document is the canonical guide for agents working in this repo.
It is organized for progressive disclosure: quickstart first, deep references later.
All file paths and commands below are verified against this codebase.

---

## 2. Quick Reference

**Runtime:** Bun (Agentuity project — do not use npm/pnpm)

| Command | Description | Source |
| --- | --- | --- |
| `bun run build` | Compile with `agentuity build` | `package.json` scripts |
| `bun run dev` | Start dev server with `agentuity dev` | `package.json` scripts |
| `bun run test` | Run tests with `bun test` | `package.json` scripts |
| `bun run deploy` | Deploy to Agentuity cloud | `package.json` scripts |
| `bun run typecheck` | TypeScript checking (`bunx tsc --noEmit`) | `package.json` scripts |
| `bun run db:generate` | Generate SQL migration | `package.json` scripts |
| `bun run db:migrate` | Apply pending migrations | `package.json` scripts |
| `bun run db:push` | Push schema directly (bypasses migrations) | `package.json` scripts |
| `bun run setup:check` | Validate local environment | `package.json` scripts |

**Other useful script:**
| Command | Description | Source |
| --- | --- | --- |
| `bun run start` | Start production build (`bun .agentuity/app.js`) | `package.json` scripts |

---

## 3. Architecture Overview

The Hono backend serves JSON APIs and static frontend assets through the Agentuity runtime.
The React frontend calls `/api/*` routes for sessions, chat, files, git operations, skills, and settings.
Each session creates its own sandbox and runs an OpenCode server that the API proxies to.
Voice features are implemented by the LeadNarrator agent and exposed through `/api/voice/*` routes.
App data lives in PostgreSQL via Drizzle ORM, while Better Auth manages its own auth tables.

---

## 4. Project Structure

```
app.ts
agentuity.json
agentuity.config.ts
drizzle.config.ts
package.json
.env.example
scripts/
  setup-check.ts
drizzle/
  0000_init.sql
  meta/
src/
  agent/
    lead-narrator.ts
    eval.ts
    AGENTS.md
  api/
    index.ts
    AGENTS.md
  db/
    schema.ts
    index.ts
  lib/
    thread-context.ts
    encryption.ts
    sandbox-health.ts
    path-utils.ts
    parse-metadata.ts
  opencode/
    index.ts
    config.ts
    sandbox.ts
    client.ts
  routes/
    sessions.ts
    session-detail.ts
    chat.ts
    workspaces.ts
    skills.ts
    sources.ts
    github.ts
    github-global.ts
    voice.ts
    voice-settings.ts
    user-settings.ts
    shared.ts
    session-mcp.ts
  web/
    index.html
    frontend.tsx
    App.tsx
    styles.css
    components/
    hooks/
    lib/
    types/
    public/
  generated/
    AGENTS.md
    (registry.ts, routes.ts, app.ts, env.d.ts, ...)
```

---

## 5. Key Entry Points

| File | Purpose |
| --- | --- |
| `app.ts` | App bootstrap and custom thread ID provider |
| `src/api/index.ts` | Route mounting + auth middleware boundaries |
| `src/auth.ts` | Better Auth configuration and middleware |
| `src/agent/lead-narrator.ts` | Voice agent (transcribe/speak/condense/narrate) |
| `src/agent/eval.ts` | 7 evals for narrator quality/safety/role adherence |
| `src/db/schema.ts` | Application tables (workspaces, sessions, skills, sources, user_settings) |
| `src/db/index.ts` | Drizzle client initialization (app + auth schema) |
| `src/opencode/sandbox.ts` | Sandbox lifecycle + OpenCode server start |
| `src/opencode/config.ts` | Generates `opencode.json` for sandboxes |
| `src/opencode/client.ts` | One OpenCode client per sandbox |
| `src/routes/sessions.ts` | Session creation + fire-and-forget sandbox setup |
| `src/routes/session-detail.ts` | Session fork, retry, share, delete |
| `src/routes/chat.ts` | Messages, SSE, file operations, permissions |
| `src/routes/github.ts` | Git status/log/commit/push/PR inside sandboxes |
| `src/routes/github-global.ts` | GitHub API for repo/branch selection |
| `src/web/frontend.tsx` | Provider stack + React root |
| `src/web/router.tsx` | TanStack Router route tree + auth gate |
| `src/web/context/AppContext.tsx` | Centralized app state (sessions, workspace, handlers) |
| `src/web/App.tsx` | Thin layout wrapper (AppShell + NewSessionDialog) |
| `src/web/components/pages/ChatPage.tsx` | Chat + IDE UI, voice, sharing |
| `src/web/hooks/useSessionEvents.ts` | SSE client and event reducer |
| `src/lib/thread-context.ts` | Thread state context (session summary) |
| `src/lib/encryption.ts` | AES-256-GCM encryption for GitHub PAT |
| `src/lib/sandbox-health.ts` | 15s cached health checks |
| `scripts/setup-check.ts` | Environment prerequisite validation |
| `drizzle.config.ts` | Drizzle configuration + tablesFilter guard |

---

## 6. Backend Patterns

### Route Pattern

Routes are created with `createRouter()` and mounted in `src/api/index.ts`.

Key points:

- Public routes: `/auth/*`, `/auth-methods`, `/shared/*`
- Authenticated routes: everything else via `authMiddleware`
- Use `api.route('/path', routes)` to mount per-feature routers

### Context Object (`c.var`)

The runtime injects helpers into the context. Common ones used in routes:

- `c.var.sandbox` — sandbox API client
- `c.var.logger` — structured logger
- `c.var.tracer` — OpenTelemetry tracer
- `c.var.thread` — thread state for session context
- `c.var.session` — request-scoped metadata container
- `c.var.stream` — durable stream storage for share links
- `c.get('user')` — authenticated user (from Better Auth)
- `c.get('session')` — auth session (from Better Auth)

### Fire-and-Forget Session Setup
Session creation returns a DB record immediately, then performs sandbox setup in an async IIFE.
Pattern is implemented in `src/routes/sessions.ts`:

```
// Return response immediately
(async () => {
  // sandbox creation + OpenCode session creation
})();
return c.json(session, 201);
```

This keeps UI responsive while the sandbox boots in the background.

### Sandbox Execution: `sandbox.execute()` vs `sandboxExecute()`
**Critical gotcha:** `sandbox.execute()` returns immediately (status: `queued`).
For operations that must complete before proceeding (e.g., git clone), use `sandboxExecute()` from `@agentuity/server` with a timeout.

See `src/opencode/sandbox.ts` for the canonical implementation.

---

## 7. Database

### Schema

Application tables (managed by drizzle-kit):

- `workspaces` — user-level container for sessions/skills/sources
- `chat_sessions` — session metadata + sandbox linkage
- `skills` — custom or registry skills per workspace
- `sources` — MCP sources per workspace
- `user_settings` — GitHub PAT + voice preferences

Auth tables (managed by Better Auth):

- `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `jwks`, `apikey`

### Migration Workflow

1. Update `src/db/schema.ts`
2. Run `bun run db:generate`
3. Run `bun run db:migrate`
4. Deploy with `bun run deploy`

### `tablesFilter` (CRITICAL)

`drizzle.config.ts` includes:

```
tablesFilter: ['workspaces', 'chat_sessions', 'skills', 'sources', 'user_settings']
```

This prevents drizzle-kit from dropping Better Auth tables.
**Do not remove this filter** — removing it will drop auth tables on migration.

### Better Auth Tables

Better Auth creates and manages its own tables via `@agentuity/auth`.
If they are dropped, re-run Better Auth migrations via the CLI (outside this repo).
Never add Better Auth tables to drizzle-kit migrations.

---

## 8. Authentication

### Dual Mode

`src/auth.ts` configures two modes:

- **Dev mode (no Google creds):** email/password, trustedOrigins accepts any origin
- **Prod mode (Google creds present):** Google OAuth, standard origin checks

### Middleware

- `authMiddleware` — required for most routes
- `optionalAuthMiddleware` — allows anonymous access where needed
- `apiKeyMiddleware` — API key protection

Access the authenticated user and session with:

```
const user = c.get('user');
const session = c.get('session');
```

### Auth Routes

Public:

- `/api/auth/*` (mounted from Better Auth)
- `/api/auth-methods`
- `/api/shared/*`

Authenticated:

- `/api/me`
- `/api/user/*`
- `/api/voice/*`
- `/api/github/*`
- `/api/workspaces/*`
- `/api/sessions/*`

---

## 9. Frontend

### Provider Stack

Defined in `src/web/frontend.tsx`:

1. `StrictMode`
2. `QueryClientProvider`
3. `AgentuityProvider`
4. `AuthProvider`
5. `AuthUIProvider`
6. `RouterProvider` (TanStack Router)

### Routing (TanStack Router)

Routing uses **TanStack Router** with code-based route definitions in `src/web/router.tsx`.
App-wide state (sessions, workspace, theme, handlers) is provided by `src/web/context/AppContext.tsx`.

**Route structure:**

| Path | Component | Auth | Search Params |
| --- | --- | --- | --- |
| `/` | `WorkspacePage` | Yes | — |
| `/session/$sessionId` | `ChatPage` | Yes | `v` (chat\|ide), `tab` (files\|git\|env) |
| `/settings` | `SettingsPage` | Yes | — |
| `/skills` | `SkillsPage` | Yes | — |
| `/sources` | `SourcesPage` | Yes | — |
| `/profile` | `ProfilePage` | Yes | `av` (account sub-view) |
| `/profile/$view` | `ProfilePage` | Yes | — |
| `/shared/$streamId` | `SharedSessionPage` | No | — |

**Key files:**

- `src/web/router.tsx` — Route tree, auth gate (RootLayout), route wrappers
- `src/web/context/AppContext.tsx` — Centralized app state and navigation handlers
- `src/web/App.tsx` — Thin layout wrapper (AppShell + NewSessionDialog)

**Navigation patterns:**

- Use `useNavigate()` from `@tanstack/react-router` for programmatic navigation
- Use `useSearch({ from: '/session/$sessionId' })` for type-safe search params
- Use `useParams({ from: '/shared/$streamId' })` for path params
- Search params are Zod-validated (schemas in `router.tsx`)

### Adding Components

- UI and pages live in `src/web/components/`
- New routes should be added to `src/web/router.tsx` (route tree)
- Hooks live in `src/web/hooks/`
- Frontend utilities live in `src/web/lib/`

### Build System

- `src/web/frontend.tsx` is the entry point referenced by `src/web/index.html`
- The Agentuity build system bundles the frontend during `bun run build`/`bun run dev`
- Hot module reloading is available in dev mode

---

## 10. OpenCode Integration

### Sandbox Lifecycle

Implemented in `src/opencode/sandbox.ts`:

1. Create sandbox (`opencode:latest`, 2Gi/2000m, idle timeout 2h)
2. Write `opencode.json` to `~/.config/opencode/opencode.json`
3. Setup `gh auth` (best effort)
4. Clone repo (if provided) via `sandboxExecute()`
5. Install custom/registry skills
6. Start OpenCode server (`opencode serve --port 4096`)
7. Poll `/global/health`
8. Return sandbox ID + public URL

### OpenCode Config

Generated in `src/opencode/config.ts`:

- `$schema`: `https://opencode.ai/config.json`
- `plugin`: `@agentuity/opencode`
- `default_agent`: `Agentuity Coder Lead`
- `agent` modes: `build` and `plan` (`plan` denies edit, asks for bash)
- `mcp` sources: stdio → local, sse → remote

### Client Management

`src/opencode/client.ts` maintains a `Map<sandboxId, OpencodeClient>`.
Clients are reused per sandbox and removed on sandbox destroy.

---

## 11. Voice Agent

### Agent Definition

`src/agent/lead-narrator.ts` defines the voice agent:

- `transcribe` — Whisper (`openai.transcription('whisper-1')`)
- `speak` — TTS (`openai.speech('gpt-4o-mini-tts')`)
- `condense` — Claude Haiku 4.5 (`anthropic('claude-haiku-4-5')`)
- `narrate` — condense (if long) + speak

All condensed output must be first-person voice.

### Evals

`src/agent/eval.ts` runs 7 evals:

1. Condensing quality (LLM judge)
2. Condensing completeness (LLM judge)
3. First-person voice (LLM judge)
4. Audio output validation (programmatic)
5. Safety (preset)
6. Self-reference (preset)
7. Role adherence (preset)

---

## 12. Security

### Path Traversal Prevention

Sandbox file operations normalize paths to stay under `/home/agentuity`.
See `src/routes/chat.ts` and `src/routes/github.ts`.

### Encryption

GitHub PATs are encrypted at rest with AES-256-GCM in `src/lib/encryption.ts`.
Key derivation: SHA-256 hash of `AGENTUITY_AUTH_SECRET`.

### File Upload Restrictions

In `src/routes/chat.ts`:

- Max attachments: 5
- Max size per file: 10MB
- Allowed extensions: `txt`, `md`, `mdx`, `json`, `js`, `jsx`, `ts`, `tsx`, `py`, `java`, `go`, `rs`, `rb`, `php`, `sh`, `yaml`, `yml`, `toml`, `csv`, `log`

### Session Sharing

`src/routes/session-detail.ts` checks for sensitive patterns (keys, tokens, passwords) before creating public share links.

---

## 13. Environment Variables

Source of truth: `.env.example` and `src/auth.ts`.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection string (used by Drizzle) |
| `AGENTUITY_AUTH_SECRET` | Required | Encryption key for user secrets + Better Auth |
| `GOOGLE_CLIENT_ID` | Optional | Enables Google OAuth (production) |
| `GOOGLE_CLIENT_SECRET` | Optional | Enables Google OAuth (production) |
| `GH_TOKEN` | Optional | GitHub integration (used in sandboxes) |
| `AGENTUITY_CLOUD_BASE_URL` | Optional | Base URL for Better Auth (cloud) |
| `AGENTUITY_BASE_URL` | Optional | Alternate base URL for Better Auth |
| `BETTER_AUTH_URL` | Optional | Legacy base URL for Better Auth |

Do **not** commit real secrets. Use placeholders only.

---

## 14. Org Secrets

Sandboxes rely on org-level secrets injected by Agentuity.
Set these via the CLI (e.g., `agentuity cloud env set`).

| Secret | Used For | Where |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude (condense/narrate) | `src/opencode/sandbox.ts` |
| `OPENAI_API_KEY` | Whisper + TTS + OpenCode models | `src/opencode/sandbox.ts`, `src/agent/lead-narrator.ts` |

---

## 15. Configuration Files

| File | Purpose |
| --- | --- |
| `agentuity.json` | Project/org IDs, deployment resources, region |
| `agentuity.config.ts` | Workbench route + Vite plugins (Tailwind v4) |
| `tsconfig.json` | TS config + path aliases (`@agent/*`, `@api/*`) |
| `drizzle.config.ts` | Drizzle schema + `tablesFilter` guard |

---

## 16. Troubleshooting

| Symptom | Likely Fix |
| --- | --- |
| `500` error after adding a column | Run `bun run db:migrate` after `db:generate` |
| Auth tables dropped | Restore `tablesFilter` in `drizzle.config.ts` and re-run Better Auth migrations |
| Sandbox command returns `queued` | Use `sandboxExecute()` with timeout, not `sandbox.execute()` |
| Session stuck in `creating` | Background sandbox setup failed; check `sessions.ts` flow |
| SSE events not filtered | Ensure session ID filtering in `src/routes/chat.ts` SSE proxy |
| Dev server not starting | Validate `.env` and `DATABASE_URL` using `bun run setup:check` |
| Build fails with generated files | Never edit `src/generated/` (regenerated on build) |

---

## 17. Agent-Focused Guidelines

### Where to look first when debugging

1. `src/routes/sessions.ts` — session creation + sandbox boot
2. `src/routes/chat.ts` — message flow, SSE, file ops
3. `src/opencode/sandbox.ts` — sandbox creation + OpenCode startup
4. `src/web/App.tsx` — routing + session state
5. `src/lib/sandbox-health.ts` — status transitions

### Safe defaults for changes

- Keep `tablesFilter` intact in `drizzle.config.ts`
- Never edit `src/generated/` files
- Keep sandbox paths under `/home/agentuity`
- Use `sandboxExecute()` for commands that must finish

### How to validate changes

- `bun run setup:check`
- `bun run typecheck`
- `bun run test`
- `bun run dev` (manual UI check)

### What NOT to do

- Do not edit `src/generated/` files
- Do not remove `tablesFilter`
- Do not use npm/pnpm in this project
- Do not commit secrets or tokens

---

## 18. Learn More

- Agentuity Docs: https://agentuity.dev
- Bun Docs: https://bun.sh/docs
- Hono Docs: https://hono.dev/
- Zod Docs: https://zod.dev/
- Drizzle ORM Docs: https://orm.drizzle.team/
- Agentuity CLI AGENTS: `node_modules/@agentuity/cli/AGENTS.md`
