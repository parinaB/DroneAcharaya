"use client";

/**
 * Real backend data, clearly separated from LiveDashboard's mock UI (which
 * has no per-cylinder/per-subsystem backend equivalent yet -- see
 * ml/artifacts/lstm_rul/v1's README for what the model actually outputs:
 * one health_index scalar, one fault_type, one RUL estimate).
 *
 * Starts a replay session against a run_id, then polls /inference/latest
 * and /replay/{session_id}/status. source flips from "ground_truth" to
 * "model" once the session's rolling window fills (~59 frames in) and
 * lstm_rul's health+RUL heads take over -- see HealthScoreOut's
 * forecast_horizon_s for whether a reading is "as of now" (0s) or a
 * forecast (60s ahead, for the model path). sensor_fault_cht_c3/
 * sensor_fault_bearing_vibration come from xgboost_classifier separately
 * (fills in ~10 frames in, well before lstm_rul's fields do) and use a
 * DIFFERENT class vocabulary from fault_type -- never conflated in this UI.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getLatestHealthScore,
  getReplayStatus,
  listRuns,
  startReplay,
  stopReplay,
} from "../../../lib/api-client";
import type { HealthScoreOut, RunSummary, SessionStatusOut } from "../../../lib/types";
import { color, font } from "../_lib/tokens";

const POLL_INTERVAL_MS = 1000;

type PanelState =
  | { phase: "idle" }
  | { phase: "loading_runs" }
  | { phase: "no_runs" }
  | { phase: "starting"; runId: string }
  | { phase: "running"; runId: string; sessionId: string }
  | { phase: "error"; message: string };

export function LiveModelPanel() {
  const [state, setState] = useState<PanelState>({ phase: "idle" });
  const [status, setStatus] = useState<SessionStatusOut | null>(null);
  const [health, setHealth] = useState<HealthScoreOut | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(async () => {
    setState({ phase: "loading_runs" });
    try {
      const runs = await listRuns();
      if (runs.length === 0) {
        setState({ phase: "no_runs" });
        return;
      }
      const run: RunSummary = runs[0];
      setState({ phase: "starting", runId: run.run_id });
      const { session_id } = await startReplay(run.run_id, 10.0);
      setState({ phase: "running", runId: run.run_id, sessionId: session_id });

      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const [nextStatus, nextHealth] = await Promise.all([
            getReplayStatus(session_id),
            getLatestHealthScore(session_id).catch((err) => {
              // 404 until the first score lands -- not a real error.
              if (err instanceof ApiError && err.status === 404) return null;
              throw err;
            }),
          ]);
          setStatus(nextStatus);
          if (nextHealth !== null) setHealth(nextHealth);
          if (nextStatus.status === "finished" || nextStatus.status === "error" || nextStatus.status === "stopped") {
            stopPolling();
          }
        } catch (err) {
          stopPolling();
          setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [stopPolling]);

  const stop = useCallback(async () => {
    if (state.phase !== "running") return;
    stopPolling();
    try {
      await stopReplay(state.sessionId);
    } catch {
      // best-effort -- the session's own status poll would have surfaced a real failure already
    }
    setState({ phase: "idle" });
    setStatus(null);
    setHealth(null);
  }, [state, stopPolling]);

  return (
    <section
      style={{
        margin: "16px 24px",
        padding: 16,
        borderRadius: 8,
        background: color.panelBg,
        border: `1px solid ${color.border}`,
        fontFamily: font.mono,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ color: color.textLabel, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Live model output (lstm_rul + xgboost_classifier)
        </span>
        {state.phase === "running" ? (
          <button onClick={stop} style={buttonStyle}>
            Stop session
          </button>
        ) : (
          <button onClick={start} disabled={state.phase === "loading_runs" || state.phase === "starting"} style={buttonStyle}>
            {state.phase === "loading_runs" || state.phase === "starting" ? "Starting…" : "Start replay session"}
          </button>
        )}
      </div>

      {state.phase === "idle" && (
        <p style={{ color: color.textMuted, margin: 0 }}>
          No session running. Start one to see real health_index/fault_type/RUL from a replayed run.
        </p>
      )}
      {state.phase === "no_runs" && (
        <p style={{ color: color.textMuted, margin: 0 }}>
          No runs available to replay -- data/sample_runs/ is empty. See that folder&apos;s README.
        </p>
      )}
      {state.phase === "error" && (
        <p style={{ color: color.danger, margin: 0 }}>Error: {state.message}</p>
      )}

      {(state.phase === "starting" || state.phase === "running") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <Field label="Run" value={state.phase === "running" ? state.runId : state.runId} />
          <Field label="Session status" value={status?.status ?? "starting"} />
          <Field label="Frames written" value={status?.frames_written?.toString() ?? "0"} />
          <Field label="Mission t" value={status?.last_t !== null && status?.last_t !== undefined ? `${status.last_t.toFixed(1)}s` : "—"} />

          <Field label="Health index" value={health ? `${health.health_index.toFixed(1)} / 100` : "—"} highlight={health !== null && health.health_index < 70} />
          <Field label="Fault type" value={health?.fault_type ?? "—"} highlight={health !== null && health.fault_type !== "none"} />
          <Field
            label="RUL estimate"
            value={health?.rul_estimate_hours !== null && health?.rul_estimate_hours !== undefined ? `${(health.rul_estimate_hours * 60).toFixed(1)} min` : "—"}
          />
          <Field label="Health/RUL source" value={health ? `${health.source}${health.model_version ? ` (${health.model_version})` : ""}` : "—"} />

          <Field
            label="Sensor fault — CHT C3"
            value={health?.sensor_fault_cht_c3 ?? "—"}
            highlight={health?.sensor_fault_cht_c3 !== null && health?.sensor_fault_cht_c3 !== undefined && health.sensor_fault_cht_c3 !== "NONE"}
          />
          <Field
            label="Sensor fault — bearing vibration"
            value={health?.sensor_fault_bearing_vibration ?? "—"}
            highlight={
              health?.sensor_fault_bearing_vibration !== null &&
              health?.sensor_fault_bearing_vibration !== undefined &&
              health.sensor_fault_bearing_vibration !== "NONE"
            }
          />
          <Field label="Sensor-fault source" value={health?.sensor_fault_model_version ?? "—"} />
          <div />
        </div>
      )}

      {health && health.forecast_horizon_s > 0 && (
        <p style={{ color: color.textFaint, marginTop: 12, marginBottom: 0 }}>
          Health/RUL forecast: describes engine state {health.forecast_horizon_s}s ahead of t={health.t.toFixed(1)}s, not the current instant.
          Sensor-fault fields (xgboost_classifier) describe t itself.
        </p>
      )}
    </section>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ color: color.textLabel2, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: highlight ? color.danger : color.text, fontSize: 14 }}>{value}</div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  padding: "6px 12px",
  borderRadius: 4,
  border: `1px solid ${color.border}`,
  background: color.tabOnBg,
  color: color.text,
  cursor: "pointer",
};
