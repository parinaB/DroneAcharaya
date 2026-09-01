"use client";

import { color, font } from "../_lib/tokens";

const CYLINDERS = [
  { label: "CYL 1", pct: 68, cht: 203, egt: 712, critical: false },
  { label: "CYL 2", pct: 71, cht: 211, egt: 726, critical: false },
  { label: "CYL 3", pct: 95, cht: 248, egt: 838, critical: true },
  { label: "CYL 4", pct: 66, cht: 199, egt: 704, critical: false },
];

const SUBSYSTEMS = [
  { label: "Combustion", score: 44, critical: true },
  { label: "Fuel & injection", score: 52, critical: true },
  { label: "Cooling", score: 63, critical: false },
  { label: "Lubrication", score: 81, critical: false },
  { label: "Sensor integrity", score: 88, critical: false },
  { label: "Battery / alternator", score: 92, critical: false },
];

const ANOMALIES = [
  {
    dot: color.danger,
    title: "Misfire detected, cyl 3",
    detail: "Instability index 0.71 (limit 0.30) · 01:38:26",
    dim: false,
  },
  {
    dot: "#6b7a80",
    title: "Overheating trend, CHT 3",
    detail: "Projected redline in 11 min at current power · 01:37:04",
    dim: false,
  },
  {
    dot: "#6b7a80",
    title: "Injection timing drift",
    detail: "Pulse width +6.2% vs commanded map · 01:31:55",
    dim: false,
  },
  {
    dot: color.accentDim,
    title: "Sensor drift auto-corrected",
    detail: "Oil temp probe re-referenced to twin · 00:58:12",
    dim: true,
  },
];

export interface LiveDashboardProps {
  acknowledged: boolean;
  onAcknowledge: () => void;
  onOpenPrediction: () => void;
  onWhyThisPrediction: () => void;
}

