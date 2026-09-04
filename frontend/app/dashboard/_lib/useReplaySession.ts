"use client";

/**
 * Owns one replay session end-to-end: the available run/preset list, session
 * start/stop, and polling of status + latest frame + latest health score.
 * This is the SimulationView's real data source -- replaces the old mocked
 * t/speed/playing/scenario/params clock in page.tsx. See backend/CLAUDE.md's
 * API surface table for what each endpoint returns.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  evaluateAdvisory,
  getLatestFrame,
  getLatestHealthScore,
  getReplayStatus,
  listRuns,
  startReplay,
  stopReplay,
} from "../../../lib/api-client";
import type {
  HealthScoreOut,
  LatestFrameOut,
  MaintenanceReport,
  RunSummary,
  SessionStatusOut,
} from "../../../lib/types";

const POLL_INTERVAL_MS = 1000;
const RUL_HISTORY_MAX_POINTS = 180; // 3 min of history at one point per 1s

export type SessionPhase = "idle" | "loading_runs" | "no_runs" | "starting" | "running" | "error";

export interface RulSample {
  /** ms since epoch when this sample was taken -- for the x-axis. */
  sampledAt: number;
  /** Mission-elapsed seconds this reading describes. */
  t: number;
  rulEstimateHours: number | null;
}

/** How many trailing samples the trend (declining vs flat/rising) looks back
 * over -- a couple of seconds of noise shouldn't flip the color on every
 * tick, but it should still react quickly since a demo run is only ~2 min. */
const RUL_TREND_LOOKBACK_SAMPLES = 5;
/** Ignore RUL wobble smaller than this (hours) when deciding trend color --
 * lstm_rul's raw output is noisy enough that a truly flat signal still
 * jitters by small fractions of an hour between ticks. */
const RUL_TREND_NOISE_FLOOR_HOURS = 0.01;

/** true if RUL is trending down over the last few samples -- the shared rule
 * behind "red when declining, green when flat or rising" everywhere RUL is
 * shown (the big number and the chart line both use this, so they always agree). */
export function isRulDeclining(history: RulSample[]): boolean {
  const points = history.filter((s): s is RulSample & { rulEstimateHours: number } => s.rulEstimateHours !== null);
  if (points.length < 2) return false;
  const latest = points[points.length - 1].rulEstimateHours;
  const lookbackIndex = Math.max(0, points.length - 1 - RUL_TREND_LOOKBACK_SAMPLES);
  const reference = points[lookbackIndex].rulEstimateHours;
  return latest < reference - RUL_TREND_NOISE_FLOOR_HOURS;
}

/** One frame + health reading sampled during a run -- the raw material a
 * completed-run summary (Analytics/LiveDashboard) is built from. Accumulated
 * client-side while a session polls, since the backend only exposes the
 * LATEST frame/health per session, not a full history query. */
export interface RunHistorySample {
  t: number;
  frame: LatestFrameOut;
  health: HealthScoreOut | null;
}

/** Everything Analytics needs about the most recently completed (or
 * stopped) run -- derived entirely from real samples collected while it
 * played, never fabricated. */
export interface CompletedRunSummary {
  runId: string;
  runLabel: string;
  finishedAt: number;
  finalStatus: "finished" | "stopped" | "error";
  /** Every real frame+health sample collected during the run, in order. */
  samples: RunHistorySample[];
  /** Last health reading of the run, if any ever landed. */
  finalHealth: HealthScoreOut | null;
  /** Full RUL-over-time series for this run (same shape the live chart uses). */
  rulHistory: RulSample[];
  /** Maintenance recommendations from the rule engine, fetched once at run
   * end from the same session_id -- null while that fetch is in flight or
   * if it failed, never fabricated client-side. */
  maintenance: MaintenanceReport | null;
}

export interface ReplaySession {
  phase: SessionPhase;
  errorMessage: string | null;

