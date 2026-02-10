import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/db/schema.kit.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
	verbose: true,
	// Only manage our app tables — Better Auth manages its own tables
	tablesFilter: ['workspaces', 'chat_sessions', 'skills', 'sources'],
});
