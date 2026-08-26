/**
 * Thin fetch wrapper around the DroneAcharaya backend.
 *
 * Base URL comes from NEXT_PUBLIC_API_BASE_URL (see .env.local.example).
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Perform a JSON request against the backend and return the parsed body. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      `Request to ${path} failed with ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

/** GET /health — backend liveness probe. */
export function getHealth() {
  return apiFetch<{ status: string; service: string; version: string }>(
    "/health",
  );
}