  runs: RunSummary[];
  selectedRunId: string;
  setSelectedRunId: (runId: string) => void;

  speed: number;
  setSpeed: (speed: number) => void;

  sessionId: string | null;
  status: SessionStatusOut | null;
  frame: LatestFrameOut | null;
  health: HealthScoreOut | null;
  rulHistory: RulSample[];

  /** The most recently completed (finished/stopped/error) run's full
   * summary, or null if none has completed yet this browser session. */
  lastCompletedRun: CompletedRunSummary | null;

  /** Starts (or restarts) a session for the given run_id, or the currently
   * selected one if omitted. Stops any session already running first. */
  start: (runId?: string) => void;
  stop: () => void;
  /** Selects a preset AND immediately starts replaying it -- clicking a
   * preset card is the "run this" action, not just a picker. */
  selectAndStart: (runId: string) => void;
}

export function useReplaySession(): ReplaySession {
  const [phase, setPhase] = useState<SessionPhase>("loading_runs");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [speed, setSpeed] = useState<number>(2);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatusOut | null>(null);
  const [frame, setFrame] = useState<LatestFrameOut | null>(null);
  const [health, setHealth] = useState<HealthScoreOut | null>(null);
  const [rulHistory, setRulHistory] = useState<RulSample[]>([]);
  const [lastCompletedRun, setLastCompletedRun] = useState<CompletedRunSummary | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestHealthRef = useRef<HealthScoreOut | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const rulHistoryRef = useRef<RulSample[]>([]);
  // Every real sample seen this session, plus enough context to build a
  // CompletedRunSummary once the run ends -- reset at the start of each run.
  const historyRef = useRef<{ runId: string; runLabel: string; samples: RunHistorySample[] }>({
    runId: "",
    runLabel: "",
    samples: [],
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    let cancelled = false;
    listRuns()
      .then((fetched) => {
        if (cancelled) return;
        setRuns(fetched);
        if (fetched.length > 0) {
          setSelectedRunId(fetched[0].run_id);
          setPhase("idle");
        } else {
          setPhase("no_runs");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finalizeRun = useCallback((finalStatus: "finished" | "stopped" | "error") => {
    const { runId, runLabel, samples } = historyRef.current;
    if (samples.length === 0) return;
    setLastCompletedRun({
      runId,
      runLabel,
      finishedAt: Date.now(),
      finalStatus,
      samples,
      finalHealth: latestHealthRef.current,
      rulHistory: [...rulHistoryRef.current],
      maintenance: null,
    });
    // Prevent double-finalizing the same run from a second code path.
    historyRef.current = { runId: "", runLabel: "", samples: [] };

    // Aggregate the WORST value each health parameter reached anywhere in
    // the run (not just the last frame) and every sensor-fault class ever
    // seen, then evaluate that snapshot once -- so a fault that was
    // critical mid-run still shows up even if a different fault was active
    // at the end. See POST /advisory/evaluate's own docstring.
    const worstHealthParameters: Record<string, number> = {};
    const sensorFaultPreds: Record<string, string | null> = {};
    let minRulHours: number | null = null;
    for (const sample of samples) {
      const h = sample.health;
      if (!h) continue;
      if (h.health_parameters) {
        for (const [param, value] of Object.entries(h.health_parameters)) {
          if (!(param in worstHealthParameters) || value < worstHealthParameters[param]) {
            worstHealthParameters[param] = value;
          }
        }
      }
      if (h.sensor_fault_cht_c3 && h.sensor_fault_cht_c3 !== "NONE") {
        sensorFaultPreds["cht_c3"] = h.sensor_fault_cht_c3;
      }
      if (h.sensor_fault_bearing_vibration && h.sensor_fault_bearing_vibration !== "NONE") {
        sensorFaultPreds["bearing_vibration"] = h.sensor_fault_bearing_vibration;
      }
      if (h.rul_estimate_hours !== null && (minRulHours === null || h.rul_estimate_hours < minRulHours)) {
        minRulHours = h.rul_estimate_hours;
      }
    }

    if (Object.keys(worstHealthParameters).length > 0 || Object.keys(sensorFaultPreds).length > 0) {
      evaluateAdvisory(worstHealthParameters, minRulHours, sensorFaultPreds)
        .then((report) => {
          setLastCompletedRun((prev) => (prev && prev.runId === runId ? { ...prev, maintenance: report } : prev));
        })
        .catch(() => {
          // best-effort -- Analytics just shows "no data" for maintenance, same as any other honest gap
        });
    } else {
      setLastCompletedRun((prev) =>
        prev && prev.runId === runId
          ? { ...prev, maintenance: { engine_recommendations: [], sensor_recommendations: [] } }
          : prev,
      );
    }
  }, []);

  const start = useCallback(
    (runId?: string) => {
      const targetRunId = runId ?? selectedRunId;
      if (!targetRunId) {
        setPhase("no_runs");
        return;
      }

      // Stop whatever session is currently running before starting the new
      // one -- the backend only tracks one demo session at a time cleanly.
      stopPolling();
      const previousSessionId = sessionIdRef.current;
      if (previousSessionId) {
        stopReplay(previousSessionId).catch(() => {
          // best-effort -- starting the new session is what matters here
        });
      }

      setPhase("starting");
      setErrorMessage(null);
      setFrame(null);
      setHealth(null);
      latestHealthRef.current = null;
      setRulHistory([]);
      historyRef.current = { runId: targetRunId, runLabel: presetLabel({ run_id: targetRunId, fault_class: null, mission_shape: null, duration_s: null, n_rows: null }), samples: [] };

      startReplay(targetRunId, speed)
        .then(({ session_id }) => {
          sessionIdRef.current = session_id;
          setSessionId(session_id);
          setPhase("running");

          stopPolling();
          pollRef.current = setInterval(async () => {
            try {
              const [nextStatus, nextFrame, nextHealth] = await Promise.all([
                getReplayStatus(session_id),
                getLatestFrame(session_id).catch((err) => {
                  if (err instanceof ApiError && err.status === 404) return null;
                  throw err;
                }),
                getLatestHealthScore(session_id).catch((err) => {
                  if (err instanceof ApiError && err.status === 404) return null;
                  throw err;
                }),
              ]);
              setStatus(nextStatus);
              if (nextFrame !== null) {
                setFrame(nextFrame);
                historyRef.current.samples.push({ t: nextFrame.t, frame: nextFrame, health: nextHealth });
              }
              if (nextHealth !== null) {
                setHealth(nextHealth);
                latestHealthRef.current = nextHealth;
                // Sample RUL every poll tick (1s) -- driven by the poll's own
                // response, not a second independent timer, so the two never drift.
                setRulHistory((prev) => {
                  const next: RulSample[] = [
                    ...prev,
                    { sampledAt: Date.now(), t: nextHealth.t, rulEstimateHours: nextHealth.rul_estimate_hours },
                  ];
                  const trimmed = next.length > RUL_HISTORY_MAX_POINTS ? next.slice(next.length - RUL_HISTORY_MAX_POINTS) : next;
                  rulHistoryRef.current = trimmed;
                  return trimmed;
                });
              }
              if (nextStatus.status === "finished" || nextStatus.status === "error" || nextStatus.status === "stopped") {
                stopPolling();
                finalizeRun(nextStatus.status);
                // The session ended on its own (preset ran to completion, or
                // the backend hit an error) -- nothing else drives phase back
                // out of "running" in that case, unlike the user-initiated
                // stop() path below, which already does this. Without this,
                // the transport bar/Stop button/REPLAY-RUNNING indicator all
                // keep showing a live session forever after a preset finishes.
                sessionIdRef.current = null;
                setSessionId(null);
                setPhase(nextStatus.status === "error" ? "error" : "idle");
                if (nextStatus.status === "error") {
                  setErrorMessage(nextStatus.error ?? "replay session ended with an error");
                }
              }
            } catch (err) {
              stopPolling();
              finalizeRun("error");
              sessionIdRef.current = null;
              setSessionId(null);
              setPhase("error");
              setErrorMessage(err instanceof Error ? err.message : String(err));
            }
          }, POLL_INTERVAL_MS);
        })
        .catch((err) => {
          setPhase("error");
          setErrorMessage(err instanceof Error ? err.message : String(err));
        });
    },
    [selectedRunId, speed, stopPolling, finalizeRun],
  );

  const stop = useCallback(() => {
    stopPolling();
    const currentSessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setSessionId(null);
    setStatus(null);
    setPhase("idle");
    finalizeRun("stopped");
    if (currentSessionId) {
      stopReplay(currentSessionId).catch(() => {
        // best-effort -- the session's own status poll would have surfaced a real failure already
      });
    }
  }, [stopPolling, finalizeRun]);

  const selectAndStart = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      start(runId);
    },
    [start],
  );

  return {
    phase,
    errorMessage,
    runs,
    selectedRunId,
    setSelectedRunId,
    speed,
    setSpeed,
    sessionId,
    status,
    frame,
    health,
    rulHistory,
    lastCompletedRun,
    start,
    stop,
    selectAndStart,
  };
}

// Friendly names for the curated demo presets in data/sample_runs/ (see
// data/sample_runs/README.md's preset table) -- falls back to fault_class/
// run_id for any run that isn't one of the named presets (e.g. the raw
// single-fault UNIT-* fixtures).
const PRESET_LABELS: Record<string, string> = {
  "PRESET-healthy-standard": "Healthy: Standard Mission",
  "PRESET-healthy-hotday": "Healthy: Hot-Day Extreme Ops",
  "PRESET-injector-fouling-c1": "Injector Fouling (C1)",
  "PRESET-bearing-wear": "Bearing Wear",
  "PRESET-fuel-starvation": "Fuel Starvation",
  "PRESET-oil-pump-degradation": "Oil Pump Degradation",
  "PRESET-egt-sensor-drift": "EGT Sensor Drift (Engine Healthy)",
  "PRESET-confusable-pair": "Confusable Pair",
  "PRESET-cascading-failure": "Cascading Failure",
  "PRESET-dual-independent-faults": "Dual Independent Faults",
};

export function presetLabel(run: RunSummary): string {
  const name = PRESET_LABELS[run.run_id];
  if (name) return name;
  return `${run.fault_class ?? run.run_id} (${run.run_id})`;
}

/** The four demo-preset categories, in display order -- matches the preset
 * table's grouping (2 healthy / 4 single-fault / 1 sensor-fault / 3 combined). */
export const PRESET_CATEGORIES = ["Healthy Run", "Single Fault", "Sensor Fault", "Combined Fault", "Other"] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

const PRESET_CATEGORY_BY_RUN_ID: Record<string, PresetCategory> = {
  "PRESET-healthy-standard": "Healthy Run",
  "PRESET-healthy-hotday": "Healthy Run",
  "PRESET-injector-fouling-c1": "Single Fault",
  "PRESET-bearing-wear": "Single Fault",
  "PRESET-fuel-starvation": "Single Fault",
  "PRESET-oil-pump-degradation": "Single Fault",
  "PRESET-egt-sensor-drift": "Sensor Fault",
  "PRESET-confusable-pair": "Combined Fault",
  "PRESET-cascading-failure": "Combined Fault",
  "PRESET-dual-independent-faults": "Combined Fault",
};

/** Category for any run not in the curated preset table (e.g. the raw
 * single-fault UNIT-* fixtures) -- grouped under "Other" rather than
 * guessed into one of the four curated categories. */
export function presetCategory(run: RunSummary): PresetCategory {
  return PRESET_CATEGORY_BY_RUN_ID[run.run_id] ?? "Other";
}
