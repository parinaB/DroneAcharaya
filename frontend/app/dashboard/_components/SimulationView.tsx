"use client";

import { useCallback, useRef, useState } from "react";
import { altLabel, chtLabel, hms, mixLabel, oatLabel, rpmLabel } from "../_lib/format";
import { cardTabStyle, color, font, glowVars, tabStyle } from "../_lib/tokens";
import { SCENARIOS, SIM_RUN_LENGTH, type Camera, type SimParams, type XaiTab } from "../_lib/state";

const SPEEDS = [1, 2, 5, 10] as const;
const CAMERAS: { key: Camera; label: string }[] = [
  { key: "ext", label: "EXT" },
  { key: "eng", label: "ENGINE BAY" },
  { key: "thermal", label: "THERMAL" },
];
const CAMERA_VIEW_LABEL: Record<Camera, string> = {
  ext: "EXTERIOR VIEW",
  eng: "ENGINE BAY",
  thermal: "THERMAL OVERLAY",
};
const XAI_TABS: { key: XaiTab; label: string }[] = [
  { key: "drivers", label: "Drivers" },
  { key: "residual", label: "Residual" },
  { key: "reasoning", label: "Reasoning" },
];

export interface SimulationViewProps {
  scenario: number;
  onScenarioChange: (i: number) => void;
  params: SimParams;
  onParamsChange: (params: SimParams) => void;
  onResetParams: () => void;
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  t: number;
  onSeek: (t: number) => void;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  xai: XaiTab;
  onXaiChange: (xai: XaiTab) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function SimulationView({
  scenario,
  onScenarioChange,
  params,
  onParamsChange,
  onResetParams,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  t,
  onSeek,
  camera,
  onCameraChange,
  xai,
  onXaiChange,
  fullscreen,
  onToggleFullscreen,
}: SimulationViewProps) {
  return (
    <div
      style={{
        flex: "1 1 auto",
        display: "grid",
        gridTemplateColumns: "258px minmax(0, 1fr) 300px",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <ScenarioPanel
        scenario={scenario}
        onScenarioChange={onScenarioChange}
        params={params}
        onParamsChange={onParamsChange}
        onResetParams={onResetParams}
      />
      <Viewport
        playing={playing}
        onTogglePlay={onTogglePlay}
        speed={speed}
        onSpeedChange={onSpeedChange}
        t={t}
        onSeek={onSeek}
        camera={camera}
        onCameraChange={onCameraChange}
        params={params}
        fullscreen={fullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
      <TelemetryPanel params={params} xai={xai} onXaiChange={onXaiChange} />
    </div>
  );
}

function ScenarioPanel({
  scenario,
  onScenarioChange,
  params,
  onParamsChange,
  onResetParams,
}: {
  scenario: number;
  onScenarioChange: (i: number) => void;
  params: SimParams;
  onParamsChange: (params: SimParams) => void;
  onResetParams: () => void;
}) {
  const set = <K extends keyof SimParams>(key: K, value: number) =>
    onParamsChange({ ...params, [key]: value });

  return (
    <div
      style={{
        borderRight: `1px solid ${color.border}`,
        background: color.panelBg,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "22px 18px 28px 18px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: "0 0 auto" }}>
        <SectionLabel>SCENARIO</SectionLabel>
        {SCENARIOS.map((s, i) => {
          const t = cardTabStyle(scenario === i);
          return (
            <div
              key={s.title}
              onClick={() => onScenarioChange(i)}
              className="dt-tab dt-scenario-card"
              style={{
                padding: "11px 12px",
                borderRadius: 7,
                cursor: "pointer",
                background: t.bg,
                boxShadow: t.ring,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: t.fg }}>{s.title}</div>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>{s.subtitle}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 15, borderTop: `1px solid ${color.border}`, paddingTop: 20, flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>PARAMETERS</SectionLabel>
          <span onClick={onResetParams} style={{ fontFamily: font.mono, fontSize: 11, color: "#8aa8a3", cursor: "pointer" }}>
            RESET
          </span>
        </div>

        <ParamSlider label="Throttle" display={`${params.throttle}%`} min={20} max={100} value={params.throttle} onChange={(v) => set("throttle", v)} />
        <ParamSlider label="Altitude" display={altLabel(params.alt)} min={0} max={300} value={params.alt} onChange={(v) => set("alt", v)} />
        <ParamSlider label="Outside air temp" display={oatLabel(params.oat)} min={-40} max={50} value={params.oat} onChange={(v) => set("oat", v)} />
        <ParamSlider label="Mixture" display={mixLabel(params.mix)} min={-60} max={40} value={params.mix} onChange={(v) => set("mix", v)} />
        <ParamSlider
          label="Injector fault severity"
          display={`${params.fault}%`}
          min={0}
          max={100}
          value={params.fault}
          onChange={(v) => set("fault", v)}
          danger
        />
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, paddingTop: 18, display: "flex", flexDirection: "column", gap: 8, flex: "0 0 auto" }}>
        <SectionLabel>TWIN SYNC</SectionLabel>
        <SyncRow label="MODEL STEP" value="2 ms" />
        <SyncRow label="SYNC ERROR" value="0.8%" />
        <SyncRow label="UE5 STREAM" value="60 fps · 1440p" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel2, letterSpacing: "0.13em" }}>
      {children}
    </div>
  );
}

function ParamSlider({
  label,
  display,
  min,
  max,
  value,
  onChange,
  danger,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  danger?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: color.textDim }}>{label}</span>
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: danger ? color.danger : color.text }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        className="dt-slider"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: danger ? color.danger : color.accent, background: "transparent" }}
      />
    </div>
  );
}

function SyncRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 12, color: color.textLabel }}>
      <span>{label}</span>
      <span style={{ color: color.accent }}>{value}</span>
    </div>
  );
}

