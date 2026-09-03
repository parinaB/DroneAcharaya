"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./_components/Sidebar";
import { TopBar } from "./_components/TopBar";
import { LiveDashboard } from "./_components/LiveDashboard";
import { LiveModelPanel } from "./_components/LiveModelPanel";
import { SimulationView } from "./_components/SimulationView";
import { LoadingScreen } from "./_components/LoadingScreen";
import { color } from "./_lib/tokens";
import {
  DEFAULT_SIM_PARAMS,
  SIM_RUN_LENGTH,
  THEME_STORAGE_KEY,
  type Camera,
  type Screen,
  type SimParams,
  type Theme,
  type XaiTab,
} from "./_lib/state";

export default function DashboardPage() {
  const [booting, setBooting] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [screen, setScreen] = useState<Screen>("dashboard");
  const [acknowledged, setAcknowledged] = useState(false);

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [t, setT] = useState(5306);
  const [scenario, setScenario] = useState(1);
  const [camera, setCamera] = useState<Camera>("eng");
  const [xai, setXai] = useState<XaiTab>("drivers");
  const [fullscreen, setFullscreen] = useState(false);
  const [params] = useState<SimParams>(DEFAULT_SIM_PARAMS);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => (prev + speed) % SIM_RUN_LENGTH);
    }, 1000);
    return () => clearInterval(id);
  }, [playing, speed]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // localStorage unavailable (private mode, etc.) -- default theme stands.
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  };

  const openPrediction = () => {
    setScreen("simulation");
    setScenario(1);
    setXai("drivers");
  };
  const whyThisPrediction = () => {
    setScreen("simulation");
    setScenario(1);
    setXai("reasoning");
  };

  return (
    <>
      {booting && <LoadingScreen onDone={() => setBooting(false)} />}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <div
        className="dt-root"
        data-theme={theme}
        style={{
          display: "flex",
          height: "100vh",
          minHeight: 800,
          width: "100%",
          minWidth: 1280,
          overflow: "hidden",
          background: color.bg,
          color: color.text,
          fontFamily: "Archivo, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: "antialiased",
          opacity: booting ? 0 : 1,
          transition: "opacity 500ms ease",
        }}
      >
        <Sidebar
          screen={screen}
          onScreenChange={setScreen}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        />

        <main style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <TopBar screen={screen} theme={theme} onToggleTheme={toggleTheme} />

          <div key={screen} className="dt-screen-enter" style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
            {booting ? null : screen === "dashboard" ? (
              <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                <LiveModelPanel />
                <LiveDashboard
                  acknowledged={acknowledged}
                  onAcknowledge={() => setAcknowledged((a) => !a)}
                  onOpenPrediction={openPrediction}
                  onWhyThisPrediction={whyThisPrediction}
                />
              </div>
            ) : (
              <SimulationView
                scenario={scenario}
                onScenarioChange={setScenario}
                params={params}
                playing={playing}
                onTogglePlay={() => setPlaying((p) => !p)}
                speed={speed}
                onSpeedChange={setSpeed}
                t={t}
                onSeek={(next) => {
                  setPlaying(false);
                  setT(next);
                }}
                camera={camera}
                onCameraChange={setCamera}
                xai={xai}
                onXaiChange={setXai}
                fullscreen={fullscreen}
                onToggleFullscreen={() => setFullscreen((f) => !f)}
              />
            )}
          </div>
        </main>
      </div>
    </>
  );
}
