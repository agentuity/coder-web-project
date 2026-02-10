# Agentuity Coder

A web-based AI coding IDE built on the [Agentuity](https://agentuity.dev) platform. Deploy your own instance to get a browser-based development environment powered by AI agents with sandboxed code execution.

Each coding session gets its own isolated sandbox with a full development environment, git, and GitHub CLI. The app uses [OpenCode](https://opencode.ai) servers running in Agentuity sandboxes as the AI execution engine, with a custom React web UI.

## Features

- **AI Chat** with streaming markdown, tool call visualization, and code diffs
- **IDE Mode** with file explorer, code panel, inline diffs, and line-level commenting
- **Git Integration** built into the IDE sidebar: status, commit, push, PR creation, repo creation, commit history visualization
- **File Attachments** in chat (upload files to sandbox, pass to AI as context)
- **Deep Linking** via URL params (sessions, views, tabs persist across refresh/navigation)
- **Auth** with Better Auth (email/password dev, Google OAuth prod), organization management, API keys
- **Skills and Sources** per-workspace configuration injected into AI context
- **Session Sharing** via public URLs
- **Dark Mode** with full theme support

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Agentuity CLI](https://agentuity.dev) (authenticated with `agentuity auth login`)

### 1. Clone and Install

```bash
git clone <repo-url>
cd agent-code-1000
bun install
```

### 2. Set Up Database

```bash
agentuity cloud database create
```

Copy the connection string from the output.

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` -- the connection string from step 2
- `AGENTUITY_AUTH_SECRET` -- generate with `openssl rand -base64 32`

### 4. Set Up Org Secrets

These secrets are used by AI sandboxes (not by the app itself). Set them in your Agentuity org:

```bash
agentuity cloud secret set ANTHROPIC_API_KEY
agentuity cloud secret set OPENAI_API_KEY
agentuity cloud secret set GH_TOKEN
```

At minimum you need `ANTHROPIC_API_KEY` for Claude-based coding.

### 5. Run Database Migrations

```bash
bun run db:migrate
```

### 6. Verify Setup

```bash
bun run setup:check
```

### 7. Run Locally

```bash
bun run dev
```

The Agentuity SDK key (`AGENTUITY_SDK_KEY`) is automatically set by the platform when deployed. For local development, `agentuity dev` handles this for you.

### 8. Deploy

```bash
bun run deploy
```

The CLI will initialize a new project under your Agentuity org on first deploy.

## For Your Agent

<details>
<summary>Copy and paste these instructions into your coding agent to automate the full setup.</summary>

```
Set up this Agentuity Coder project from scratch. Follow these steps in order, stopping if any step fails:

1. Run: bun install

2. Create a database:
   Run: agentuity cloud database create
   Save the connection string from the output.

3. Create the .env file:
   Copy .env.example to .env, then set:
   - DATABASE_URL = the connection string from step 2
   - AGENTUITY_AUTH_SECRET = generate by running: openssl rand -base64 32

4. Set org secrets for AI sandboxes (the CLI will prompt for values):
   Run: agentuity cloud secret set ANTHROPIC_API_KEY
   Run: agentuity cloud secret set OPENAI_API_KEY
   (GH_TOKEN is optional, for GitHub features in sandboxes)

5. Run database migrations:
   Run: bun run db:migrate

6. Verify everything:
   Run: bun run setup:check
   All required checks should pass.

7. Deploy:
   Run: bun run deploy
   The CLI will create a new project under your Agentuity org on first deploy.

If setup:check reports failures, fix them before deploying.
```

</details>

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AGENTUITY_AUTH_SECRET` | Yes | Better Auth encryption secret (32+ chars) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (enables Google sign-in) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `GH_TOKEN` | No | GitHub fine-grained PAT for repo features |

Without Google OAuth credentials, the app defaults to email/password authentication.

### Org Secrets (for AI Sandboxes)

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Claude API access in sandboxes |
| `OPENAI_API_KEY` | OpenAI API access in sandboxes |
| `GH_TOKEN` | GitHub access in sandboxes |

### Authentication

- **Development**: Email/password auth (no additional config needed)
- **Production**: Add Google OAuth credentials for Google sign-in

## Development

### Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run deploy` | Deploy to Agentuity |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run setup:check` | Verify setup configuration |
| `bun run db:generate` | Generate SQL migration from schema changes |
| `bun run db:migrate` | Apply pending migrations |

### Database Schema

Schema is defined in `src/db/schema.ts`. When making changes:

1. Edit `src/db/schema.ts` and `src/db/schema.kit.ts` (must stay in sync)
2. Run `bun run db:generate`
3. Run `bun run db:migrate`
4. Deploy with `bun run deploy`

The `tablesFilter` in `drizzle.config.ts` protects auth tables from being dropped. Do not remove it.

### Project Structure

```
src/
  api/              API route mounting
  db/               Database schema and migrations
  opencode/         OpenCode config and sandbox management
  routes/           Hono API routes
  web/              React frontend
    components/     UI components
    hooks/          Custom hooks
    lib/            Utilities
    types/          TypeScript type definitions
    public/         Static assets
```

### URL Parameters

The app uses URL search params for deep linking:

| Param | Values | Description |
|-------|--------|-------------|
| `s` | session ID | Active session |
| `v` | `chat`, `ide` | View mode |
| `p` | `chat`, `settings`, `skills`, `sources`, `profile` | Current page |
| `tab` | `files`, `git` | IDE sidebar tab |

Example: `/?s=abc123&v=ide&tab=git` opens session abc123 in IDE mode with the git panel.

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono (via `@agentuity/runtime`)
- **Frontend**: React 19 + Tailwind CSS v4
- **Auth**: Better Auth (`@agentuity/auth`)
- **Database**: PostgreSQL via Drizzle ORM (`@agentuity/drizzle`)
- **AI**: OpenCode SDK with sandboxed execution
- **Markdown**: Streamdown (streaming animation)
- **Diffs**: @pierre/diffs (FileDiff + PierreFile)
- **URL State**: nuqs (type-safe URL search params)
- **Deploy**: Agentuity Platform

## License

Proprietary. Copyright Agentuity, Inc.
