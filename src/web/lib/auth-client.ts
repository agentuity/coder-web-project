import { createAuthClient } from '@agentuity/auth/react';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  basePath: '/api/auth',
});
export const { signIn, signOut, useSession } = authClient;
