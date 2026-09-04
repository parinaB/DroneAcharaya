"use client";

/**
 * Wraps the whole airframe group and applies a small positional jitter
 * driven by vibration_rms_x_bearing_proxy -- the actual field EngineFrame
 * carries on the wire (contract/telemetry-schema.yaml's vibration_rms_x/y/z
 * naming doesn't match the live schema; see the earlier decision to build
 * against EngineFrame, not the contract draft, for this reason).
 *
 * That field's valid_range upper bound is genuinely unspecified in the
 * schema ([0, TBD]) -- normalizeAdaptive() tracks the largest magnitude
 * seen so far THIS SESSION instead of assuming a fixed ceiling nothing in
 * the contract actually states, so the jitter scales honestly whatever the
 * real range of a given preset turns out to be, healthy or faulted.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { normalizeAdaptive } from "../../lib/telemetry-ranges";

export interface VibrationRigProps {
  vibrationRmsXBearingProxy: number;
  children: React.ReactNode;
}

// Floor keeps the jitter from being amplified into visible noise before any
// real excursion above a near-zero healthy baseline has been observed.
const ADAPTIVE_FLOOR = 0.05;
const MAX_JITTER_METERS = 0.03;

export function VibrationRig({ vibrationRmsXBearingProxy, children }: VibrationRigProps) {
  const groupRef = useRef<THREE.Group>(null);
  const seenMaxRef = useRef({ current: ADAPTIVE_FLOOR });
  const basePosition = useRef<[number, number, number]>([0, 0, 0]);

  useFrame((state) => {
    if (groupRef.current === null) return;
    const fraction = normalizeAdaptive(vibrationRmsXBearingProxy, seenMaxRef.current, ADAPTIVE_FLOOR);
    const t = state.clock.elapsedTime;
    const amplitude = fraction * MAX_JITTER_METERS;
    groupRef.current.position.set(
      basePosition.current[0] + Math.sin(t * 47) * amplitude,
      basePosition.current[1] + Math.cos(t * 53) * amplitude * 0.6,
      basePosition.current[2],
    );
  });

  return <group ref={groupRef}>{children}</group>;
}
