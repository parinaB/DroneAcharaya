"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  barLabel,
  celsiusLabel,
  faultTypeLabel,
  gLabel,
  hms,
  hoursLabel,
  kgPerHourLabel,
  kPaLabel,
  oatLabel,
  rpmLabel,
} from "../_lib/format";
import { cardTabStyle, color, font, glowVars, tabStyle } from "../_lib/tokens";
import { type XaiTab } from "../_lib/state";
import { PRESET_CATEGORIES, isRulDeclining, presetCategory, presetLabel, type PresetCategory, type ReplaySession } from "../_lib/useReplaySession";
import type { RunSummary } from "../../../lib/types";
import { EngineScene } from "../../../components/EngineScene/EngineScene";
import { RulChart } from "./RulChart";

const SPEEDS = [1, 2, 5, 10] as const;
const XAI_TABS: { key: XaiTab; label: string }[] = [
  { key: "drivers", label: "Signals" },
  { key: "reasoning", label: "Summary" },
];

/** health_index is 0-100, 100 = perfectly healthy. Below this value the UI
 * treats the engine as unhealthy (red); at or above it, healthy (green) --
 * a value-based rule, independent of whatever fault_type the model reports. */
const HEALTH_INDEX_DANGER_THRESHOLD = 70;

function isHealthCritical(healthIndex: number | null | undefined): boolean {
  return healthIndex !== null && healthIndex !== undefined && healthIndex < HEALTH_INDEX_DANGER_THRESHOLD;
}

export interface SimulationViewProps {
  session: ReplaySession;
  xai: XaiTab;
  onXaiChange: (xai: XaiTab) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Navigates to the Analytics screen -- offered once a run has completed. */
  onGoToAnalytics: () => void;
}

