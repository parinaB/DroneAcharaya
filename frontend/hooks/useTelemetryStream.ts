"use client";

/**
 * Connects to GET /api/v1/replay/{session_id}/stream (backend/app/modules/
 * replay/routes.py's WebSocket route) and exposes the latest tick plus an
 * interpolated frame for smooth 60fps rendering between the ~1Hz ticks the
 * backend actually produces. Every visual driven by this hook's output must
 * trace back to a real field on `latest.frame`/`latest.health` -- nothing
 * here fabricates or simulates telemetry client-side.
 *
 * Field-agnostic interpolation: every `number`-typed EngineFrame field is
 * lerped automatically, every `string`-typed field (engine_state,
 * data_origin) snaps instantly on tick arrival. This is what keeps the hook
 * (and everything built on it) preset-agnostic -- there is no per-field or
 * per-preset special case here, so a new telemetry field added to
 * EngineFrame is interpolated correctly with zero changes to this file.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../lib/api-client";
import type { EngineFrame, HealthScoreOut } from "../lib/types";

export type StreamStatus = "connecting" | "live" | "stopped" | "error";

export interface TelemetryTick {
  frame: EngineFrame;
  health: HealthScoreOut | null;
}

interface TickMessage {
  type: "tick";
  frame: EngineFrame;
  health: HealthScoreOut | null;
}

interface SessionEndedMessage {
  type: "session_ended";
  status: string;
  error?: string | null;
}

interface ErrorMessage {
  type: "error";
  detail: string;
}

type StreamMessage = TickMessage | SessionEndedMessage | ErrorMessage;

const RECONNECT_DELAY_MS = 1000;

function wsUrl(sessionId: string): string {
  const base = new URL(API_BASE_URL);
  const protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${base.host}/api/v1/replay/${encodeURIComponent(sessionId)}/stream`;
}

/** Lerps every numeric field of `to` from `from`'s value (or snaps to `to`'s
 * value if `from` doesn't have a numeric value there yet, e.g. the very
 * first tick) and copies every non-numeric field verbatim -- no field list
 * to maintain by hand. `t` (mission-elapsed seconds) is deliberately
 * excluded from lerping: it drives playback progress, not a visual, and its
 * own value should reflect the real interpolation fraction instead. */
function interpolateFrame(from: EngineFrame | null, to: EngineFrame, alpha: number): EngineFrame {
  if (from === null) return to;
  const result = { ...to } as Record<string, unknown>;
  for (const key of Object.keys(to) as (keyof EngineFrame)[]) {
    if (key === "t") continue;
    const a = from[key];
    const b = to[key];
    if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
      result[key] = a + (b - a) * alpha;
    }
    // non-numeric (string) fields and any null/missing numeric field: keep
    // `to`'s own value (already copied via the spread above) -- snap
    // instantly rather than interpolate, and never crash on a missing field.
  }
  result.t = from.t + (to.t - from.t) * alpha;
  return result as unknown as EngineFrame;
}

export interface UseTelemetryStreamResult {
  status: StreamStatus;
  /** The most recently received tick, verbatim -- no interpolation. */
  latest: TelemetryTick | null;
  /** `latest.frame` interpolated toward the NEXT tick as it arrives, updated
   * every animation frame for smooth motion between ~1Hz ticks. Falls back
   * to `latest.frame` (no interpolation) once no further tick has arrived
   * for longer than one nominal tick interval, so the scene holds steady
   * on the last known value instead of extrapolating past it. */
  interpolatedFrame: EngineFrame | null;
  errorMessage: string | null;
}

export function useTelemetryStream(sessionId: string | null): UseTelemetryStreamResult {
  const [status, setStatus] = useState<StreamStatus>("stopped");
  const [latest, setLatest] = useState<TelemetryTick | null>(null);
  const [interpolatedFrame, setInterpolatedFrame] = useState<EngineFrame | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectedOnceRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Previous/next tick + arrival timestamps, read by the rAF interpolation
  // loop -- kept in refs (not state) so the 60fps loop never re-triggers
  // React renders on its own; only tick arrival and status changes do.
  const prevFrameRef = useRef<EngineFrame | null>(null);
  const nextFrameRef = useRef<EngineFrame | null>(null);
  const prevArrivedAtRef = useRef<number>(0);
  const tickIntervalRef = useRef<number>(1000); // running estimate, ms

  const stopInterpolationLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const runInterpolationLoop = useCallback(() => {
    const tick = () => {
      const next = nextFrameRef.current;
      if (next !== null) {
        const elapsed = performance.now() - prevArrivedAtRef.current;
        const alpha = Math.min(1, elapsed / tickIntervalRef.current);
        setInterpolatedFrame(interpolateFrame(prevFrameRef.current, next, alpha));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const disconnect = useCallback(() => {
    stopInterpolationLoop();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws !== null) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
  }, [stopInterpolationLoop]);

  useEffect(() => {
    // Preset switched, session cleared, or component unmounting -- reset to
    // a clean slate every time so no stale tick/indicator carries over from
    // a previous session into a new one.
    disconnect();
    setLatest(null);
    setInterpolatedFrame(null);
    setErrorMessage(null);
    prevFrameRef.current = null;
    nextFrameRef.current = null;
    reconnectedOnceRef.current = false;

    if (sessionId === null) {
      setStatus("stopped");
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(wsUrl(sessionId));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus("live");
        runInterpolationLoop();
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (cancelled) return;
        let message: StreamMessage;
        try {
          message = JSON.parse(event.data) as StreamMessage;
        } catch {
          return; // malformed frame -- hold last known state rather than crash
        }

        if (message.type === "tick") {
          const now = performance.now();
          if (nextFrameRef.current !== null) {
            tickIntervalRef.current = Math.max(200, now - prevArrivedAtRef.current);
          }
          prevFrameRef.current = nextFrameRef.current ?? message.frame;
          nextFrameRef.current = message.frame;
          prevArrivedAtRef.current = now;
          setLatest({ frame: message.frame, health: message.health });
        } else if (message.type === "session_ended") {
          setStatus("stopped");
          stopInterpolationLoop();
        } else if (message.type === "error") {
          setErrorMessage(message.detail);
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setErrorMessage("telemetry stream connection error");
      };

      ws.onclose = (event: CloseEvent) => {
        if (cancelled) return;
        stopInterpolationLoop();
        // A clean close (the server already sent session_ended, or the
        // client is switching presets) shouldn't reconnect -- only an
        // unexpected drop mid-run does, and only once.
        if (event.wasClean) return;
        if (!reconnectedOnceRef.current) {
          reconnectedOnceRef.current = true;
          setStatus("connecting");
          setTimeout(connect, RECONNECT_DELAY_MS);
        } else {
          setStatus("error");
          setErrorMessage("telemetry stream connection lost");
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- disconnect/runInterpolationLoop/stopInterpolationLoop are stable useCallbacks; re-running this effect is driven only by sessionId
  }, [sessionId]);

  return { status, latest, interpolatedFrame, errorMessage };
}
