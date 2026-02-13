import { authClient } from './auth-client';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);

  if (res.status === 401) {
    await authClient.signOut();
    window.location.href = '/';
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    let text = 'Unknown error';
    try {
      text = await res.text();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, text || 'Unknown error');
  }

  return res;
}
