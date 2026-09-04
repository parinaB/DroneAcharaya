"use client";

/**
 * Top-level Three.js visualization for one replay session. Connects to the
 * live WebSocket stream via useTelemetryStream and renders the drone model
 * + telemetry-driven effects + the two indicator overlays + prediction
 * panel, all wired to the SAME useTelemetryStream output regardless of
 * which preset is playing -- there is deliberately no
 * `if (sessionId === ...)` or `if (runId === ...)` branch anywhere in this
 * tree. A new preset is handled correctly for free: useTelemetryStream
 * already resets its own state on every sessionId change (see that hook's
 * own effect), and every visual here derives from the current tick alone.
 */

import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { useTelemetryStream } from "../../hooks/useTelemetryStream";
import { CylinderGlow } from "./CylinderGlow";
import { Drone } from "./Drone";
import { GaugePanel } from "./GaugePanel";
import { HealthOverlay } from "./HealthOverlay";
import { PredictionPanel } from "./PredictionPanel";
import { PropellerDisc } from "./PropellerDisc";
import { font, sceneColor } from "./tokens";
import { VibrationRig } from "./VibrationRig";

export interface EngineSceneProps {
  /** A replay session_id from POST /replay/{run_id}/start, or null when no
   * session is active -- the scene shows a clean idle state in that case. */
  sessionId: string | null;
}

/** The glTF's raw mesh nose tip sits at approximately x=-0.95 (measured
 * directly from scene.gltf's POSITION accessor bounding box, confirmed by
 * rendering axis markers at +-X and reading which end is visually the
 * nose) -- negative X, not positive, contrary to an earlier guess that
 * placed the propeller off the tail instead. Scaled by Drone's own
 * scale={0.9} and nudged slightly further out so the disc clears the
 * airframe rather than intersecting it. */
const NOSE_POSITION: [number, number, number] = [-0.98, 0, 0];

/** A frame carrying an active sensor fault classification maps to the badge
 * dict GaugePanel attaches to specific gauges. Only the two channels
 * xgboost_classifier actually produces predictions for are ever populated
 * here -- never invented for a channel the model doesn't classify. */
function sensorFaultBadges(healthSensorFaultChtC3: string | null | undefined, healthSensorFaultBearing: string | null | undefined) {
  const badges: Record<string, string> = {};
  if (healthSensorFaultChtC3 && healthSensorFaultChtC3 !== "NONE") {
    badges.cht_c3 = healthSensorFaultChtC3;
  }
  if (healthSensorFaultBearing && healthSensorFaultBearing !== "NONE") {
    // xgboost_classifier's "bearing_vibration" channel maps to the
    // vibration-derived signal, not a literal EngineFrame gauge field --
    // no vibration reading is shown in GaugePanel today, so this is
    // surfaced via HealthOverlay's own sensor-recommendation row instead
    // of a GaugePanel badge with nothing to attach to.
  }
  return badges;
}

export function EngineScene({ sessionId }: EngineSceneProps) {
  const { status, interpolatedFrame, latest, errorMessage } = useTelemetryStream(sessionId);

  const badges = useMemo(
    () => sensorFaultBadges(latest?.health?.sensor_fault_cht_c3, latest?.health?.sensor_fault_bearing_vibration),
    [latest?.health?.sensor_fault_cht_c3, latest?.health?.sensor_fault_bearing_vibration],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: sceneColor.bg }}>
      <Canvas camera={{ position: [2.4, 1.2, 2.4], fov: 40 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 2]} intensity={1.4} />
        <Suspense fallback={null}>
          {interpolatedFrame && (
            <VibrationRig vibrationRmsXBearingProxy={interpolatedFrame.vibration_rms_x_bearing_proxy}>
              <Drone throttle={interpolatedFrame.throttle} />
              <PropellerDisc rpm={interpolatedFrame.rpm} position={NOSE_POSITION} />
              <CylinderGlow
                egtC1={interpolatedFrame.egt_c1}
                egtC2={interpolatedFrame.egt_c2}
                egtC3={interpolatedFrame.egt_c3}
                egtC4={interpolatedFrame.egt_c4}
                position={[0, 0.12, 0.1]}
              />
            </VibrationRig>
          )}
        </Suspense>
      </Canvas>

      <HealthOverlay health={latest?.health ?? null} />

      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <PredictionPanel health={latest?.health ?? null} />
      </div>

      {interpolatedFrame && (
        <div style={{ position: "absolute", bottom: 16, right: 16 }}>
          <GaugePanel frame={interpolatedFrame} sensorFaultBadges={badges} />
        </div>
      )}

      <ConnectionStatusBadge status={status} errorMessage={errorMessage} />

      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 16,
          fontFamily: font.mono,
          fontSize: 9,
          color: sceneColor.textFaint,
        }}
      >
        MQ-9 Reaper UAV Drone by Chenzoss (sketchfab.com/Chenzoss), CC-BY-4.0
      </div>
    </div>
  );
}

function ConnectionStatusBadge({ status, errorMessage }: { status: string; errorMessage: string | null }) {
  if (status === "live") return null; // no badge needed when everything is working
  const label = status === "connecting" ? "CONNECTING…" : status === "error" ? "CONNECTION LOST" : "STOPPED";
  const dotColor = status === "error" ? sceneColor.danger : status === "connecting" ? "#e8c547" : sceneColor.textFaint;
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(10, 13, 15, 0.9)",
        border: `1px solid ${sceneColor.border}`,
        borderRadius: 6,
        padding: "6px 12px",
        fontFamily: font.mono,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }} />
      <span style={{ color: sceneColor.text, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>{label}</span>
      {errorMessage && <span style={{ color: sceneColor.textMuted, fontSize: 10.5 }}>{errorMessage}</span>}
    </div>
  );
}
