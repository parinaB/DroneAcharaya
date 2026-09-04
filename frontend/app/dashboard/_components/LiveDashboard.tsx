"use client";

/**
 * Post-run analytics for the most recently completed (or stopped) replay
 * session -- see useReplaySession's CompletedRunSummary. Every panel here is
 * derived from real samples collected while that run played (frame + health
 * history); nothing is fabricated. Before any run has completed this
 * session, the whole page is a single empty state pointing at the
 * Simulation/Digital Twin screen.
 */

import { celsiusLabel, faultTypeLabel, hoursLabel } from "../_lib/format";
import { color, font, glowVars } from "../_lib/tokens";
import type { CompletedRunSummary } from "../_lib/useReplaySession";
import type { MaintenanceRecommendation, MaintenanceUrgency, SensorFaultRecommendation } from "../../../lib/types";

const PANEL_WIDTH = 420;

export interface LiveDashboardProps {
  lastCompletedRun: CompletedRunSummary | null;
  acknowledged: boolean;
  onAcknowledge: () => void;
}

export function LiveDashboard({ lastCompletedRun, acknowledged, onAcknowledge }: LiveDashboardProps) {
  if (!lastCompletedRun) {
    return <EmptyState />;
  }

  const analysis = analyzeRun(lastCompletedRun);

  return (
    <div
      style={{
        flex: "1 1 auto",
        overflowY: "auto",
        padding: "0 0 40px 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CriticalFaultSection run={lastCompletedRun} analysis={analysis} acknowledged={acknowledged} onAcknowledge={onAcknowledge} />
      <QuickStatsSection analysis={analysis} />
      <DetailSection analysis={analysis} />
      <MaintenanceSection run={lastCompletedRun} />
      <BottomSection run={lastCompletedRun} analysis={analysis} />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: "1 1 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No completed run yet</div>
        <div style={{ fontSize: 13.5, color: color.textMuted, lineHeight: 1.6 }}>
          Analytics summarizes the most recently completed replay session -- start and finish (or stop) a preset on
          the Simulation / Digital Twin page to see real telemetry, health, and fault analysis here.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis: turn a CompletedRunSummary's raw samples into the numbers every
// panel below needs. All real, derived from actual frame/health readings
// collected while the run played -- nothing here is invented.
// ---------------------------------------------------------------------------

interface CylinderStats {
  label: string;
  chtField: "cht_c1" | "cht_c2" | "cht_c3" | "cht_c4";
  egtField: "egt_c1" | "egt_c2" | "egt_c3" | "egt_c4";
  maxCht: number;
  maxEgt: number;
  finalCht: number;
  finalEgt: number;
}

interface AnomalyEvent {
  t: number;
  title: string;
  detail: string;
}

interface RunAnalysis {
  finalHealthIndex: number | null;
  finalFaultType: string | null;
  finalFaultProbability: number | null;
  finalRulHours: number | null;
  isHealthy: boolean;
  finalRpm: number | null;
  finalMap: number | null;
  throttlePct: number | null;
  durationS: number;
  cylinders: CylinderStats[];
  chtSpread: number | null;
  maxVibrationBearing: number | null;
  vibrationSeries: { t: number; v: number }[];
  anomalousFrameCount: number;
  totalFrameCount: number;
  anomalyPct: number;
  sensorFaultChtC3Events: number;
  sensorFaultBearingEvents: number;
  events: AnomalyEvent[];
}

const CYLINDER_FIELDS: { label: string; chtField: CylinderStats["chtField"]; egtField: CylinderStats["egtField"] }[] = [
  { label: "CYL 1", chtField: "cht_c1", egtField: "egt_c1" },
  { label: "CYL 2", chtField: "cht_c2", egtField: "egt_c2" },
  { label: "CYL 3", chtField: "cht_c3", egtField: "egt_c3" },
  { label: "CYL 4", chtField: "cht_c4", egtField: "egt_c4" },
];

function analyzeRun(run: CompletedRunSummary): RunAnalysis {
  const { samples } = run;
  const lastSample = samples[samples.length - 1];
  const finalHealth = run.finalHealth;

  const cylinders: CylinderStats[] = CYLINDER_FIELDS.map(({ label, chtField, egtField }) => {
    let maxCht = -Infinity;
    let maxEgt = -Infinity;
    for (const s of samples) {
      maxCht = Math.max(maxCht, s.frame[chtField]);
      maxEgt = Math.max(maxEgt, s.frame[egtField]);
    }
    return {
      label,
      chtField,
      egtField,
      maxCht,
      maxEgt,
      finalCht: lastSample.frame[chtField],
      finalEgt: lastSample.frame[egtField],
    };
  });
  const chtValues = cylinders.map((c) => c.finalCht);
  const chtSpread = chtValues.length > 0 ? Math.max(...chtValues) - Math.min(...chtValues) : null;

  const vibrationSeries = samples
    .filter((s) => s.frame.vibration_rms_x_bearing_proxy !== null && s.frame.vibration_rms_x_bearing_proxy !== undefined)
    .map((s) => ({ t: s.t, v: s.frame.vibration_rms_x_bearing_proxy }));
  const maxVibrationBearing = vibrationSeries.length > 0 ? Math.max(...vibrationSeries.map((v) => v.v)) : null;

  const anomalousFrameCount = samples.filter((s) => s.health?.is_anomalous === true).length;
  const totalFrameCount = samples.length;

  const events: AnomalyEvent[] = [];
  let lastFaultType: string | null = null;
  let lastChtC3 = "NONE";
  let lastBearing = "NONE";
  let sensorFaultChtC3Events = 0;
  let sensorFaultBearingEvents = 0;
  for (const s of samples) {
    const h = s.health;
    if (!h) continue;
    if (h.fault_type !== "none" && h.fault_type !== lastFaultType) {
      events.push({ t: s.t, title: `${faultTypeLabel(h.fault_type)} detected`, detail: `health index ${h.health_index.toFixed(1)}/100 at t=${s.t.toFixed(1)}s` });
    }
    lastFaultType = h.fault_type;
    if (h.sensor_fault_cht_c3 && h.sensor_fault_cht_c3 !== "NONE" && h.sensor_fault_cht_c3 !== lastChtC3) {
      sensorFaultChtC3Events += 1;
      events.push({ t: s.t, title: `CHT C3 sensor fault (${h.sensor_fault_cht_c3})`, detail: `xgboost_classifier · t=${s.t.toFixed(1)}s` });
    }
    lastChtC3 = h.sensor_fault_cht_c3 ?? "NONE";
    if (h.sensor_fault_bearing_vibration && h.sensor_fault_bearing_vibration !== "NONE" && h.sensor_fault_bearing_vibration !== lastBearing) {
      sensorFaultBearingEvents += 1;
      events.push({ t: s.t, title: `Bearing vibration sensor fault (${h.sensor_fault_bearing_vibration})`, detail: `xgboost_classifier · t=${s.t.toFixed(1)}s` });
    }
    lastBearing = h.sensor_fault_bearing_vibration ?? "NONE";
  }
  events.reverse(); // most recent first

  return {
    finalHealthIndex: finalHealth?.health_index ?? null,
    finalFaultType: finalHealth?.fault_type ?? null,
    finalFaultProbability: finalHealth?.fault_probability ?? null,
    finalRulHours: finalHealth?.rul_estimate_hours ?? null,
    isHealthy: (finalHealth?.fault_type ?? "none") === "none",
    finalRpm: lastSample.frame.rpm,
    finalMap: lastSample.frame.map,
    throttlePct: lastSample.frame.throttle * 100,
    durationS: lastSample.t,
    cylinders,
    chtSpread,
    maxVibrationBearing,
    vibrationSeries,
    anomalousFrameCount,
    totalFrameCount,
    anomalyPct: totalFrameCount > 0 ? (anomalousFrameCount / totalFrameCount) * 100 : 0,
    sensorFaultChtC3Events,
    sensorFaultBearingEvents,
    events,
  };
}

// ---------------------------------------------------------------------------

function CriticalFaultSection({
  run,
  analysis,
  acknowledged,
  onAcknowledge,
}: {
  run: CompletedRunSummary;
  analysis: RunAnalysis;
  acknowledged: boolean;
  onAcknowledge: () => void;
}) {
  const { isHealthy } = analysis;
  const accentColor = isHealthy ? color.accent : color.danger;

  return (
    <section
      style={{
        display: "flex",
        height: 540,
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          position: "relative",
          width: PANEL_WIDTH,
          flex: `0 0 ${PANEL_WIDTH}px`,
          borderRight: `1px solid ${color.border}`,
          background: color.panelBgAlt,
        }}
      >
        <div style={{ height: "100%", overflow: "hidden auto", position: "relative" }}>
          <div
            style={{
              padding: "36px 38px 40px 36px",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              opacity: acknowledged && !isHealthy ? 0.72 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  color: isHealthy ? color.accent : acknowledged ? color.textLabel : color.danger,
                }}
              >
                {isHealthy ? "LAST RUN · HEALTHY" : acknowledged ? "LAST RUN · FAULT · ACKNOWLEDGED" : "LAST RUN · FAULT DETECTED"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.16, fontWeight: 700, letterSpacing: "-0.022em", textWrap: "balance" }}>
                {isHealthy ? "No fault detected" : `${faultTypeLabel(analysis.finalFaultType)} detected`}
              </h1>
              <div style={{ fontSize: 13, fontFamily: font.mono, color: color.textLabel }}>{run.runLabel}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: color.textMuted, textWrap: "pretty" }}>
                {isHealthy
                  ? `Health index held at ${analysis.finalHealthIndex?.toFixed(1) ?? "—"}/100 for the full ${analysis.durationS.toFixed(0)}s run.`
                  : `Health index dropped to ${analysis.finalHealthIndex?.toFixed(1) ?? "—"}/100 by the end of the ${analysis.durationS.toFixed(0)}s run.`}
                {analysis.anomalousFrameCount > 0 && ` ${analysis.anomalousFrameCount} of ${analysis.totalFrameCount} frames (${analysis.anomalyPct.toFixed(0)}%) flagged anomalous by the autoencoder.`}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 1,
                background: color.border,
                border: `1px solid ${color.border}`,
                borderRadius: 9,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <StatBlock label="CONFIDENCE" value={analysis.finalFaultProbability !== null ? `${(analysis.finalFaultProbability * 100).toFixed(1)}%` : "—"} color={accentColor} />
              <StatBlock label="RUL ESTIMATE" value={hoursLabel(analysis.finalRulHours)} color={accentColor} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel, letterSpacing: "0.12em" }}>
                RUN OUTCOME
              </span>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, color: color.text }}>
                Session ended: {run.finalStatus} · {run.samples.length} frames recorded · finished{" "}
                {new Date(run.finishedAt).toLocaleTimeString()}
              </div>
            </div>

            {!isHealthy && (
              <div style={{ display: "flex", gap: 9, marginTop: 2, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={onAcknowledge}
                  className="dt-btn-ghost"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 7,
                    border: acknowledged ? `1px solid ${color.accentDim}` : "1px solid #2b3238",
                    color: acknowledged ? color.accent : color.textDim,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "transparent",
                  }}
                >
                  {acknowledged ? "Acknowledged ✓" : "Acknowledge"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <RulOverTimeChart run={run} isHealthy={analysis.isHealthy} />
    </section>
  );
}

function StatBlock({ label, value, color: valueColor }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: color.panelBgAlt, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel, letterSpacing: "0.12em" }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 600, color: valueColor }}>{value}</span>
    </div>
  );
}