export function SimulationView({ session, xai, onXaiChange, fullscreen, onToggleFullscreen, onGoToAnalytics }: SimulationViewProps) {
  return (
    <div
      style={{
        flex: "1 1 auto",
        display: "grid",
        gridTemplateColumns: "258px minmax(0, 1fr) 300px",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <PresetPanel session={session} />
      <Viewport session={session} fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen} onGoToAnalytics={onGoToAnalytics} />
      <TelemetryPanel session={session} xai={xai} onXaiChange={onXaiChange} />
    </div>
  );
}

function PresetPanel({ session }: { session: ReplaySession }) {
  const { runs, selectedRunId, selectAndStart, phase, status } = session;
  const disabled = phase === "starting";

  const runsByCategory = useMemo(() => {
    const grouped = new Map<PresetCategory, RunSummary[]>();
    for (const run of runs) {
      const cat = presetCategory(run);
      const list = grouped.get(cat) ?? [];
      list.push(run);
      grouped.set(cat, list);
    }
    return grouped;
  }, [runs]);

  // Accordion: at most one category open at a time. The category containing
  // the currently selected run starts expanded; opening another closes it.
  const [openCategory, setOpenCategory] = useState<PresetCategory | null>(
    () => (runs.length > 0 ? presetCategory(runs[0]) : null),
  );
  const toggleCategory = (cat: PresetCategory) => {
    setOpenCategory((prev) => (prev === cat ? null : cat));
  };

  return (
    <div
      style={{
        borderRight: `1px solid ${color.border}`,
        background: color.panelBg,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "22px 18px 28px 18px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "0 0 auto" }}>
        <SectionLabel>PRESET</SectionLabel>
        {phase === "loading_runs" && (
          <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textFaint }}>Loading presets…</div>
        )}
        {phase === "no_runs" && (
          <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textFaint, lineHeight: 1.5 }}>
            No runs available -- data/sample_runs/ is empty.
          </div>
        )}
        {PRESET_CATEGORIES.map((cat) => {
          const catRuns = runsByCategory.get(cat);
          if (!catRuns || catRuns.length === 0) return null;
          const isOpen = openCategory === cat;
          return (
            <div key={cat} style={{ display: "flex", flexDirection: "column", gap: isOpen ? 8 : 0 }}>
              <div
                onClick={() => toggleCategory(cat)}
                className="dt-tab"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  borderRadius: 7,
                  cursor: "pointer",
                  background: color.wellBg,
                  border: `1px solid ${color.border}`,
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: color.text }}>
                  {cat} ({catRuns.length})
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}>
                  ▶
                </span>
              </div>
              {isOpen &&
                catRuns.map((run) => {
                  const active = run.run_id === selectedRunId;
                  const t = cardTabStyle(active);
                  const critical = run.fault_class !== null && run.fault_class !== "healthy";
                  return (
                    <div
                      key={run.run_id}
                      onClick={() => !disabled && selectAndStart(run.run_id)}
                      className="dt-tab dt-scenario-card"
                      style={{
                        padding: "12px 14px",
                        marginLeft: 6,
                        borderRadius: 9,
                        cursor: disabled ? "default" : "pointer",
                        opacity: disabled && !active ? 0.5 : 1,
                        background: t.bg,
                        boxShadow: t.ring,
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: critical ? color.danger : color.accent,
                            flex: "0 0 auto",
                          }}
                        />
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.fg }}>{presetLabel(run)}</div>
                      </div>
                      <div style={{ fontFamily: font.mono, fontSize: 10.5, color: active ? color.textMuted : color.textLabel }}>
                        {run.mission_shape ?? "—"} · {run.duration_s !== null ? `${run.duration_s.toFixed(0)}s` : "—"}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 18, display: "flex", flexDirection: "column", gap: 10, flex: "0 0 auto" }}>
        <div style={{ display: "flex", gap: 2, padding: 3, background: color.wellBg, border: `1px solid ${color.border}`, borderRadius: 7 }}>
          {SPEEDS.map((s) => {
            const st = tabStyle(session.speed === s);
            return (
              <div
                key={s}
                onClick={() => !disabled && session.setSpeed(s)}
                className="dt-tab"
                style={{
                  flex: "1 1 0",
                  textAlign: "center",
                  padding: "6px 4px",
                  borderRadius: 4,
                  fontFamily: font.mono,
                  fontSize: 11,
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  background: st.bg,
                  color: st.fg,
                }}
              >
                {s}×
              </div>
            );
          })}
        </div>
        {phase === "running" ? (
          <button onClick={session.stop} style={sessionButtonStyle}>
            Stop session
          </button>
        ) : (
          <button
            onClick={() => session.start()}
            disabled={phase === "loading_runs" || phase === "starting" || !selectedRunId}
            style={sessionButtonStyle}
          >
            {phase === "starting" ? "Starting…" : "Restart selected preset"}
          </button>
        )}
        {phase === "error" && (
          <div style={{ fontFamily: font.mono, fontSize: 11, color: color.danger, lineHeight: 1.5 }}>{session.errorMessage}</div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 18, display: "flex", flexDirection: "column", gap: 8, flex: "0 0 auto" }}>
        <SectionLabel>TWIN SYNC</SectionLabel>
        <SyncRow label="SESSION" value={status?.status ?? (phase === "running" ? "starting" : "idle")} />
        <SyncRow label="FRAMES WRITTEN" value={status?.frames_written?.toString() ?? "0"} />
        <SyncRow label="MODEL" value="lstm_rul + xgboost + autoencoder" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel2, letterSpacing: "0.13em" }}>
      {children}
    </div>
  );
}

function SyncRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: font.mono, fontSize: 11.5, color: color.textLabel }}>
      <span>{label}</span>
      <span style={{ color: color.accent, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Viewport({
  session,
  fullscreen,
  onToggleFullscreen,
  onGoToAnalytics,
}: {
  session: ReplaySession;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onGoToAnalytics: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { phase, status, health, lastCompletedRun } = session;
  const running = phase === "running";
  // The button appears once a run has finished (lastCompletedRun exists) and
  // no other run is currently starting/playing -- otherwise it would show the
  // PREVIOUS run's "complete" banner while a new one is actively in progress.
  const showAnalyticsButton = lastCompletedRun !== null && !running && phase !== "starting";
  const durationS = session.runs.find((r) => r.run_id === session.selectedRunId)?.duration_s ?? null;
  const t = status?.last_t ?? 0;
  const pct = durationS ? Math.min(100, (t / durationS) * 100) : 0;

  const handleToggleFullscreen = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    onToggleFullscreen();
  }, [onToggleFullscreen]);

  const isFaulted = isHealthCritical(health?.health_index);

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div
        ref={viewportRef}
        style={{
          flex: "1 1 auto",
          margin: "18px 18px 0 18px",
          borderRadius: 11,
          border: "1px solid #1f252a",
          background: "#090b0d",
          position: "relative",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <EngineScene sessionId={session.sessionId} />
        </div>

        <div style={{ position: "absolute", top: 13, right: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <div
            onClick={handleToggleFullscreen}
            className="dt-btn-ghost"
            style={{
              width: 28,
              height: 27,
              borderRadius: 4,
              border: "1px solid #232a2f",
              background: "rgba(11,13,15,.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <div style={{ width: 11, height: 9, border: "1.5px solid #b8c0c6", borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <HudTile label="ANOMALY SCORE" value={health?.anomaly_score !== null && health?.anomaly_score !== undefined ? health.anomaly_score.toFixed(4) : "—"} danger={health?.is_anomalous === true} />
          <HudTile label="ANOMALOUS" value={health?.is_anomalous === null || health?.is_anomalous === undefined ? "—" : health.is_anomalous ? "YES" : "NO"} danger={health?.is_anomalous === true} />
          <HudTile label="HEALTH SCORE" value={health ? `${health.health_index.toFixed(1)} / 100` : "—"} danger={isHealthCritical(health?.health_index)} />
          <HudTile label="TIME" value={`${t.toFixed(1)} s`} />
        </div>
      </div>

      <div
        style={{
          flex: "0 0 auto",
          margin: "14px 18px 18px 18px",
          padding: "14px 16px",
          borderRadius: 11,
          background: color.panelBgAlt,
          border: `1px solid ${color.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: running ? color.accent : color.textFaint,
              flex: "0 0 auto",
            }}
            className={running ? "dt-pulse" : undefined}
          />
          <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textLabel }}>
            {session.selectedRunId || "no preset selected"}
          </div>
          <div style={{ flex: "1 1 auto" }} />
          <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textLabel }}>
            T+{hms(Math.round(t))} / {durationS !== null ? hms(Math.round(durationS)) : "--:--:--"}
          </div>
        </div>

        <div
          style={{ position: "relative", height: 16, borderRadius: 7, background: "#0d1013", border: "1px solid #1f252a", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: isFaulted ? "rgba(255,77,61,.35)" : "rgba(79,179,145,.35)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: color.text, left: `${pct}%` }} />
        </div>

        {showAnalyticsButton && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: font.mono, fontSize: 11.5, color: isFaulted ? color.dangerSoft : color.accent }}>
              Run complete{lastCompletedRun ? ` -- ${lastCompletedRun.finalStatus}` : ""}. Full analysis is ready.
            </span>
            <button
              type="button"
              onClick={onGoToAnalytics}
              className="dt-btn-ghost"
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: `1px solid ${isFaulted ? color.danger : color.accentDim}`,
                background: "transparent",
                color: isFaulted ? color.danger : color.accent,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              View in Analytics →
            </button>
          </div>
        )}
      </div>

      <RulPanel health={session.health} history={session.rulHistory} />
    </div>
  );
}

function RulPanel({ health, history }: { health: ReplaySession["health"]; history: ReplaySession["rulHistory"] }) {
  const rul = health?.rul_estimate_hours ?? null;
  const declining = isRulDeclining(history);

  return (
    <div
      style={{
        flex: "0 0 auto",
        margin: "0 18px 18px 18px",
        padding: "16px 18px",
        borderRadius: 11,
        background: color.panelBgAlt,
        border: `1px solid ${color.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel2, letterSpacing: "0.13em" }}>
          PREDICTED REMAINING USEFUL LIFE · UPDATES EVERY 1S
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>
          {health ? `${health.source}${health.model_version ? ` · ${health.model_version}` : ""}` : "no session"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontFamily: font.mono, fontSize: 40, fontWeight: 700, lineHeight: 1, color: declining ? color.danger : color.accent }}>
          {hoursLabel(rul)}
        </span>
        {health && (
          <span style={{ fontFamily: font.mono, fontSize: 13, color: color.textLabel }}>
            {faultTypeLabel(health.fault_type)} · health {health.health_index.toFixed(1)}/100
          </span>
        )}
      </div>
      <RulChart history={history} height={160} />
    </div>
  );
}

function HudTile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      style={{
        minWidth: 76,
        padding: "8px 11px",
        borderRadius: 5,
        background: danger ? "rgba(24,14,13,.9)" : "rgba(11,13,15,.88)",
        border: danger ? "1px solid #3d1f1c" : "1px solid #232a2f",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.1em" }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 600, color: danger ? color.danger : color.accent }}>
        {value}
      </span>
    </div>
  );
}

function TelemetryPanel({ session, xai, onXaiChange }: { session: ReplaySession; xai: XaiTab; onXaiChange: (xai: XaiTab) => void }) {
  const { frame, health } = session;

  return (
    <div style={{ borderLeft: `1px solid ${color.border}`, background: color.panelBg, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 18px 18px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 10, flex: "0 0 auto" }}>
        <SectionLabel>ENVIRONMENT</SectionLabel>
        <SyncRowLight label="OAT" value={oatLabel(frame?.ambient_temperature)} />
        <SyncRowLight label="ALTITUDE" value={frame ? `${frame.altitude.toFixed(0)} m` : "—"} />
        <SyncRowLight label="THROTTLE" value={frame ? `${(frame.throttle * 100).toFixed(0)}%` : "—"} />
        <SyncRowLight label="ENGINE STATE" value={frame?.engine_state ?? "—"} />
      </div>

      <div style={{ padding: "20px 18px 18px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
        <SectionLabel>LIVE CHANNELS</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ChannelTile label="RPM" value={rpmLabel(frame?.rpm)} />
          <ChannelTile label="MAP" value={kPaLabel(frame?.map)} />
          <ChannelTile label="OIL PRESS" value={barLabel(frame?.oil_pressure)} danger={health?.fault_type === "lubrication_degradation"} />
          <ChannelTile label="OIL TEMP" value={celsiusLabel(frame?.oil_temperature)} />
          <ChannelTile label="FUEL FLOW" value={kgPerHourLabel(frame?.fuel_flow)} />
          <ChannelTile
            label="VIB (BEARING)"
            value={gLabel(frame?.vibration_rms_x_bearing_proxy)}
            danger={health?.fault_type === "mechanical_vibration"}
          />
        </div>
      </div>

      <div style={{ padding: "20px 18px 18px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>PREDICTED FAULT</SectionLabel>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>
            {health ? `${health.source}${health.model_version ? ` · ${health.model_version}` : ""}` : "—"}
          </span>
        </div>
        <PredictedFaultCard health={health} />
      </div>

      <div style={{ padding: "20px 18px 28px 18px", display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
        <SectionLabel>WHY</SectionLabel>
        <div style={{ display: "flex", gap: 2, padding: 3, background: color.wellBg, border: `1px solid ${color.border}`, borderRadius: 7 }}>
          {XAI_TABS.map(({ key, label }) => {
            const t = tabStyle(xai === key);
            return (
              <div
                key={key}
                onClick={() => onXaiChange(key)}
                className="dt-tab"
                style={{
                  flex: "1 1 0",
                  textAlign: "center",
                  padding: "6px 4px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: t.bg,
                  color: t.fg,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {xai === "drivers" && <XaiSignals health={health} />}
        {xai === "reasoning" && <XaiSummary health={health} />}
      </div>
    </div>
  );
}

function PredictedFaultCard({ health }: { health: ReplaySession["health"] }) {
  if (!health) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          padding: "12px 14px",
          border: `1px solid ${color.border}`,
          background: color.panelBgAlt,
        }}
      >
        <span style={{ fontSize: 12.5, color: color.textFaint }}>No session running</span>
      </div>
    );
  }

  // Predicted Fault is a name, not a score -- any fault_type other than
  // "none" (healthy) is red here, regardless of health_index/RUL.
  const isHealthy = health.fault_type === "none";
  const rulColor = health.rul_estimate_hours !== null && health.rul_estimate_hours < 24 ? color.danger : color.text;

  return (
    <div
      className="dt-glow-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "12px 14px",
        border: `1px solid ${color.border}`,
        background: color.panelBgAlt,
        ...glowVars(!isHealthy),
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: isHealthy ? color.accent : color.dangerSoft }}>
          {faultTypeLabel(health.fault_type)}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12.5, fontWeight: 600, color: rulColor }}>
          {hoursLabel(health.rul_estimate_hours)}
        </span>
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>
        HEALTH {health.health_index.toFixed(1)} / 100 · CONF {(health.fault_probability * 100).toFixed(1)}%
        {health.forecast_horizon_s > 0 ? ` · +${health.forecast_horizon_s}s FORECAST` : ""}
      </div>
    </div>
  );
}

function SyncRowLight({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>
      <span>{label}</span>
      <span style={{ color: color.text }}>{value}</span>
    </div>
  );
}

function ChannelTile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className="dt-glow-card"
      style={{
        background: color.panelBgAlt,
        border: `1px solid ${color.border}`,
        padding: "10px 11px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        ...glowVars(!!danger),
      }}
    >
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.09em" }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: danger ? color.danger : color.accent }}>
        {value}
      </span>
    </div>
  );
}

function XaiSignals({ health }: { health: ReplaySession["health"] }) {
  if (!health) {
    return <div style={{ fontSize: 12, color: color.textFaint }}>No session running.</div>;
  }

  const rows = [
    {
      label: "Sensor fault: CHT C3",
      value: health.sensor_fault_cht_c3 ?? "—",
      flagged: health.sensor_fault_cht_c3 !== null && health.sensor_fault_cht_c3 !== "NONE",
    },
    {
      label: "Sensor fault: bearing vibration",
      value: health.sensor_fault_bearing_vibration ?? "—",
      flagged: health.sensor_fault_bearing_vibration !== null && health.sensor_fault_bearing_vibration !== "NONE",
    },
    {
      label: "Anomaly score (autoencoder)",
      value: health.anomaly_score !== null ? health.anomaly_score.toFixed(4) : "—",
      flagged: health.is_anomalous === true,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 70px",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
            color: color.textDim,
            padding: "7px 0",
            borderBottom: i < rows.length - 1 ? `1px solid ${color.borderSoft}` : undefined,
          }}
        >
          <span>{r.label}</span>
          <span style={{ fontFamily: font.mono, textAlign: "right", color: r.flagged ? color.danger : color.text }}>{r.value}</span>
        </div>
      ))}
      <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel3 }}>
        xgboost_classifier ({health.sensor_fault_model_version ?? "—"}) + autoencoder ({health.anomaly_model_version ?? "—"})
      </div>
    </div>
  );
}

function XaiSummary({ health }: { health: ReplaySession["health"] }) {
  if (!health) {
    return <div style={{ fontSize: 12, color: color.textFaint }}>No session running.</div>;
  }

  const faulted = health.fault_type !== "none" && health.fault_type !== "unknown";
  const sensorFlags: string[] = [];
  if (health.sensor_fault_cht_c3 && health.sensor_fault_cht_c3 !== "NONE") sensorFlags.push(`CHT C3 sensor fault (${health.sensor_fault_cht_c3})`);
  if (health.sensor_fault_bearing_vibration && health.sensor_fault_bearing_vibration !== "NONE") {
    sensorFlags.push(`bearing-vibration sensor fault (${health.sensor_fault_bearing_vibration})`);
  }

  const summary = faulted
    ? `${faultTypeLabel(health.fault_type)} detected with ${(health.fault_probability * 100).toFixed(0)}% confidence. Health index at ${health.health_index.toFixed(1)}/100${
        health.rul_estimate_hours !== null ? `, estimated remaining useful life ${hoursLabel(health.rul_estimate_hours)}` : ""
      }.`
    : `No physical fault detected -- health index ${health.health_index.toFixed(1)}/100.`;

  const sensorNote =
    sensorFlags.length > 0
      ? ` Independently, xgboost_classifier flags ${sensorFlags.join(" and ")} -- ${
          faulted ? "reported separately from the physical fault above, not merged into it." : "a sensor issue, not a physical engine fault."
        }`
      : "";

  const anomalyNote =
    health.is_anomalous === true
      ? ` The autoencoder also flags this frame as anomalous (reconstruction error ${health.anomaly_score?.toFixed(4) ?? "—"}).`
      : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: color.textDim, lineHeight: 1.62, textWrap: "pretty" }}>
        {summary}
        {sensorNote}
        {anomalyNote}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${color.borderSoft}`, paddingTop: 12 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel3, letterSpacing: "0.1em" }}>
          SOURCE
        </span>
        <span style={{ fontSize: 12.5, color: color.text, lineHeight: 1.55 }}>
          {health.source === "model"
            ? `lstm_rul (${health.model_version ?? "unknown version"}) once the session's rolling window filled.`
            : "Ground-truth stand-in -- the session's rolling window hasn't filled yet, or no model artifact is loaded."}
        </span>
      </div>
    </div>
  );
}

const sessionButtonStyle: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 12,
  fontWeight: 600,
  padding: "9px 12px",
  borderRadius: 6,
  border: `1px solid ${color.border}`,
  background: color.tabOnBg,
  color: color.text,
  cursor: "pointer",
  width: "100%",
};
