"use client";

import { color, font, tabStyle } from "../_lib/tokens";
import type { Role, Screen } from "../_lib/state";

const ROLES: { key: Role; label: string }[] = [
  { key: "operator", label: "Operator" },
  { key: "engineer", label: "Engineer" },
  { key: "maintenance", label: "Maintenance" },
];

export function TopBar({
  screen,
  role,
  onRoleChange,
  missionClock,
}: {
  screen: Screen;
  role: Role;
  onRoleChange: (role: Role) => void;
  missionClock: string;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 30px",
        height: 62,
        flex: "0 0 62px",
        borderBottom: `1px solid ${color.border}`,
        background: color.panelBg,
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 600 }}>
        {screen === "simulation" ? "Simulation / Digital Twin" : "Live Dashboard"}
      </div>
      <div style={{ width: 1, height: 22, background: "#1f252a" }} />
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          color: color.textFaint,
          letterSpacing: "0.05em",
        }}
      >
        MSN-4471 · UAV-07 · 4-CYL AERO PISTON
      </div>

      <div style={{ flex: "1 1 auto" }} />

      <div
        style={{
          display: "flex",
          gap: 2,
          padding: 3,
          background: "#14181b",
          border: "1px solid #1f252a",
          borderRadius: 8,
        }}
      >
        {ROLES.map(({ key, label }) => {
          const t = tabStyle(role === key);
          return (
            <div
              key={key}
              onClick={() => onRoleChange(key)}
              className="dt-tab"
              style={{
                padding: "5px 12px",
                borderRadius: 5,
                fontSize: 11.5,
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

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
        <div style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600 }}>
          {missionClock}
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 9,
            color: color.textFaint,
            letterSpacing: "0.08em",
          }}
        >
          ELAPSED
        </div>
      </div>
      <div
        style={{
          width: 29,
          height: 29,
          borderRadius: "50%",
          background: "#1f252a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          color: color.textDim,
        }}
      >
        RK
      </div>
    </header>
  );
}