function RulOverTimeChart({ run, isHealthy }: { run: CompletedRunSummary; isHealthy: boolean }) {
  const points = run.rulHistory.filter((s): s is typeof s & { rulEstimateHours: number } => s.rulEstimateHours !== null);
  const lineColor = isHealthy ? color.accent : color.danger;

  // rulHistory only ever carries a non-null rulEstimateHours once lstm_rul's
  // model path is active (the ground-truth stand-in always reports null) --
  // so the run's own first RUL sample IS the moment the model activated.
  const modelActivatedAt = points.length > 0 ? points[0].t : null;

  let trendLabel = "—";
  let trendColor: string = color.textMuted;
  if (points.length >= 2) {
    const first = points[0].rulEstimateHours;
    const last = points[points.length - 1].rulEstimateHours;
    const delta = last - first;
    if (Math.abs(delta) < 0.01) {
      trendLabel = "flat across the run";
    } else if (delta < 0) {
      trendLabel = `▼ ${hoursLabel(Math.abs(delta))} over the run`;
      trendColor = color.danger;
    } else {
      trendLabel = `▲ ${hoursLabel(delta)} over the run`;
      trendColor = color.accent;
    }
  }

  return (
    <div style={{ flex: "1 1 auto", padding: "30px 34px 34px 34px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Predicted RUL over the run</div>
          <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.05em" }}>
            lstm_rul/v1 · {run.runLabel} · {points.length} model samples
          </div>
        </div>
        {points.length >= 2 && (
          <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: trendColor }}>{trendLabel}</span>
        )}
      </div>

      {points.length < 2 ? (
        <div
          style={{
            height: 250,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            fontSize: 12,
            color: color.textFaint,
            border: `1px dashed ${color.borderSoft}`,
            borderRadius: 8,
          }}
        >
          RUL never activated during this run (needs ~60 frames for lstm_rul&apos;s window to fill).
        </div>
      ) : (
        <RulSvg points={points} lineColor={lineColor} modelActivatedAt={modelActivatedAt} />
      )}
    </div>
  );
}

