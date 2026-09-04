"use client";

import { useState } from "react";
import { color } from "../_lib/tokens";
import type { Screen } from "../_lib/state";
import { DashboardIcon, SimulationIcon } from "./NavIcons";

const EXPANDED_WIDTH = 232;
const COLLAPSED_WIDTH = 68;

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
            DRONEACHARAYA
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
          icon={<SimulationIcon />}
          label="Simulation / Digital Twin"
          active={isSim}
          collapsed={collapsed}
          onClick={() => onScreenChange("simulation")}
        />
        <NavItem
          icon={<DashboardIcon />}
          label="Analytics"
          active={!isSim}
          collapsed={collapsed}
          onClick={() => onScreenChange("dashboard")}
        />
      </nav>
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

