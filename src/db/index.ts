import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import * as appSchema from './schema';
import * as authSchema from '@agentuity/auth/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL required');

const client = new SQL(DATABASE_URL);
const schema = { ...appSchema, ...authSchema };
export const db = drizzle({ client, schema });

export type DB = typeof db;