function RulSvg({
  points,
  lineColor,
  modelActivatedAt,
}: {
  points: { t: number; rulEstimateHours: number }[];
  lineColor: string;
  modelActivatedAt: number | null;
}) {
  const W = 820;
  const H = 280;
  const PAD_L = 46;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 28;

  const values = points.map((p) => p.rulEstimateHours);
  const maxVal = Math.max(...values, 0.05);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;

  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const tRange = maxT - minT || 1;

  const xAt = (t: number) => PAD_L + ((t - minT) / tRange) * (W - PAD_L - PAD_R);
  const yAt = (v: number) => H - PAD_B - ((v - minVal) / range) * (H - PAD_T - PAD_B);

  const path = points.map((p) => `${xAt(p.t)},${yAt(p.rulEstimateHours)}`).join(" ");
  const areaPath = `${xAt(points[0].t)},${H - PAD_B} ${path} ${xAt(points[points.length - 1].t)},${H - PAD_B}`;

  // 4 evenly-spaced y-axis ticks, each labeled with its real value.
  const Y_TICK_FRACTIONS = [0, 0.33, 0.66, 1];
  const yTicks = Y_TICK_FRACTIONS.map((f) => minVal + range * f);

  // Up to 6 x-axis ticks across the run's real elapsed-time span.
  const X_TICK_COUNT = 6;
  const xTicks = Array.from({ length: X_TICK_COUNT }, (_, i) => minT + (tRange * i) / (X_TICK_COUNT - 1));

  const maxPoint = points.reduce((best, p) => (p.rulEstimateHours > best.rulEstimateHours ? p : best), points[0]);
  const minPoint = points.reduce((worst, p) => (p.rulEstimateHours < worst.rulEstimateHours ? p : worst), points[0]);
  const latest = points[points.length - 1];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
        {/* gridlines + y labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={yAt(v)} x2={W - PAD_R} y2={yAt(v)} stroke="#1a1f23" strokeWidth="1" />
            <text x={PAD_L - 8} y={yAt(v) + 3} textAnchor="end" fontFamily={font.mono} fontSize="10.5" fill={color.textLabel3}>
              {v.toFixed(2)}h
            </text>
          </g>
        ))}
        {/* x-axis ticks + labels */}
        {xTicks.map((t) => (
          <g key={t}>
            <line x1={xAt(t)} y1={PAD_T} x2={xAt(t)} y2={H - PAD_B} stroke="#161b1e" strokeWidth="1" />
            <text x={xAt(t)} y={H - PAD_B + 16} textAnchor="middle" fontFamily={font.mono} fontSize="10.5" fill={color.textLabel3}>
              {t.toFixed(0)}s
            </text>
          </g>
        ))}

        {/* model-activation marker */}
        {modelActivatedAt !== null && (
          <g>
            <line
              x1={xAt(modelActivatedAt)}
              y1={PAD_T}
              x2={xAt(modelActivatedAt)}
              y2={H - PAD_B}
              stroke={color.accentDim}
              strokeWidth="1.2"
              strokeDasharray="3 4"
            />
            <text x={xAt(modelActivatedAt) + 5} y={PAD_T + 11} fontFamily={font.mono} fontSize="10" fill={color.textLabel3}>
              model active
            </text>
          </g>
        )}

        <polygon points={areaPath} fill={lineColor} fillOpacity="0.1" stroke="none" />
        <polyline points={path} fill="none" stroke={lineColor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

        {/* max / min markers, only when distinct from the endpoints */}
        <circle cx={xAt(maxPoint.t)} cy={yAt(maxPoint.rulEstimateHours)} r="3.5" fill={color.accent} stroke={color.panelBgAlt} strokeWidth="1.5" />
        <circle cx={xAt(minPoint.t)} cy={yAt(minPoint.rulEstimateHours)} r="3.5" fill={color.danger} stroke={color.panelBgAlt} strokeWidth="1.5" />
        {/* latest/endpoint marker */}
        <circle cx={xAt(latest.t)} cy={yAt(latest.rulEstimateHours)} r="4" fill={lineColor} stroke={color.panelBgAlt} strokeWidth="2" />
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
        <LegendDot color={color.accent} label={`peak ${maxPoint.rulEstimateHours.toFixed(2)}h @ t=${maxPoint.t.toFixed(0)}s`} />
        <LegendDot color={color.danger} label={`low ${minPoint.rulEstimateHours.toFixed(2)}h @ t=${minPoint.t.toFixed(0)}s`} />
        <LegendDot color={lineColor} label={`final ${latest.rulEstimateHours.toFixed(2)}h @ t=${latest.t.toFixed(0)}s`} />
      </div>
    </div>
  );
}

