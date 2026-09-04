"use client";

/**
 * Two VISUALLY DISTINCT indicator systems, deliberately never merged:
 *
 * 1. Engine-health indicators -- driven by health_parameters (the LSTM
 *    health head's predicted values, not ground truth -- this is what the
 *    model actually inferred, which is the point of the demo), tiered per
 *    contract/maintenance-rules.yaml via the SAME rule engine the backend
 *    uses (POST /advisory/evaluate, not a reimplementation). Rendered as a
 *    ranked list of "WARNING"-style rows: component name, tier, action.
 *
 * 2. Sensor-fault indicators -- driven by sensor_fault_cht_c3 /
 *    sensor_fault_bearing_vibration (xgboost_classifier's per-channel
 *    output, a completely different vocabulary from health_parameters).
 *    Rendered as a distinct "SIGNAL" badge style attached to the specific
 *    channel, meaning "this reading may be untrustworthy" -- never
 *    "this component is failing".
 *
 * The Confusable Pair preset exists specifically to test that these two
 * never fire on the same signal for the same reason -- this component must
 * never cross-wire them (e.g. never derive a sensor badge from a health
 * tier, or vice versa).
 */

import type { HealthScoreOut } from "../../lib/types";
import { font, sceneColor, tierColor } from "./tokens";
import { useLiveMaintenanceReport } from "./useLiveMaintenanceReport";

export interface HealthOverlayProps {
  health: HealthScoreOut | null;
}

export function HealthOverlay({ health }: HealthOverlayProps) {
  const report = useLiveMaintenanceReport(health);

  const engineRecs = report?.engine_recommendations ?? [];
  const sensorRecs = report?.sensor_recommendations ?? [];

  if (engineRecs.length === 0 && sensorRecs.length === 0) {
    return (
      <div style={panelStyle}>
        <div style={{ color: sceneColor.accent, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>● NOMINAL</div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {engineRecs.map((rec) => (
        <div key={rec.health_parameter} style={{ ...rowStyle, borderLeft: `3px solid ${tierColor(rec.tier)}` }}>
          <span style={{ color: tierColor(rec.tier), fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em" }}>
            ⚠ {rec.urgency}
          </span>
          <span style={{ color: sceneColor.text, fontSize: 11, fontWeight: 600 }}>{rec.component}</span>
        </div>
      ))}
      {sensorRecs.map((rec) => (
        <div key={rec.channel} style={{ ...rowStyle, borderLeft: "3px solid #e8a23a" }}>
          <span style={{ color: "#e8a23a", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em" }}>▣ SIGNAL</span>
          <span style={{ color: sceneColor.text, fontSize: 11, fontWeight: 600 }}>
            {rec.channel} ({rec.fault_type})
          </span>
        </div>
      ))}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  minWidth: 200,
  background: "rgba(10, 13, 15, 0.86)",
  border: `1px solid ${sceneColor.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: font.mono,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  paddingLeft: 8,
};
