export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3500';

export function buildApiUrl(path: string): string {
	if (!path.startsWith('/')) return `${BASE_URL}/${path}`;
	return `${BASE_URL}${path}`;
}

export async function fetchStatus(path: string, init?: RequestInit): Promise<number> {
	const response = await fetch(buildApiUrl(path), init);
	return response.status;
}