function LegendDot({ color: dotColor, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flex: "0 0 auto" }} />
      {label}
    </span>
  );
}

function QuickStatsSection({ analysis }: { analysis: RunAnalysis }) {
  const healthColor = analysis.finalHealthIndex !== null && analysis.finalHealthIndex < 70 ? color.danger : color.accent;
  const peakCht = analysis.cylinders.length > 0 ? Math.max(...analysis.cylinders.map((c) => c.maxCht)) : null;
  const peakChtCyl = analysis.cylinders.find((c) => c.maxCht === peakCht);

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 18,
        padding: "22px 30px",
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
      }}
    >
      <QuickStat
        label="FINAL HEALTH INDEX"
        value={analysis.finalHealthIndex?.toFixed(1) ?? "—"}
        unit="/100"
        valueColor={healthColor}
        note={analysis.isHealthy ? "no fault detected" : faultTypeLabel(analysis.finalFaultType)}
        noteColor={analysis.isHealthy ? color.textMuted : color.dangerSoft}
      />
      <QuickStat
        label="FINAL ENGINE SPEED"
        value={analysis.finalRpm !== null ? Math.round(analysis.finalRpm).toLocaleString("en-US").replace(",", " ") : "—"}
        unit="RPM"
        valueColor={color.accent}
        note={`MAP ${analysis.finalMap?.toFixed(1) ?? "—"} kPa · ${analysis.throttlePct?.toFixed(0) ?? "—"}% throttle`}
        noteColor={color.textMuted}
      />
      <QuickStat
        label={peakChtCyl ? `PEAK CHT · ${peakChtCyl.label}` : "PEAK CHT"}
        value={peakCht !== null ? peakCht.toFixed(0) : "—"}
        unit="°C"
        valueColor={color.accent}
        note={analysis.chtSpread !== null ? `spread ${analysis.chtSpread.toFixed(0)} °C across cylinders` : "—"}
        noteColor={color.textMuted}
      />
      <QuickStat
        label="AUTOENCODER ANOMALY RATE"
        value={analysis.anomalyPct.toFixed(0)}
        unit="%"
        valueColor={analysis.anomalousFrameCount > 0 ? color.danger : color.accent}
        note={`${analysis.anomalousFrameCount} / ${analysis.totalFrameCount} frames flagged`}
        noteColor={color.textMuted}
      />
    </section>
  );
}

