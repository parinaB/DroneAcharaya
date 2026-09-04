"use client";

/**
 * The real MQ-9 Reaper glTF (public/models/mq9-reaper/) as a static airframe
 * backdrop -- see that folder's license.txt for the required CC-BY-4.0
 * attribution, surfaced in EngineScene's own overlay, not here.
 *
 * This is a single unrigged shell (2 flat meshes, no propeller node, no
 * engine/cylinder geometry -- confirmed by inspecting scene.gltf directly).
 * It cannot itself animate a propeller or glow per-cylinder, so those
 * effects are separate sibling objects in EngineScene.tsx (PropellerDisc,
 * CylinderGlow) positioned near the model rather than parts of it. What
 * IS driven here is whole-airframe motion any telemetry-driven UAV should
 * plausibly show: a gentle roll from throttle (nose-up under power) and the
 * vibration jitter applied by the parent VibrationRig wrapping this.
 */

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";

const MODEL_PATH = "/models/mq9-reaper/scene.gltf";

export interface DroneProps {
  /** 0..1 throttle fraction (EngineFrame.throttle) -- drives a subtle
   * nose-up roll under power, purely cosmetic, never a substitute for the
   * gauge readouts. */
  throttle: number;
}

export function Drone({ throttle }: DroneProps) {
  const { scene } = useGLTF(MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current === null) return;
    const targetPitch = -throttle * 0.08; // radians, small and deliberate
    groupRef.current.rotation.x += (targetPitch - groupRef.current.rotation.x) * Math.min(1, delta * 2);
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={0.9} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
