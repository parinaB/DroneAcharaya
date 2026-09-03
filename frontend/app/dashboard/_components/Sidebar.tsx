"use client";

import { useState } from "react";
import { color, font } from "../_lib/tokens";
import type { Screen } from "../_lib/state";
import {
  DashboardIcon,
  FaultIcon,
  HealthIcon,
  ReportsIcon,
  SensorsIcon,
  SettingsIcon,
  SimulationIcon,
} from "./NavIcons";

const EXPANDED_WIDTH = 232;
const COLLAPSED_WIDTH = 68;

const INERT_NAV_ITEMS: { label: string; icon: React.ReactNode }[] = [
  { label: "Health & Diagnostics", icon: <HealthIcon /> },
  { label: "Fault Predictions", icon: <FaultIcon /> },
  { label: "Reports", icon: <ReportsIcon /> },
  { label: "Sensors & Data Sources", icon: <SensorsIcon /> },
  { label: "Settings", icon: <SettingsIcon /> },
];

export function Sidebar({
  screen,
  onScreenChange,
  collapsed,
  onToggleCollapsed,
}: {
  screen: Screen;
  onScreenChange: (screen: Screen) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const isSim = screen === "simulation";
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const showToggle = hovering || focused;

  return (
    <aside
      className="dt-surface dt-sidebar"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        width,
        flex: `0 0 ${width}px`,
        display: "flex",
        flexDirection: "column",
        background: color.panelBg,
        borderRight: `1px solid ${color.border}`,
        transition: "width 0.22s cubic-bezier(0.16, 1, 0.3, 1), flex-basis 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="dt-btn-ghost dt-sidebar-toggle"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          position: "absolute",
          top: 26,
          right: -13,
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: `1px solid ${color.border}`,
          background: color.panelBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: color.textDim,
          padding: 0,
          zIndex: 2,
          opacity: showToggle ? 1 : 0,
          pointerEvents: showToggle ? "auto" : "none",
          transition: "opacity 0.18s ease, background-color 0.18s ease, transform 0.12s ease",
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.22s ease" }}
        >
          <polyline points="15 4 7 12 15 20" />
        </svg>
      </button>

      <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: collapsed ? "22px 0 20px 0" : "22px 20px 20px 20px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: color.tabOnBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 30px",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: color.accent,
            }}
          />
        </div>
        {!collapsed && (
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
            DRONACHARYA
          </div>
        )}
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: collapsed ? "14px 8px" : "14px 10px",
          flex: "1 1 auto",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <NavItem
          icon={<DashboardIcon />}
          label="Live Dashboard"
          active={!isSim}
          collapsed={collapsed}
          onClick={() => onScreenChange("dashboard")}
        />
        <NavItem
          icon={<SimulationIcon />}
          label="Simulation / Digital Twin"
          active={isSim}
          collapsed={collapsed}
          onClick={() => onScreenChange("simulation")}
        />

        <div style={{ height: 1, background: color.border, margin: collapsed ? "12px 6px" : "14px 12px" }} />

        {INERT_NAV_ITEMS.map(({ label, icon }) => (
          <InertNavItem key={label} label={label} icon={icon} collapsed={collapsed} badge={label === "Fault Predictions" ? "1" : undefined} />
        ))}
      </nav>

      <div
        style={{
          padding: collapsed ? "14px 8px 18px 8px" : "14px 20px 18px 20px",
          borderTop: `1px solid ${color.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 9,
          alignItems: collapsed ? "center" : "stretch",
        }}
      >
        {collapsed ? (
          <span className="dt-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: color.accent }} title="Telemetry live" />
        ) : (
          <>
            <TelemetryRow label="TELEMETRY" value="LIVE · 42 ms" />
            <TelemetryRow label="INFERENCE" value="ON-BOARD" />
          </>
        )}
      </div>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="dt-nav-item"
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: collapsed ? "10px 0" : "10px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13.5,
        fontWeight: 500,
        whiteSpace: "nowrap",
        background: active ? color.tabOnBg : "transparent",
        color: active ? color.text : color.textInactive,
        boxShadow: active ? color.tabOnRing : "none",
      }}
    >
      {!collapsed && (
        <span
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: active ? color.accent : "transparent",
            flex: "0 0 3px",
          }}
        />
      )}
      <span style={{ display: "flex", flex: "0 0 auto", color: active ? color.accent : "currentColor" }}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </div>
  );
}

function InertNavItem({
  label,
  icon,
  collapsed,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  badge?: string;
}) {
  return (
    <div
      className="dt-nav-item"
      title={collapsed ? label : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "10px 0" : "10px 12px",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13.5,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: color.textInactive,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {!collapsed && <span style={{ width: 3, height: 14, flex: "0 0 3px" }} />}
        <span style={{ display: "flex", flex: "0 0 auto" }}>{icon}</span>
        {!collapsed && <span>{label}</span>}
      </div>
      {badge && !collapsed && (
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11.5,
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
      {badge && collapsed && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 12,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color.danger,
          }}
        />
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
        fontSize: 11.5,
        color: color.textLabel2,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      <span style={{ color: color.accent }}>{value}</span>
    </div>
  );
}