function QuickStat({
  label,
  value,
  unit,
  valueColor,
  note,
  noteColor,
}: {
  label: string;
  value: string;
  unit: string;
  valueColor: string;
  note: string;
  noteColor: string;
}) {
  return (
    <div
      className="dt-glow-card"
      style={{
        padding: "24px 26px 26px 26px",
        border: `1px solid ${color.border}`,
        background: color.panelBgAlt,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...glowVars(valueColor === color.danger),
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: 11.5, fontWeight: 600, color: color.textMuted, letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontFamily: font.mono, fontSize: 38, fontWeight: 600, lineHeight: 1, color: valueColor }}>{value}</span>
        <span style={{ fontFamily: font.mono, fontSize: 13, color: color.textMuted }}>{unit}</span>
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 12.5, fontWeight: 500, color: noteColor }}>{note}</div>
    </div>
  );
}

function DetailSection({ analysis }: { analysis: RunAnalysis }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
        gap: 18,
        padding: "0 30px 22px 30px",
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
      }}
    >
      <PerCylinderThermals analysis={analysis} />
      <VibrationSignature analysis={analysis} />
      <SensorFaultSummary analysis={analysis} />
    </section>
  );
}

function PerCylinderThermals({ analysis }: { analysis: RunAnalysis }) {
  const maxSeen = Math.max(...analysis.cylinders.map((c) => c.maxCht), 1);

  return (
    <div
      className="dt-glow-card"
      style={{ padding: "28px 28px 30px 28px", border: `1px solid ${color.border}`, background: color.panelBgAlt, display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Per-cylinder thermals</div>
        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.05em" }}>FINAL CHT / EGT · °C</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {analysis.cylinders.map((cyl, i) => {
          const pct = Math.min(100, (cyl.finalCht / maxSeen) * 100);
          return (
            <div
              key={cyl.label}
              style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: i < analysis.cylinders.length - 1 ? `1px solid ${color.borderSoft}` : undefined }}
            >
              <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent }}>{cyl.label}</span>
              <div style={{ height: 3, borderRadius: 2, background: color.border, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color.accentDim }} />
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: color.accent }}>
                {celsiusLabel(cyl.finalCht)} / {celsiusLabel(cyl.finalEgt)}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, borderTop: `1px solid ${color.border}`, paddingTop: 13 }}>
        <span>SPREAD {analysis.chtSpread?.toFixed(0) ?? "—"} °C</span>
        <span>PEAK {Math.max(...analysis.cylinders.map((c) => c.maxCht)).toFixed(0)} °C</span>
      </div>
    </div>
  );
}

