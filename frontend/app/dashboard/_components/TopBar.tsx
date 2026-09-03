"use client";

import { color, font, tabStyle } from "../_lib/tokens";
import type { Role, Screen, Theme } from "../_lib/state";

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
  theme,
  onToggleTheme,
}: {
  screen: Screen;
  role: Role;
  onRoleChange: (role: Role) => void;
  missionClock: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <header
      className="dt-surface"
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
      <div style={{ width: 1, height: 22, background: color.border }} />
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 12,
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
          background: color.wellBg,
          border: `1px solid ${color.border}`,
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

      <button
        type="button"
        onClick={onToggleTheme}
        className="dt-btn-ghost"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          width: 29,
          height: 29,
          borderRadius: "50%",
          border: `1px solid ${color.border}`,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: color.textDim,
          padding: 0,
        }}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
        <div style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600 }}>
          {missionClock}
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
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
          background: color.tabOnBg,
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

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <line x1="12" y1="1.5" x2="12" y2="4.2" />
      <line x1="12" y1="19.8" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="4.2" y2="12" />
      <line x1="19.8" y1="12" x2="22.5" y2="12" />
      <line x1="4.6" y1="4.6" x2="6.5" y2="6.5" />
      <line x1="17.5" y1="17.5" x2="19.4" y2="19.4" />
      <line x1="4.6" y1="19.4" x2="6.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="19.4" y2="4.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.4 14.7A9 9 0 1 1 9.3 3.6a7.2 7.2 0 0 0 11.1 11.1z" />
    </svg>
  );
}