export function LiveDashboard({ acknowledged, onAcknowledge, onOpenPrediction, onWhyThisPrediction }: LiveDashboardProps) {
  return (
    <div
      style={{
        flex: "1 1 auto",
        overflowY: "auto",
        padding: "0 0 40px 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CriticalFaultSection acknowledged={acknowledged} onAcknowledge={onAcknowledge} onOpenPrediction={onOpenPrediction} />
      <QuickStatsSection />
      <DetailSection />
      <BottomSection onWhyThisPrediction={onWhyThisPrediction} />
    </div>
  );
}

function CriticalFaultSection({
  acknowledged,
  onAcknowledge,
  onOpenPrediction,
}: {
  acknowledged: boolean;
  onAcknowledge: () => void;
  onOpenPrediction: () => void;
}) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          padding: "30px 32px 34px 30px",
          borderRight: `1px solid ${color.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          background: color.panelBgAlt,
          transition: "opacity .25s ease",
          opacity: acknowledged ? 0.72 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            className={acknowledged ? undefined : "dt-pulse"}
            style={{ width: 7, height: 7, borderRadius: "50%", background: acknowledged ? "#6b7a80" : color.danger, transition: "background-color .25s ease" }}
          />
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.16em",
              color: acknowledged ? color.textLabel : color.danger,
              transition: "color .25s ease",
            }}
          >
            {acknowledged ? "CRITICAL FAULT · ACKNOWLEDGED" : "CRITICAL FAULT"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.14,
              fontWeight: 700,
              letterSpacing: "-0.022em",
              textWrap: "balance",
            }}
          >
            Cylinder 3 misfire with combustion instability
          </h1>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: color.textMuted, textWrap: "pretty" }}>
            EGT rising 8 °C/min against a falling twin prediction. Injector pulse width drifting
            +6.2%; residual outside the 3σ envelope for 41 cycles.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: color.border,
            border: `1px solid ${color.border}`,
            borderRadius: 9,
            overflow: "hidden",
          }}
        >
          <StatBlock label="CONFIDENCE" value="94.2%" />
          <StatBlock label="RUL · INJECTOR 3" value="18.4 h" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontFamily: font.mono, fontSize: 9, color: color.textLabel, letterSpacing: "0.12em" }}>
            ADVISORY
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, color: color.text }}>
            Reduce power to 65%, enrich mixture, divert to nearest recovery site.
          </div>
        </div>

        <div style={{ display: "flex", gap: 9, marginTop: 2 }}>
          <button
            type="button"
            onClick={onOpenPrediction}
            className="dt-btn-danger"
            style={{
              padding: "10px 18px",
              borderRadius: 7,
              background: color.danger,
              color: "#150605",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
            }}
          >
            Open prediction
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="dt-btn-ghost"
            style={{
              padding: "10px 18px",
              borderRadius: 7,
              border: acknowledged ? `1px solid ${color.accentDim}` : "1px solid #2b3238",
              color: acknowledged ? color.accent : color.textDim,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
            }}
          >
            {acknowledged ? "Acknowledged ✓" : "Acknowledge"}
          </button>
        </div>
      </div>

      <TwinDivergenceChart />
    </section>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: color.panelBgAlt, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: font.mono, fontSize: 9, color: color.textLabel, letterSpacing: "0.12em" }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 600, color: color.danger }}>{value}</span>
    </div>
  );
}

function TwinDivergenceChart() {
  return (
    <div style={{ padding: "26px 30px 30px 30px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Twin divergence, cylinder 3 EGT</div>
          <div style={{ fontFamily: font.mono, fontSize: 10, color: color.textLabel, letterSpacing: "0.05em" }}>
            MEASURED VS PREDICTED · LAST 30 MIN
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <LegendSwatch color={color.danger} label="MEASURED" />
          <LegendSwatch color={color.accent} label="TWIN MODEL" />
        </div>
      </div>

      <div style={{ position: "relative", width: "100%" }}>
        <svg viewBox="0 0 820 250" preserveAspectRatio="none" style={{ width: "100%", height: 250, display: "block" }}>
          <g stroke="#1a1f23" strokeWidth="1">
            <line x1="0" y1="30" x2="820" y2="30" />
            <line x1="0" y1="85" x2="820" y2="85" />
            <line x1="0" y1="140" x2="820" y2="140" />
            <line x1="0" y1="195" x2="820" y2="195" />
            <line x1="0" y1="240" x2="820" y2="240" />
          </g>
          <line x1="0" y1="52" x2="820" y2="52" stroke={color.danger} strokeOpacity=".38" strokeWidth="1" strokeDasharray="5 5" />
          <path
            d="M0,200 65,196 130,198 195,190 260,186 325,180 390,175 455,166 520,146 585,124 650,100 715,78 780,60 820,52 L820,180 780,178 715,176 650,173 585,170 520,166 455,163 390,160 325,157 260,154 195,152 130,150 65,148 0,147 Z"
            fill="rgba(255,77,61,.10)"
          />
          <polyline
            points="0,147 65,148 130,150 195,152 260,154 325,157 390,160 455,163 520,166 585,170 650,173 715,176 780,178 820,180"
            fill="none"
            stroke={color.accent}
            strokeWidth="1.8"
          />
          <polyline
            points="0,200 33,197 65,196 98,199 130,198 163,193 195,190 228,192 260,186 293,183 325,180 358,183 390,175 423,171 455,166 488,157 520,146 553,136 585,124 618,113 650,100 683,90 715,78 748,68 780,60 820,52"
            fill="none"
            stroke={color.danger}
            strokeWidth="2.4"
          />
          <line x1="520" y1="0" x2="520" y2="250" stroke="#8d979f" strokeOpacity=".45" strokeWidth="1" strokeDasharray="3 4" />
          <circle cx="520" cy="146" r="4" fill={color.bg} stroke={color.text} strokeWidth="2" />
        </svg>
        <span
          style={{
            position: "absolute",
            left: 6,
            top: 32,
            fontFamily: font.mono,
            fontSize: 9.5,
            color: color.dangerSoft,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          EGT LIMIT 820 °C
        </span>
        <span
          style={{
            position: "absolute",
            left: "64.5%",
            top: 6,
            fontFamily: font.mono,
            fontSize: 9.5,
            color: color.textDim,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          ANOMALY ONSET 01:38:26
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 9.5, color: color.textLabel3 }}>
        {["01:12", "01:18", "01:24", "01:30", "01:36", "01:42"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function LegendSwatch({ color: swatchColor, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 10, color: "#97a1a8" }}>
      <span style={{ width: 13, height: 2, background: swatchColor }} />
      {label}
    </span>
  );
}

function QuickStatsSection() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
      }}
    >
      <QuickStat label="HEALTH INDEX" value="62" unit="/100" valueColor={color.danger} note="▼ 14 in 30 min" noteColor={color.dangerSoft} bordered />
      <QuickStat label="ENGINE SPEED" value="5 240" unit="RPM" valueColor={color.accent} note="MAP 27.4 inHg · 68% pwr" noteColor={color.textLabel} bordered />
      <QuickStat label="PEAK CHT · CYL 3" value="248" unit="°C" valueColor={color.danger} note="redline 260 · exceeded 2×" noteColor={color.dangerSoft} bordered />
      <QuickStat label="MISSION RELIABILITY" value="71" unit="%" valueColor={color.accent} note="endurance 6.2 h left" noteColor={color.textLabel} />
    </section>
  );
}

function QuickStat({
  label,
  value,
  unit,
  valueColor,
  note,
  noteColor,
  bordered,
}: {
  label: string;
  value: string;
  unit: string;
  valueColor: string;
  note: string;
  noteColor: string;
  bordered?: boolean;
}) {
  return (
    <div
      style={{
        padding: "22px 26px 24px 30px",
        borderRight: bordered ? `1px solid ${color.border}` : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: 9.5, color: color.textLabel, letterSpacing: "0.12em" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontFamily: font.mono, fontSize: 38, fontWeight: 600, lineHeight: 1, color: valueColor }}>
          {value}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textLabel }}>{unit}</span>
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, color: noteColor }}>{note}</div>
    </div>
  );
}

function DetailSection() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
        borderBottom: `1px solid ${color.border}`,
        flex: "0 0 auto",
      }}
    >
      <PerCylinderThermals />
      <VibrationSignature />
      <SubsystemHealth />
    </section>
  );
}

function PerCylinderThermals() {
  return (
    <div style={{ padding: "26px 26px 28px 30px", borderRight: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Per-cylinder thermals</div>
        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.textLabel, letterSpacing: "0.05em" }}>
          CHT / EGT · °C
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {CYLINDERS.map((cyl, i) => (
          <div
            key={cyl.label}
            style={{
              display: "grid",
              gridTemplateColumns: "52px 1fr auto",
              alignItems: "center",
              gap: 14,
              padding: "11px 0",
              borderBottom: i < CYLINDERS.length - 1 ? `1px solid ${color.borderSoft}` : undefined,
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                fontWeight: cyl.critical ? 600 : 400,
                color: cyl.critical ? color.danger : color.accent,
              }}
            >
              {cyl.label}
            </span>
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: cyl.critical ? "#2a1c1b" : "#1f252a",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${cyl.pct}%`,
                  height: "100%",
                  background: cyl.critical ? color.danger : color.accentDim,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: cyl.critical ? 600 : 400,
                color: cyl.critical ? color.danger : color.accent,
              }}
            >
              {cyl.cht} / {cyl.egt}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: font.mono,
          fontSize: 10,
          color: color.textLabel,
          borderTop: `1px solid ${color.border}`,
          paddingTop: 13,
        }}
      >
        <span>SPREAD 49 °C</span>
        <span style={{ color: color.dangerSoft }}>LIMIT 30 °C</span>
      </div>
    </div>
  );
}

