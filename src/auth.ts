/**
 * Agentuity Auth configuration.
 *
 * - With GOOGLE_CLIENT_ID/SECRET → Google OAuth (production)
 * - Without them → email/password fallback (local dev)
 */
import { createAuth, createSessionMiddleware, createApiKeyMiddleware, mountAuthRoutes } from '@agentuity/auth';
import { drizzleAdapter } from '@agentuity/drizzle';
import * as authSchema from '@agentuity/auth/schema';
import { db } from './db';

const BASE_URL = process.env.AGENTUITY_CLOUD_BASE_URL || process.env.AGENTUITY_BASE_URL || process.env.BETTER_AUTH_URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const hasGoogle = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

export const auth = createAuth({
  ...(BASE_URL ? { baseURL: BASE_URL } : {}),
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: !hasGoogle },
  // In dev mode (no Google creds), allow any origin so Tailscale/tunnels work
  ...(!hasGoogle ? {
    trustedOrigins: (request?: Request) => {
      if (request) {
        const origin = request.headers.get('origin');
        if (origin) return [origin];
      }
      return ['http://localhost:3500'];
    },
  } : {}),
  ...(hasGoogle ? {
    socialProviders: {
      google: {
        clientId: GOOGLE_CLIENT_ID!,
        clientSecret: GOOGLE_CLIENT_SECRET!,
      },
    },
  } : {}),
});

export const authMiddleware = createSessionMiddleware(auth);
export const optionalAuthMiddleware = createSessionMiddleware(auth, { optional: true });
export const apiKeyMiddleware = createApiKeyMiddleware(auth);
export const authRoutes = mountAuthRoutes(auth);
export type Auth = typeof auth;
