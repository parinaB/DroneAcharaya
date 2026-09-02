/**
 * Thin fetch wrapper around the DroneAcharaya backend.
 *
 * Base URL comes from NEXT_PUBLIC_API_BASE_URL (see .env.local.example).
 */

import type {
  HealthScoreOut,
  LatestFrameOut,
  RunSummary,
  SessionStatusOut,
  StartReplayResponse,
} from "./types";

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

/** GET /api/v1/replay/runs — runs available to replay (empty until
 * data/sample_runs/ has files). */
export function listRuns() {
  return apiFetch<RunSummary[]>("/api/v1/replay/runs");
}

/** POST /api/v1/replay/{run_id}/start — begins a replay session paced at
 * `speed`x real time; 404s if no telemetry file exists for run_id. */
export function startReplay(runId: string, speed: number = 1.0) {
  return apiFetch<StartReplayResponse>(
    `/api/v1/replay/${encodeURIComponent(runId)}/start`,
    { method: "POST", body: JSON.stringify({ speed }) },
  );
}

/** POST /api/v1/replay/{session_id}/stop — requests the session's bridge
 * loop to stop after its current frame. */
export function stopReplay(sessionId: string) {
  return apiFetch<{ session_id: string; status: string }>(
    `/api/v1/replay/${encodeURIComponent(sessionId)}/stop`,
    { method: "POST" },
  );
}

/** GET /api/v1/replay/{session_id}/status — session state, frame count,
 * last mission-elapsed time written. */
export function getReplayStatus(sessionId: string) {
  return apiFetch<SessionStatusOut>(
    `/api/v1/replay/${encodeURIComponent(sessionId)}/status`,
  );
}

/** GET /api/v1/replay/{session_id}/latest — most recent telemetry frame
 * written for this session. 404 until the first frame lands. */
export function getLatestFrame(sessionId: string) {
  return apiFetch<LatestFrameOut>(
    `/api/v1/replay/${encodeURIComponent(sessionId)}/latest`,
  );
}

/** GET /api/v1/inference/latest?session_id= — most recent health/fault/RUL
 * reading for this session. `source` is "ground_truth" for a session's
 * first ~59 frames (rolling window still filling), then "model" once
 * lstm_rul's health+RUL heads take over -- see forecast_horizon_s for
 * whether a reading describes the current instant (0) or a forecast (60s
 * ahead, for the model path). 404 until the first score lands. */
export function getLatestHealthScore(sessionId: string) {
  return apiFetch<HealthScoreOut>(
    `/api/v1/inference/latest?session_id=${encodeURIComponent(sessionId)}`,
  );
}
