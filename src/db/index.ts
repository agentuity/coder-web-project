import { createPostgresDrizzle } from '@agentuity/drizzle';
import * as appSchema from './schema';
import * as authSchema from '@agentuity/auth/schema';

const schema = { ...appSchema, ...authSchema };
const { db, client, close } = createPostgresDrizzle({ schema });

export { db, client, close };
export type DB = typeof db;
