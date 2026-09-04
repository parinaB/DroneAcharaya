"use client";

/**
 * Live-updating panel showing what the model actually predicted: current
 * RUL estimate, per-health-parameter tier (from the same health_parameters
 * dict HealthOverlay reads), and the rule engine's own recommendation lists
 * -- engine and sensor kept separate, per the rule engine's own output
 * shape (contract/maintenance-rules.yaml), never merged into one feed.
 */

import type { HealthScoreOut } from "../../lib/types";
import { font, sceneColor, tierColor } from "./tokens";
import { useLiveMaintenanceReport } from "./useLiveMaintenanceReport";

export interface PredictionPanelProps {
  health: HealthScoreOut | null;
}

function hoursLabel(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${(hours * 60).toFixed(0)} min`;
  return `${hours.toFixed(1)} h`;
}

/** health_parameters carries every value the model produced this tick, in
 * the registry's 1.0=healthy->0.0=failed convention -- listing every entry
 * (not just the ones with an active recommendation) is what lets a viewer
 * see a parameter EN ROUTE to a tier boundary, not just after it crosses one. */
function tierForValue(report: ReturnType<typeof useLiveMaintenanceReport>, param: string): "watch" | "warning" | "critical" | null {
  const rec = report?.engine_recommendations.find((r) => r.health_parameter === param);
  return rec?.tier ?? null;
}

export function PredictionPanel({ health }: PredictionPanelProps) {
  const report = useLiveMaintenanceReport(health);
  const healthParameters = health?.health_parameters ?? null;

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ color: sceneColor.textMuted, fontSize: 10.5, letterSpacing: "0.08em" }}>RUL ESTIMATE</span>
        <span style={{ color: sceneColor.text, fontSize: 20, fontWeight: 700 }}>{hoursLabel(health?.rul_estimate_hours ?? null)}</span>
      </div>

      {healthParameters && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ color: sceneColor.textMuted, fontSize: 9.5, letterSpacing: "0.06em", marginTop: 4 }}>
            HEALTH PARAMETERS
          </div>
          {Object.entries(healthParameters).map(([param, value]) => {
            const tier = tierForValue(report, param);
            return (
              <div key={param} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: sceneColor.textDim, fontSize: 10 }}>{param}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: tierColor(tier) }} />
                  <span style={{ color: sceneColor.text, fontSize: 10.5, fontFamily: font.mono }}>{value.toFixed(2)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
        <div style={{ color: sceneColor.textMuted, fontSize: 9.5, letterSpacing: "0.06em" }}>ENGINE RECOMMENDATIONS</div>
        {(report?.engine_recommendations.length ?? 0) === 0 ? (
          <div style={{ color: sceneColor.textFaint, fontSize: 10.5 }}>None</div>
        ) : (
          report!.engine_recommendations.map((rec) => (
            <div key={rec.health_parameter} style={{ color: tierColor(rec.tier), fontSize: 10.5 }}>
              {rec.component}: {rec.action}
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
        <div style={{ color: sceneColor.textMuted, fontSize: 9.5, letterSpacing: "0.06em" }}>SENSOR RECOMMENDATIONS</div>
        {(report?.sensor_recommendations.length ?? 0) === 0 ? (
          <div style={{ color: sceneColor.textFaint, fontSize: 10.5 }}>None</div>
        ) : (
          report!.sensor_recommendations.map((rec) => (
            <div key={rec.channel} style={{ color: "#e8a23a", fontSize: 10.5 }}>
              {rec.channel} ({rec.fault_type}): {rec.action}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: 220,
  maxHeight: 190,
  overflowY: "auto",
  background: "rgba(10, 13, 15, 0.9)",
  border: `1px solid ${sceneColor.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: font.mono,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
