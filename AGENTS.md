# Agent Guidelines for agent-code-1000

## Commands

- **Build**: `bun run build` (compiles your application)
- **Dev**: `bun run dev` (starts development server)
- **Typecheck**: `bun run typecheck` (runs TypeScript type checking)
- **Deploy**: `bun run deploy` (deploys your app to the Agentuity cloud)
- **DB Generate**: `bun run db:generate` (generates a SQL migration from schema changes)
- **DB Migrate**: `bun run db:migrate` (applies pending migrations to PostgreSQL)
- **DB Push**: `bun run db:push` (syncs schema changes to PostgreSQL via drizzle-kit)

## Agent-Friendly CLI

The Agentuity CLI is designed to be agent-friendly with programmatic interfaces, structured output, and comprehensive introspection.

Read the [AGENTS.md](./node_modules/@agentuity/cli/AGENTS.md) file in the Agentuity CLI for more information on how to work with this project.

## Instructions

- This project uses Bun instead of NodeJS and TypeScript for all source code
- This is an Agentuity Agent project

## Web Frontend (src/web/)

The `src/web/` folder contains your React frontend, which is automatically bundled by the Agentuity build system.

**File Structure:**

- `index.html` - Main HTML file with `<script type="module" src="./frontend.tsx">`
- `frontend.tsx` - Entry point that renders the React app to `#root`
- `App.tsx` - Your main React component
- `public/` - Static assets (optional)

**How It Works:**

1. The build system automatically bundles `frontend.tsx` and all its imports (including `App.tsx`)
2. The bundled JavaScript is placed in `.agentuity/web/chunk/`
3. The HTML file is served at the root `/` route
4. Script references like `./frontend.tsx` are automatically resolved to the bundled chunks

**Key Points:**

- Use proper TypeScript/TSX syntax - the bundler handles all compilation
- No need for Babel or external bundlers
- React is bundled into the output (no CDN needed)
- Supports hot module reloading in dev mode with `import.meta.hot`
- Components can use all modern React features and TypeScript

**Example:**

```tsx
// src/web/App.tsx
import { useState } from 'react';

export function App() {
	const [count, setCount] = useState(0);
	return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

## Database Schema Management

This project uses PostgreSQL via `@agentuity/drizzle` (Drizzle ORM). Schema changes are managed with `drizzle-kit`.

**When you change the schema:**

1. Edit `src/db/schema.ts` -- it uses `drizzle-orm/pg-core` for schema definitions so both the runtime and drizzle-kit can use the same file.
2. Run `bun run db:generate` (generates a SQL migration from schema changes)
3. Run `bun run db:migrate` (applies pending migrations to PostgreSQL)
4. Deploy with `bun run deploy`

**Important:**

- `@agentuity/drizzle` does NOT auto-migrate. Adding columns to the schema definition without running `db:migrate` will cause 500 errors at runtime.
- The `tablesFilter` in `drizzle.config.ts` prevents drizzle-kit from dropping Better Auth tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `jwks`, `apikey`). Never remove this filter.
- Better Auth creates and manages its own tables via `@agentuity/auth`. If they get dropped, they can be recreated by running the Better Auth CLI migrate command.

## Learn More

- [Agentuity Documentation](https://agentuity.dev)
- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)
