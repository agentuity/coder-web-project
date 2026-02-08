import { createPostgresDrizzle } from '@agentuity/drizzle';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL required');

export const { db, close } = createPostgresDrizzle({
  connectionString: DATABASE_URL,
  schema,
});

export type DB = typeof db;
