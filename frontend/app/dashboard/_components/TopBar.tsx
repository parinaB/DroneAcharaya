"use client";

import { color, font } from "../_lib/tokens";
import type { Screen, Theme } from "../_lib/state";

export function TopBar({
  screen,
  theme,
  onToggleTheme,
}: {
  screen: Screen;
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

      <div style={{ flex: "1 1 auto" }} />

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

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textDim, whiteSpace: "nowrap" }}>
          .DLL not found
        </span>
        <div
          style={{
            width: 29,
            height: 29,
            borderRadius: "50%",
            background: color.tabOnBg,
            border: `1px solid ${color.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 29px",
            color: color.textDim,
          }}
        >
          <ProfileIcon />
        </div>
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

function ProfileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
