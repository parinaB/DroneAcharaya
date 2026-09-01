"use client";

import { color, font } from "../_lib/tokens";
import type { Screen } from "../_lib/state";

const INERT_NAV_ITEMS = [
  "Health & Diagnostics",
  "Fault Predictions",
  "Reports",
  "Sensors & Data Sources",
  "Settings",
];

export function Sidebar({
  screen,
  onScreenChange,
}: {
  screen: Screen;
  onScreenChange: (screen: Screen) => void;
}) {
  const isSim = screen === "simulation";

  return (
    <aside
      style={{
        width: 232,
        flex: "0 0 232px",
        display: "flex",
        flexDirection: "column",
        background: color.panelBg,
        borderRight: `1px solid ${color.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "22px 20px 20px 20px",
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "#1d2427",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 30px",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              border: `2px solid ${color.accent}`,
              borderRadius: "50%",
              borderRightColor: "transparent",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em" }}>
            DRONACHARYA
          </div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 9,
              color: color.textLabel2,
              letterSpacing: "0.1em",
            }}
          >
            MALE UAV · DIGITAL TWIN
          </div>
        </div>
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "14px 10px",
          flex: "1 1 auto",
          overflowY: "auto",
        }}
      >
        <NavItem
          label="Live Dashboard"
          active={!isSim}
          onClick={() => onScreenChange("dashboard")}
        />
        <NavItem
          label="Simulation / Digital Twin"
          active={isSim}
          onClick={() => onScreenChange("simulation")}
        />

        <div style={{ height: 1, background: color.border, margin: "14px 12px" }} />

        {INERT_NAV_ITEMS.map((label) => (
          <InertNavItem key={label} label={label} badge={label === "Fault Predictions" ? "1" : undefined} />
        ))}
      </nav>

      <div
        style={{
          padding: "14px 20px 18px 20px",
          borderTop: `1px solid ${color.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        <TelemetryRow label="TELEMETRY" value="LIVE · 42 ms" />
        <TelemetryRow label="INFERENCE" value="ON-BOARD" />
      </div>
    </aside>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="dt-nav-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 12px",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13.5,
        fontWeight: 500,
        background: active ? color.tabOnBg : "transparent",
        color: active ? color.text : "#8d979f",
        boxShadow: active ? color.tabOnRing : "none",
      }}
    >
      <span
        style={{
          width: 3,
          height: 14,
          borderRadius: 2,
          background: active ? color.accent : "transparent",
          flex: "0 0 3px",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function InertNavItem({ label, badge }: { label: string; badge?: string }) {
  return (
    <div
      className="dt-nav-item"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13.5,
        fontWeight: 500,
        color: "#8d979f",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 3, height: 14, flex: "0 0 3px" }} />
        <span>{label}</span>
      </div>
      {badge && (
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            fontWeight: 600,
            color: color.bg,
            background: color.danger,
            borderRadius: 20,
            padding: "2px 6px",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function TelemetryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: font.mono,
        fontSize: 10,
        color: color.textLabel2,
      }}
    >
      <span>{label}</span>
      <span style={{ color: color.accent }}>{value}</span>
    </div>
  );
}
