# Agentuity Coder

A web-based AI coding agent IDE built on the [Agentuity](https://agentuity.dev) platform. Uses [OpenCode](https://opencode.ai) servers running in Agentuity sandboxes as the AI execution engine, with a custom React web UI.

## Architecture

```
Browser → React UI → Hono API → @opencode-ai/sdk → OpenCode server (in Agentuity sandbox)
```

Each coding session gets its own isolated sandbox with a full development environment, git, and GitHub CLI.

## Features

- **AI Chat** with streaming markdown (Streamdown), tool call visualization, and code diffs
- **IDE Mode** with file explorer, code panel, inline diffs (@pierre/diffs), and line-level commenting
- **Git Integration** built into the IDE sidebar: status, commit, push, PR creation, repo creation, commit history visualization
- **File Attachments** in chat (upload files to sandbox, pass to AI as context)
- **Deep Linking** via URL params (sessions, views, tabs persist across refresh/navigation)
- **Auth** with BetterAuth (email/password dev, Google OAuth prod), organization management, API keys
- **Skills & Sources** per-workspace configuration injected into AI context
- **Session Sharing** via public URLs
- **Dark Mode** with full theme support

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [Agentuity CLI](https://agentuity.dev) (`npm install -g @agentuity/cli`)
- PostgreSQL database
- An Agentuity account and project

## Setup

1. **Clone and install:**

```bash
git clone https://github.com/agentuity/coder-web-project.git
cd coder-web-project
bun install
```

2. **Configure environment:**

Create a `.env` file with the required variables:

```bash
# Database (PostgreSQL connection string)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Auth secret (generate a random string)
AGENTUITY_AUTH_SECRET=your-random-secret-here

# Google OAuth (optional, for production auth)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub integration (optional, for git features)
# Fine-grained PAT with: Contents R/W, Pull requests R/W, Metadata R, Administration R/W
GH_TOKEN=ghp_your_github_token
```

The Agentuity SDK key (`AGENTUITY_SDK_KEY`) is automatically set by the platform when deployed. For local development, run `agentuity dev` which handles this for you.

3. **Run the database migrations:**

The app uses Drizzle ORM. Migrations run automatically on first start.

## Development

```bash
bun run dev
```

Starts the development server with hot reload. The app will be available at the URL shown in the terminal.

## Build

```bash
bun run build
```

Compiles the application. The build system automatically bundles the React frontend.

## Type Check

```bash
bun run typecheck
```

## Deploy

```bash
bun run deploy
```

Deploys to the Agentuity cloud. The app gets a public URL at `https://<project-id>.agentuity.run`.

## Project Structure

```
src/
├── api/                    # Auto-discovered API routes (Agentuity convention)
│   └── index.ts            # Main API router — mounts all route modules
├── routes/                 # Route modules (mounted manually in api/index.ts)
│   ├── chat.ts             # Chat endpoints (prompt, SSE streaming, file ops)
│   ├── github.ts           # Session-scoped git operations (commit, push, PR, diff, log)
│   ├── github-global.ts    # Global GitHub endpoints (repos, branches, status)
│   ├── sessions.ts         # Session CRUD and lifecycle
│   ├── session-detail.ts   # Single session operations (fork, retry, share, archive)
│   ├── workspaces.ts       # Workspace CRUD
│   ├── skills.ts           # Skills CRUD (per workspace)
│   └── sources.ts          # Sources CRUD (per workspace)
├── db/
│   ├── index.ts            # Drizzle DB connection
│   └── schema.ts           # Database schema
└── web/                    # React frontend (auto-bundled)
    ├── index.html          # HTML entry point
    ├── frontend.tsx         # React entry (providers: Auth, NuqsAdapter, AuthUI)
    ├── styles.css           # Global styles + ShadCN CSS variables
    ├── App.tsx              # Main app component (URL-based routing via nuqs)
    ├── hooks/               # Custom hooks (useFileTabs, useUrlState, etc.)
    ├── lib/                 # Utilities (auth client, shiki, etc.)
    ├── types/               # TypeScript type definitions
    └── components/
        ├── ui/              # ShadCN/ui primitives (button, card, dialog, etc.)
        ├── ai-elements/     # AI chat UI components (message, tool, reasoning, etc.)
        ├── auth/            # Auth pages (SignIn, ProfilePage)
        ├── chat/            # Chat-specific components (ToolCallCard, GitPanel, etc.)
        ├── ide/             # IDE components (CodePanel, IDELayout, FileTabs)
        ├── pages/           # Page-level components (ChatPage, SettingsPage, etc.)
        ├── sessions/        # Session management (NewSessionDialog)
        └── shell/           # App shell (AppShell, Sidebar)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Backend | Hono (via `@agentuity/runtime`) |
| Frontend | React 19 + TailwindCSS v4 |
| Auth | `@agentuity/auth` (BetterAuth) + `@daveyplate/better-auth-ui` |
| Database | PostgreSQL via `@agentuity/drizzle` |
| AI Engine | `@opencode-ai/sdk` → OpenCode server in sandbox |
| Markdown | `streamdown` + `@streamdown/code` (streaming animation) |
| Diffs | `@pierre/diffs` (FileDiff + PierreFile) |
| URL State | `nuqs` (type-safe URL search params) |
| Git Viz | `@tomplum/react-git-log` |

## URL Parameters

The app uses URL search params for deep linking:

| Param | Values | Description |
|-------|--------|-------------|
| `s` | session ID | Active session |
| `v` | `chat` \| `ide` | View mode |
| `p` | `chat` \| `settings` \| `skills` \| `sources` \| `profile` | Current page |
| `tab` | `files` \| `git` | IDE sidebar tab |

Example: `/?s=abc123&v=ide&tab=git` opens session abc123 in IDE mode with git panel.

## License

Proprietary. Copyright Agentuity, Inc.