function VibrationSignature({ analysis }: { analysis: RunAnalysis }) {
  const { vibrationSeries, maxVibrationBearing } = analysis;
  // Flag using the model's own call (mechanical_vibration = bearing_health
  // fault, per contract/health-parameter-registry.md), not an invented g-force
  // ceiling -- no such absolute threshold is specified anywhere in the project.
  const flagged = analysis.finalFaultType === "mechanical_vibration";

  return (
    <div
      className="dt-glow-card"
      style={{ padding: "28px 28px 30px 28px", border: `1px solid ${color.border}`, background: color.panelBgAlt, display: "flex", flexDirection: "column", gap: 18, ...glowVars(flagged) }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Bearing vibration</div>
        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.05em" }}>vibration_rms_x_bearing_proxy · g RMS OVER THE RUN</div>
      </div>
      {vibrationSeries.length < 2 ? (
        <div style={{ fontSize: 12.5, color: color.textFaint }}>No vibration samples recorded.</div>
      ) : (
        <VibrationSvg series={vibrationSeries} critical={flagged} />
      )}
      <div style={{ fontSize: 12.5, color: color.textMuted, lineHeight: 1.55 }}>
        {maxVibrationBearing !== null
          ? `Peak ${maxVibrationBearing.toFixed(3)} g${flagged ? " -- model flagged mechanical_vibration (bearing wear) during this run." : "."}`
          : "—"}
      </div>
    </div>
  );
}

function VibrationSvg({ series, critical }: { series: { t: number; v: number }[]; critical: boolean }) {
  const W = 300;
  const H = 128;
  const maxV = Math.max(...series.map((s) => s.v), 0.01);
  const xAt = (i: number) => (i / (series.length - 1)) * W;
  const yAt = (v: number) => H - (v / maxV) * H;
  const path = series.map((s, i) => `${xAt(i)},${yAt(s.v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
      <polyline points={path} fill="none" stroke={critical ? color.danger : color.accent} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SensorFaultSummary({ analysis }: { analysis: RunAnalysis }) {
  const anySensorFault = analysis.sensorFaultChtC3Events > 0 || analysis.sensorFaultBearingEvents > 0;

  return (
    <div
      className="dt-glow-card"
      style={{ padding: "28px 28px 30px 28px", border: `1px solid ${color.border}`, background: color.panelBgAlt, display: "flex", flexDirection: "column", gap: 16, ...glowVars(anySensorFault) }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>Sensor-fault + anomaly signals</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <SummaryRow label="CHT C3 sensor-fault events" value={analysis.sensorFaultChtC3Events} critical={analysis.sensorFaultChtC3Events > 0} />
        <SummaryRow label="Bearing sensor-fault events" value={analysis.sensorFaultBearingEvents} critical={analysis.sensorFaultBearingEvents > 0} />
        <SummaryRow label="Autoencoder anomaly rate" value={`${analysis.anomalyPct.toFixed(0)}%`} critical={analysis.anomalousFrameCount > 0} isLast />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, borderTop: `1px solid ${color.border}`, paddingTop: 13 }}>
        <span>FRAMES ANALYZED</span>
        <span>{analysis.totalFrameCount}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, critical, isLast }: { label: string; value: string | number; critical: boolean; isLast?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: isLast ? undefined : `1px solid ${color.borderSoft}` }}>
      <span style={{ fontSize: 13, color: color.textDim }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: critical ? color.danger : color.accent }}>{value}</span>
    </div>
  );
}

const URGENCY_COLOR: Record<MaintenanceUrgency, string> = {
  IMMEDIATE: color.danger,
  URGENT: color.danger,
  SCHEDULED: color.textDim,
  ROUTINE: color.accent,
};

function MaintenanceSection({ run }: { run: CompletedRunSummary }) {
  const report = run.maintenance;
  const engineRecs = report?.engine_recommendations ?? [];
  const sensorRecs = report?.sensor_recommendations ?? [];
  const anyRecs = engineRecs.length > 0 || sensorRecs.length > 0;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
        gap: 18,
        padding: "22px 30px",
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
        ...glowVars(engineRecs.some((r) => r.urgency === "IMMEDIATE")),
      }}
    >
      <div
        className="dt-glow-card"
        style={{ padding: "28px 28px 30px 28px", border: `1px solid ${color.border}`, background: color.panelBgAlt, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Maintenance recommendations</div>
          <div style={{ flex: "1 1 auto" }} />
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel, letterSpacing: "0.05em" }}>
            contract/maintenance-rules.yaml
          </span>
        </div>

        {report === null ? (
          <div style={{ fontSize: 12.5, color: color.textFaint }}>Loading recommendations for this run...</div>
        ) : engineRecs.length === 0 ? (
          <div style={{ fontSize: 12.5, color: color.textFaint }}>
            No engine health parameter crossed into watch/warning/critical during this run.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {engineRecs.map((rec, i) => (
              <EngineRecommendationRow key={rec.health_parameter} rec={rec} isLast={i === engineRecs.length - 1} />
            ))}
          </div>
        )}
      </div>

      <div
        className="dt-glow-card"
        style={{ padding: "28px 28px 30px 28px", border: `1px solid ${color.border}`, background: color.panelBgAlt, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Sensor-fault recommendations</div>
        {report === null ? (
          <div style={{ fontSize: 12.5, color: color.textFaint }}>Loading recommendations for this run...</div>
        ) : sensorRecs.length === 0 ? (
          <div style={{ fontSize: 12.5, color: color.textFaint }}>No sensor-fault channel was active during this run.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sensorRecs.map((rec, i) => (
              <SensorRecommendationRow key={rec.channel} rec={rec} isLast={i === sensorRecs.length - 1} />
            ))}
          </div>
        )}
      </div>

      {!anyRecs && report !== null && (
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: color.textFaint, fontFamily: font.mono }}>
          Fully healthy by rule-engine standards -- every parameter stayed above its watch threshold.
        </div>
      )}
    </section>
  );
}

function EngineRecommendationRow({ rec, isLast }: { rec: MaintenanceRecommendation; isLast: boolean }) {
  const urgencyColor = URGENCY_COLOR[rec.urgency];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderBottom: isLast ? undefined : `1px solid ${color.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{rec.component}</span>
        <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: urgencyColor }}>{rec.urgency}</span>
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel }}>
        {rec.health_parameter} = {rec.value.toFixed(2)} · {rec.tier} tier
      </div>
      <div style={{ fontSize: 12.5, color: color.textDim, lineHeight: 1.55 }}>{rec.action}</div>
      <div style={{ fontSize: 11.5, color: color.textFaint, lineHeight: 1.5 }}>If unaddressed: {rec.consequence.toLowerCase()}</div>
    </div>
  );
}