const VIB_BARS = [
  { x: 4, h: 24 },
  { x: 18, h: 32 },
  { x: 32, h: 18 },
  { x: 46, h: 42 },
  { x: 60, h: 26 },
  { x: 74, h: 36 },
  { x: 88, h: 14 },
  { x: 102, h: 30 },
  { x: 130, h: 20 },
  { x: 144, h: 34 },
  { x: 158, h: 12 },
  { x: 172, h: 24 },
  { x: 186, h: 16 },
  { x: 200, h: 28 },
  { x: 214, h: 10 },
  { x: 228, h: 18 },
  { x: 242, h: 12 },
  { x: 256, h: 8 },
  { x: 270, h: 14 },
  { x: 284, h: 6 },
];

function VibrationSignature() {
  const bars = VIB_BARS;

  return (
    <div style={{ padding: "26px 26px 28px 26px", borderRight: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Vibration signature</div>
        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.textLabel, letterSpacing: "0.05em" }}>
          FFT · 0–500 HZ · g RMS
        </div>
      </div>
      <div style={{ position: "relative", width: "100%" }}>
        <svg viewBox="0 0 300 128" preserveAspectRatio="none" style={{ width: "100%", height: 128, display: "block" }}>
          <g fill="#3a4348">
            {bars.map((b) => (
              <rect key={b.x} x={b.x} y={128 - b.h} width="9" height={b.h} />
            ))}
          </g>
          <rect x="116" y="28" width="9" height="100" fill={color.danger} />
        </svg>
        <span
          style={{
            position: "absolute",
            left: "43%",
            top: 12,
            fontFamily: font.mono,
            fontSize: 9.5,
            color: color.dangerSoft,
            pointerEvents: "none",
          }}
        >
          174 Hz · 2.8 g
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: color.textMuted, lineHeight: 1.55 }}>
        Sideband at 2× firing order for cyl 3, matches misfire library entry{" "}
        <a href="#">VIB-0142</a>.
      </div>
    </div>
  );
}

