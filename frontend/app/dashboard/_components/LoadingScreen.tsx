"use client";

import { useEffect, useRef, useState } from "react";
import { font } from "../_lib/tokens";

const FILL_MS = 2200;
const HOLD_MS = 350;

/** Always-dark literal colors, not the theme tokens: this screen renders
 * outside `.dt-root` (it boots before the theme choice is even known), so
 * the `color.*` CSS-variable tokens have nothing to resolve against here. */
const boot = {
  bg: "#000000",
  text: "#e8ebed",
  textLabel: "#6f7981",
  textLabel2: "#626c74",
  accent: "#39ff14",
  accentDim: "#1f8a35",
  track: "#1c2125",
  mark: "#1d2427",
} as const;

/** Full-screen boot sequence shown on every mount; fills a progress bar to
 * 100% then calls onDone so the dashboard beneath can fade in. */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      // ease-out-ish: fast start, settles into place near 100%.
      const linear = Math.min(1, elapsed / FILL_MS);
      const eased = 1 - Math.pow(1 - linear, 2);
      setProgress(Math.round(eased * 100));
      if (linear < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setExiting(true), HOLD_MS);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const id = setTimeout(onDone, 420);
    return () => clearTimeout(id);
  }, [exiting, onDone]);

  return (
    <div
      className={exiting ? "dt-loading dt-loading-exit" : "dt-loading"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        background: boot.bg,
        color: boot.text,
        fontFamily: font.sans,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div
          className="dt-loading-mark"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: boot.mark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="dt-loading-spin"
            style={{
              width: 20,
              height: 20,
              border: `3px solid ${boot.accent}`,
              borderRadius: "50%",
              borderRightColor: "transparent",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.12em" }}>DRONACHARYA</div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: boot.textLabel2,
              letterSpacing: "0.16em",
            }}
          >
            A DIGITAL TWIN · MALE UAV PROPULSION
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 260 }}>
        <div
          style={{
            width: "100%",
            height: 4,
            borderRadius: 999,
            background: boot.track,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: 999,
              background: `linear-gradient(90deg, ${boot.accentDim}, ${boot.accent})`,
              transition: "width 80ms linear",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: boot.textLabel,
            letterSpacing: "0.08em",
          }}
        >
          {progress < 100 ? "BOOTING DIGITAL TWIN" : "READY"} · {progress}%
        </div>
      </div>
    </div>
  );
}
