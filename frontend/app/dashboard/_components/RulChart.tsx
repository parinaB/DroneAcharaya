"use client";

/** Plots rul_estimate_hours over time from the session's rulHistory (sampled
 * every 1s by useReplaySession) -- an SVG polyline, no charting library. */

import { color, font } from "../_lib/tokens";
import { isRulDeclining, type RulSample } from "../_lib/useReplaySession";

const VIEW_W = 900;
const PAD_X = 8;
const PAD_Y = 14;

export function RulChart({ history, height = 90 }: { history: RulSample[]; height?: number }) {
  const points = history.filter((s) => s.rulEstimateHours !== null) as (RulSample & { rulEstimateHours: number })[];

  if (points.length < 2) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.mono,
          fontSize: 11,
          color: color.textFaint,
          border: `1px dashed ${color.borderSoft}`,
          borderRadius: 6,
        }}
      >
        Waiting for RUL estimates… (needs a ~60-frame window before lstm_rul activates)
      </div>
    );
  }

  const values = points.map((p) => p.rulEstimateHours);
  const maxVal = Math.max(...values, 0.1);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;

  const xAt = (i: number) => PAD_X + (i / (points.length - 1)) * (VIEW_W - PAD_X * 2);
  const yAt = (v: number) => height - PAD_Y - ((v - minVal) / range) * (height - PAD_Y * 2);

  const path = points.map((p, i) => `${xAt(i)},${yAt(p.rulEstimateHours)}`).join(" ");
  const areaPath = `${PAD_X},${height - PAD_Y} ${path} ${xAt(points.length - 1)},${height - PAD_Y}`;
  const latest = points[points.length - 1].rulEstimateHours;
  const latestX = xAt(points.length - 1);
  const latestY = yAt(latest);

  const lineColor = isRulDeclining(history) ? color.danger : color.accent;
  const gridLines = [0.25, 0.5, 0.75].map((f) => minVal + range * f);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        {gridLines.map((v) => (
          <line key={v} x1={PAD_X} y1={yAt(v)} x2={VIEW_W - PAD_X} y2={yAt(v)} stroke={color.borderSoft} strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <line x1={PAD_X} y1={height - PAD_Y} x2={VIEW_W - PAD_X} y2={height - PAD_Y} stroke={color.borderSoft} strokeWidth="1" />
        <polygon points={areaPath} fill={lineColor} fillOpacity="0.08" stroke="none" />
        <polyline points={path} fill="none" stroke={lineColor} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={latestX} cy={latestY} r="4" fill={lineColor} />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 2,
          right: 4,
          fontFamily: font.mono,
          fontSize: 11,
          color: color.textLabel3,
        }}
      >
        max {maxVal.toFixed(2)}h
      </div>
      <div
        style={{
          position: "absolute",
          bottom: PAD_Y - 2,
          left: 4,
          fontFamily: font.mono,
          fontSize: 11,
          color: color.textLabel3,
        }}
      >
        0h
      </div>
    </div>
  );
}