function SubsystemHealth() {
  return (
    <div style={{ padding: "26px 30px 28px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Sub-system health</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {SUBSYSTEMS.map((s, i) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              padding: "9px 0",
              borderBottom: i < SUBSYSTEMS.length - 1 ? `1px solid ${color.borderSoft}` : undefined,
            }}
          >
            <span style={{ fontSize: 13, color: color.textDim }}>{s.label}</span>
            <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: s.critical ? color.danger : color.accent }}>
              {s.score}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: font.mono,
          fontSize: 10,
          color: color.textLabel,
          borderTop: `1px solid ${color.border}`,
          paddingTop: 13,
        }}
      >
        <span>NEXT MAINT.</span>
        <span style={{ color: color.dangerSoft }}>MOVED UP → 18.4 h</span>
      </div>
    </div>
  );
}

function BottomSection({ onWhyThisPrediction }: { onWhyThisPrediction: () => void }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", flex: "0 0 auto" }}>
      <AiDiagnosticSummary onWhyThisPrediction={onWhyThisPrediction} />
      <AnomalyFeed />
    </section>
  );
}

function AiDiagnosticSummary({ onWhyThisPrediction }: { onWhyThisPrediction: () => void }) {
  return (
    <div style={{ padding: "26px 30px 30px 30px", borderRight: `1px solid ${color.border}`, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>AI diagnostic summary</div>
        <div style={{ flex: "1 1 auto" }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            color: color.accent,
            border: "1px solid #24382f",
            padding: "3px 7px",
            borderRadius: 4,
          }}
        >
          EDGE · v2.4.1
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: color.textDim, textWrap: "pretty" }}>
        The hybrid thermodynamic + data-driven model attributes the divergence to{" "}
        <span style={{ color: color.text, fontWeight: 600 }}>progressive injector coking on cylinder 3</span>, not
        sensor drift. CHT and ionisation channels agree independently while the combustion model does not. Onset
        correlates with the third rapid throttle transition at 01:36.
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textLabel, letterSpacing: "0.04em" }}>
        RULED OUT · SENSOR DRIFT · LUBRICATION · IGNITION COIL
      </div>
      <button
        type="button"
        onClick={onWhyThisPrediction}
        className="dt-btn-ghost"
        style={{
          alignSelf: "flex-start",
          padding: "9px 16px",
          borderRadius: 7,
          border: "1px solid #2b3238",
          color: color.textDim,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          background: "transparent",
        }}
      >
        Why this prediction? →
      </button>
    </div>
  );
}

function AnomalyFeed() {
  return (
    <div style={{ padding: "26px 30px 30px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Anomaly feed</div>
        <span style={{ fontFamily: font.mono, fontSize: 9.5, color: color.textLabel, letterSpacing: "0.1em" }}>
          LIVE
        </span>
      </div>
      {ANOMALIES.map((a) => (
        <div key={a.title} style={{ display: "flex", gap: 13, padding: "12px 0", borderTop: `1px solid ${color.borderSoft}` }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: a.dot, marginTop: 6, flex: "0 0 5px" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: a.dim ? "#8d979f" : undefined }}>{a.title}</div>
            <div style={{ fontSize: 11.5, color: color.textFaint }}>{a.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
