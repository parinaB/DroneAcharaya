"use client";

/**
 * HTML/CSS overlay showing live numeric readouts -- plain CSS text, not
 * geometry drawn in the 3D scene, so it stays crisp and never fights the
 * camera for legibility. Positioned as a fixed screen-space overlay
 * (rendered as a sibling of the <Canvas>, not drei's <Html> anchored to a
 * 3D world position) so it never drifts under the model or collides with
 * PredictionPanel/HealthOverlay as the camera moves -- every value here is
 * read directly off the interpolated EngineFrame, nothing computed or
 * fabricated in this component.
 */

import type { EngineFrame } from "../../lib/types";
import { font, sceneColor } from "./tokens";

export interface GaugePanelProps {
  frame: EngineFrame;
  /** Sensor-fault badges to attach to specific gauges -- keyed by the
   * gauge's own field name, e.g. { cht_c3: "DRIFT" }. Distinct from
   * engine-health tiers: this means "this reading may be untrustworthy",
   * never "this component is failing" -- see HealthOverlay's own docstring
   * for why the two must never be visually merged. */
  sensorFaultBadges: Record<string, string>;
}

function Row({ label, value, unit, badge }: { label: string; value: string; unit: string; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "1.5px 0" }}>
      <span style={{ color: sceneColor.textMuted, fontSize: 10.5, letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: sceneColor.text, fontSize: 12, fontWeight: 600 }}>
          {value}
          <span style={{ color: sceneColor.textFaint, fontSize: 10, marginLeft: 3 }}>{unit}</span>
        </span>
        {badge && (
          <span
            title={`Sensor fault: ${badge} -- this reading may be untrustworthy`}
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: "0.05em",
              color: "#1a1006",
              background: "#e8a23a",
              borderRadius: 3,
              padding: "1px 4px",
            }}
          >
            SIGNAL
          </span>
        )}
      </span>
    </div>
  );
}

export function GaugePanel({ frame, sensorFaultBadges }: GaugePanelProps) {
  return (
    <div
      style={{
        width: 180,
        maxHeight: 190,
        overflowY: "auto",
        background: "rgba(10, 13, 15, 0.86)",
        border: `1px solid ${sceneColor.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontFamily: font.mono,
        backdropFilter: "blur(4px)",
      }}
    >
      <Row label="RPM" value={frame.rpm.toFixed(0)} unit="rpm" />
      <Row label="OIL PRESS" value={frame.oil_pressure.toFixed(2)} unit="bar" badge={sensorFaultBadges.oil_pressure} />
      <Row label="OIL TEMP" value={frame.oil_temperature.toFixed(1)} unit="°C" badge={sensorFaultBadges.oil_temperature} />
      <div style={{ height: 1, background: sceneColor.border, margin: "3px 0" }} />
      <Row label="CHT C1" value={frame.cht_c1.toFixed(0)} unit="°C" badge={sensorFaultBadges.cht_c1} />
      <Row label="CHT C2" value={frame.cht_c2.toFixed(0)} unit="°C" badge={sensorFaultBadges.cht_c2} />
      <Row label="CHT C3" value={frame.cht_c3.toFixed(0)} unit="°C" badge={sensorFaultBadges.cht_c3} />
      <Row label="CHT C4" value={frame.cht_c4.toFixed(0)} unit="°C" badge={sensorFaultBadges.cht_c4} />
      <div style={{ height: 1, background: sceneColor.border, margin: "3px 0" }} />
      <Row label="EGT C1" value={frame.egt_c1.toFixed(0)} unit="°C" badge={sensorFaultBadges.egt_c1} />
      <Row label="EGT C2" value={frame.egt_c2.toFixed(0)} unit="°C" badge={sensorFaultBadges.egt_c2} />
      <Row label="EGT C3" value={frame.egt_c3.toFixed(0)} unit="°C" badge={sensorFaultBadges.egt_c3} />
      <Row label="EGT C4" value={frame.egt_c4.toFixed(0)} unit="°C" badge={sensorFaultBadges.egt_c4} />
      <div style={{ height: 1, background: sceneColor.border, margin: "3px 0" }} />
      <Row label="BATTERY" value={frame.battery_voltage.toFixed(1)} unit="V" badge={sensorFaultBadges.battery_voltage} />
    </div>
  );
}