function Viewport({
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  t,
  onSeek,
  camera,
  onCameraChange,
  params,
  fullscreen,
  onToggleFullscreen,
}: {
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  t: number;
  onSeek: (t: number) => void;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  params: SimParams;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pct = (t / SIM_RUN_LENGTH) * 100;
  const [exported, setExported] = useState(false);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExport = useCallback(() => {
    setExported(true);
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => setExported(false), 1800);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    onToggleFullscreen();
  }, [onToggleFullscreen]);

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(Math.round(f * SIM_RUN_LENGTH));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div
        ref={viewportRef}
        style={{
          flex: "1 1 auto",
          margin: "18px 18px 0 18px",
          borderRadius: 11,
          border: "1px solid #1f252a",
          background: "#090b0d",
          position: "relative",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <svg width="100%" height="100%" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, display: "block" }}>
          <defs>
            <pattern id="dtStripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="14" stroke="#14181b" strokeWidth="7" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="#0d1013" />
          <rect width="100%" height="100%" fill="url(#dtStripe)" opacity=".6" />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11.5,
              color: color.textFaint,
              letterSpacing: "0.16em",
              background: color.bg,
              padding: "8px 15px",
              border: "1px solid #232a2f",
              borderRadius: 5,
            }}
          >
            UNREAL ENGINE 5 · PIXEL STREAM
          </div>
          <div
            className="dt-fade-swap"
            key={camera}
            style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel3, letterSpacing: "0.08em" }}
          >
            MALE UAV AIRFRAME · {CAMERA_VIEW_LABEL[camera]} · CLICK TO CAPTURE INPUT
          </div>
        </div>

        <div style={{ position: "absolute", top: 13, left: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dangerSoft,
              background: "rgba(11,13,15,.86)",
              border: "1px solid #3d1f1c",
              padding: "5px 9px",
              borderRadius: 4,
            }}
          >
            <span className="dt-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: color.danger }} />
            {playing ? "REC · RUNNING" : "REC · PAUSED"}
          </span>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.textMuted,
              background: "rgba(11,13,15,.86)",
              border: "1px solid #232a2f",
              padding: "5px 9px",
              borderRadius: 4,
            }}
          >
            T+{hms(t)} · ×{speed}
          </span>
        </div>

        <div style={{ position: "absolute", top: 13, right: 14, display: "flex", alignItems: "center", gap: 6 }}>
          {CAMERAS.map(({ key, label }) => {
            const s = tabStyle(camera === key);
            return (
              <div
                key={key}
                onClick={() => onCameraChange(key)}
                className="dt-tab"
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  padding: "6px 9px",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: camera === key ? s.bg : "rgba(11,13,15,.86)",
                  color: s.fg,
                  border: "1px solid #232a2f",
                }}
              >
                {label}
              </div>
            );
          })}
          <div
            onClick={handleToggleFullscreen}
            className="dt-btn-ghost"
            style={{
              width: 28,
              height: 27,
              borderRadius: 4,
              border: "1px solid #232a2f",
              background: "rgba(11,13,15,.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <div style={{ width: 11, height: 9, border: "1.5px solid #b8c0c6", borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <HudTile label="ALT" value={altLabel(params.alt)} />
          <HudTile label="IAS" value="104 kt" />
          <HudTile label="RPM" value={rpmLabel(params.throttle)} />
          <HudTile label="CHT 3" value={chtLabel(params.fault, params.oat)} danger />
        </div>
      </div>

      <div
        style={{
          flex: "0 0 auto",
          margin: "14px 18px 18px 18px",
          padding: "14px 16px",
          borderRadius: 11,
          background: color.panelBgAlt,
          border: `1px solid ${color.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <TransportButton onClick={() => onSeek(Math.max(0, t - 30))}>◀◀</TransportButton>
            <div
              onClick={onTogglePlay}
              className="dt-btn-play"
              style={{
                width: 40,
                height: 32,
                borderRadius: 7,
                background: color.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                color: color.bg,
              }}
            >
              {playing ? "❚❚" : "▶"}
            </div>
            <TransportButton onClick={() => onSeek(Math.min(SIM_RUN_LENGTH, t + 30))}>▶▶</TransportButton>
          </div>
          <div style={{ display: "flex", gap: 2, padding: 3, background: color.wellBg, border: `1px solid ${color.border}`, borderRadius: 7 }}>
            {SPEEDS.map((s) => {
              const st = tabStyle(speed === s);
              return (
                <div
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className="dt-tab"
                  style={{
                    padding: "5px 9px",
                    borderRadius: 4,
                    fontFamily: font.mono,
                    fontSize: 12,
                    cursor: "pointer",
                    background: st.bg,
                    color: st.fg,
                  }}
                >
                  {s}×
                </div>
              );
            })}
          </div>
          <div style={{ flex: "1 1 auto" }} />
          <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textLabel }}>
            T+{hms(t)} / 02:15:00
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="dt-btn-ghost"
            style={{
              padding: "7px 13px",
              borderRadius: 6,
              border: exported ? `1px solid ${color.accentDim}` : "1px solid #2b3238",
              fontSize: 12,
              fontWeight: 600,
              color: exported ? color.accent : color.textDim,
              cursor: "pointer",
              background: "transparent",
            }}
          >
            {exported ? "Exported ✓" : "Export run"}
          </button>
        </div>

        <div
          onClick={scrub}
          style={{ position: "relative", height: 40, borderRadius: 7, background: "#0d1013", border: "1px solid #1f252a", overflow: "hidden", cursor: "pointer" }}
        >
          <svg viewBox="0 0 900 40" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
            <polyline
              className="dt-chart-line"
              pathLength="1"
              points="0,31 60,29 120,30 180,27 240,28 300,26 360,25 420,23 480,19 540,14 600,10 660,8 720,7 780,6 840,6 900,5"
              fill="none"
              stroke={color.accentDim}
              strokeWidth="1.6"
            />
            <rect x="480" y="0" width="420" height="40" fill="rgba(255,77,61,.07)" />
            <line x1="480" y1="0" x2="480" y2="40" stroke="#8d979f" strokeWidth="1.2" />
            <line x1="620" y1="0" x2="620" y2="40" stroke={color.danger} strokeWidth="1.5" />
          </svg>
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: color.text, left: `${pct}%` }} />
          <div
            style={{
              position: "absolute",
              top: -3,
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: color.text,
              border: `2px solid ${color.bg}`,
              left: `calc(${pct}% - 4px)`,
            }}
          />
          <div style={{ position: "absolute", left: 486, top: 5, fontFamily: font.mono, fontSize: 11.5, color: color.textMuted }}>
            ONSET
          </div>
          <div style={{ position: "absolute", left: 626, top: 5, fontFamily: font.mono, fontSize: 11.5, color: color.dangerSoft }}>
            MISFIRE
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="dt-btn-ghost"
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        border: "1px solid #2b3238",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontFamily: font.mono,
        fontSize: 11,
        color: color.textDim,
      }}
    >
      {children}
    </div>
  );
}

function HudTile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      style={{
        minWidth: 76,
        padding: "8px 11px",
        borderRadius: 5,
        background: danger ? "rgba(24,14,13,.9)" : "rgba(11,13,15,.88)",
        border: danger ? "1px solid #3d1f1c" : "1px solid #232a2f",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.1em" }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 600, color: danger ? color.danger : color.accent }}>
        {value}
      </span>
    </div>
  );
}

const XAI_DRIVERS = [
  { label: "EGT 3 residual", value: "+0.42", color: color.danger },
  { label: "Injector pulse width", value: "+0.31", color: color.danger },
  { label: "Vib 174 Hz band", value: "+0.19", color: color.text },
  { label: "Throttle transients", value: "+0.11", color: color.text },
  { label: "Oil temp", value: "−0.06", color: color.accent },
];

const PREDICTED_FAULTS = [
  { title: "Cyl 3 injector coking", rul: "18.4 h", conf: "CONF 94.2% · ±2.1 h", color: color.dangerSoft, rulColor: color.danger },
  { title: "Exhaust valve seat wear", rul: "62 h", conf: "CONF 58.0% · ±14 h", color: color.text, rulColor: color.text },
  { title: "Alternator brush wear", rul: "210 h", conf: "CONF 22.0% · ±40 h", color: color.textDim, rulColor: color.accent },
];

function TelemetryPanel({ params, xai, onXaiChange }: { params: SimParams; xai: XaiTab; onXaiChange: (xai: XaiTab) => void }) {
  return (
    <div style={{ borderLeft: `1px solid ${color.border}`, background: color.panelBg, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 18px 18px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 10, flex: "0 0 auto" }}>
        <SectionLabel>ENVIRONMENT</SectionLabel>
        <SyncRowLight label="OAT" value={oatLabel(params.oat)} />
        <SyncRowLight label="DENSITY ALT" value="21 400 ft" />
        <SyncRowLight label="MIXTURE" value={mixLabel(params.mix)} />
      </div>

      <div style={{ padding: "20px 18px 18px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
        <SectionLabel>LIVE CHANNELS</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ChannelTile label="RPM" value={rpmLabel(params.throttle)} />
          <ChannelTile label="MAP" value="27.4 inHg" />
          <ChannelTile label="OIL PRESS" value="3.9 bar" />
          <ChannelTile label="OIL TEMP" value="96 °C" />
          <ChannelTile label="FUEL FLOW" value="12.4 kg/h" />
          <ChannelTile label="VIB RMS" value="2.8 g" danger />
        </div>
      </div>

      <div style={{ padding: "20px 18px 18px 18px", borderBottom: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>PREDICTED FAULTS</SectionLabel>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>RUL</span>
        </div>
        {PREDICTED_FAULTS.map((f) => (
          <div
            key={f.title}
            className="dt-glow-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              padding: "12px 14px",
              border: `1px solid ${color.border}`,
              background: color.panelBgAlt,
              ...glowVars(f.rulColor === color.danger),
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: f.color }}>{f.title}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, fontWeight: 600, color: f.rulColor }}>{f.rul}</span>
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>{f.conf}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "20px 18px 28px 18px", display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
        <SectionLabel>WHY</SectionLabel>
        <div style={{ display: "flex", gap: 2, padding: 3, background: color.wellBg, border: `1px solid ${color.border}`, borderRadius: 7 }}>
          {XAI_TABS.map(({ key, label }) => {
            const t = tabStyle(xai === key);
            return (
              <div
                key={key}
                onClick={() => onXaiChange(key)}
                className="dt-tab"
                style={{
                  flex: "1 1 0",
                  textAlign: "center",
                  padding: "6px 4px",
                  borderRadius: 4,
                  fontSize: 11,
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

        {xai === "drivers" && <XaiDrivers />}
        {xai === "residual" && <XaiResidual />}
        {xai === "reasoning" && <XaiReasoning />}
      </div>
    </div>
  );
}

function SyncRowLight({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 11, color: color.textLabel }}>
      <span>{label}</span>
      <span style={{ color: color.text }}>{value}</span>
    </div>
  );
}

function ChannelTile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className="dt-glow-card"
      style={{
        background: color.panelBgAlt,
        border: `1px solid ${color.border}`,
        padding: "10px 11px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        ...glowVars(!!danger),
      }}
    >
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLabel, letterSpacing: "0.09em" }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: danger ? color.danger : color.accent }}>
        {value}
      </span>
    </div>
  );
}

function XaiDrivers() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {XAI_DRIVERS.map((d, i) => (
        <div
          key={d.label}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 42px",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
            color: color.textDim,
            padding: "7px 0",
            borderBottom: i < XAI_DRIVERS.length - 1 ? `1px solid ${color.borderSoft}` : undefined,
          }}
        >
          <span>{d.label}</span>
          <span style={{ fontFamily: font.mono, textAlign: "right", color: d.color }}>{d.value}</span>
        </div>
      ))}
      <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel3 }}>SHAP ATTRIBUTION · 120 s WINDOW</div>
    </div>
  );
}

function XaiResidual() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative", width: "100%" }}>
        <svg viewBox="0 0 300 128" preserveAspectRatio="none" style={{ width: "100%", height: 128, display: "block" }}>
          <line x1="0" y1="88" x2="300" y2="88" stroke={color.accentDim} strokeWidth="1" />
          <rect x="0" y="80" width="300" height="16" fill="rgba(79,179,145,.12)" />
          <line x1="0" y1="58" x2="300" y2="58" stroke={color.danger} strokeOpacity=".35" strokeDasharray="4 4" strokeWidth="1" />
          <polyline
            className="dt-chart-line"
            pathLength="1"
            points="0,86 25,89 50,85 75,90 100,84 125,87 150,80 175,72 200,62 225,50 250,38 275,28 300,22"
            fill="none"
            stroke={color.danger}
            strokeWidth="2"
          />
        </svg>
        <span
          style={{
            position: "absolute",
            left: 4,
            top: 40,
            fontFamily: font.mono,
            fontSize: 10.5,
            color: color.dangerSoft,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          3σ ENVELOPE
        </span>
      </div>
      <div style={{ fontSize: 12, color: color.textMuted, lineHeight: 1.55 }}>
        Twin predicts 704 °C, engine reports 838 °C. Residual leaves the noise band at T+01:38 and grows
        monotonically, a physics mismatch rather than measurement noise.
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 10.5, color: color.textLabel3 }}>
        <span>HYBRID THERMO + GRU</span>
        <span>R² 0.981</span>
      </div>
    </div>
  );
}

function XaiReasoning() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: color.textDim, lineHeight: 1.62, textWrap: "pretty" }}>
        Cylinder 3 shows a widening gap between commanded and delivered fuel while every upstream channel stays
        nominal. With the 174 Hz sideband and a rising EGT the thermodynamic model cannot reproduce, the evidence
        points to restricted spray from a coked injector rather than ignition or sensor failure.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${color.borderSoft}`, paddingTop: 12 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel3, letterSpacing: "0.1em" }}>
          MAINTENANCE ADVISORY
        </span>
        <span style={{ fontSize: 12.5, color: color.text, lineHeight: 1.55 }}>
          Ultrasonic clean or replace cyl 3 injector within 18 h TSN. Borescope the exhaust valve at the same visit.
        </span>
      </div>
    </div>
  );
}