function SensorRecommendationRow({ rec, isLast }: { rec: SensorFaultRecommendation; isLast: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderBottom: isLast ? undefined : `1px solid ${color.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{rec.channel}</span>
        <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: color.danger }}>{rec.fault_type}</span>
      </div>
      <div style={{ fontSize: 12.5, color: color.textDim, lineHeight: 1.55 }}>{rec.action}</div>
    </div>
  );
}

function BottomSection({ run, analysis }: { run: CompletedRunSummary; analysis: RunAnalysis }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", flex: "0 0 auto" }}>
      <AiDiagnosticSummary run={run} analysis={analysis} />
      <AnomalyFeed analysis={analysis} />
    </section>
  );
}

function AiDiagnosticSummary({ run, analysis }: { run: CompletedRunSummary; analysis: RunAnalysis }) {
  const sensorFlags: string[] = [];
  if (analysis.sensorFaultChtC3Events > 0) sensorFlags.push("a CHT C3 sensor fault");
  if (analysis.sensorFaultBearingEvents > 0) sensorFlags.push("a bearing-vibration sensor fault");

  const summary = analysis.isHealthy
    ? `The engine stayed healthy for the full run -- health index held at ${analysis.finalHealthIndex?.toFixed(1) ?? "—"}/100 with no physical fault detected.`
    : `${faultTypeLabel(analysis.finalFaultType)} was detected with ${((analysis.finalFaultProbability ?? 0) * 100).toFixed(0)}% confidence. Health index fell to ${analysis.finalHealthIndex?.toFixed(1) ?? "—"}/100${analysis.finalRulHours !== null ? `, estimated remaining useful life ${hoursLabel(analysis.finalRulHours)}` : ""}.`;

  const sensorNote =
    sensorFlags.length > 0
      ? ` Independently, xgboost_classifier also flagged ${sensorFlags.join(" and ")} during the run -- reported separately from the physical fault, never merged into it.`
      : "";

  return (
    <div style={{ padding: "30px 34px 34px 34px", borderRight: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Run diagnostic summary</div>
        <div style={{ flex: "1 1 auto" }} />
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, border: "1px solid #24382f", padding: "3px 7px", borderRadius: 4 }}>
          {run.finalHealth?.model_version ?? run.finalHealth?.source ?? "—"}
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: color.textDim, textWrap: "pretty" }}>
        {summary}
        {sensorNote}
      </div>
    </div>
  );
}

function AnomalyFeed({ analysis }: { analysis: RunAnalysis }) {
  return (
    <div style={{ padding: "30px 34px 34px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Event feed</div>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel, letterSpacing: "0.1em" }}>THIS RUN</span>
      </div>
      {analysis.events.length === 0 ? (
        <div style={{ fontSize: 12.5, color: color.textFaint, padding: "12px 0" }}>No fault or sensor-fault transitions recorded during this run.</div>
      ) : (
        analysis.events.map((e, i) => (
          <div key={`${e.title}-${e.t}-${i}`} style={{ display: "flex", gap: 13, padding: "12px 0", borderTop: `1px solid ${color.borderSoft}` }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: color.danger, marginTop: 6, flex: "0 0 5px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
              <div style={{ fontSize: 11.5, color: color.textFaint }}>{e.detail}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
