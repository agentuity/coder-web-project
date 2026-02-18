import { authClient } from "./auth-client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const maxRetries = 3;
  const retryableStatuses = [503];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 401) {
      await authClient.signOut();
      window.location.href = "/";
      throw new ApiError(401, "Session expired");
    }

    // Retry on 503 (Service Unavailable) with exponential backoff
    if (retryableStatuses.includes(res.status) && attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s, max 8s
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      let text = "Unknown error";
      try {
        text = await res.text();
      } catch {
        // ignore
      }
      throw new ApiError(res.status, text || "Unknown error");
    }

    return res;
  }

  // Should never reach here, but just in case
  throw new ApiError(503, "Service unavailable after retries");
}
