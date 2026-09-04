"use client";

/**
 * A procedural propeller stand-in -- the real glTF model has no separate
 * propeller node to animate (see Drone.tsx's docstring), so this is a
 * separate, simple mesh positioned near the nose rather than a modification
 * of the model itself. Two thin crossed blades on a hub, spinning at a rate
 * driven purely by EngineFrame.rpm normalized against
 * contract/telemetry-schema.yaml's own valid_range -- never a hardcoded max.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { normalize } from "../../lib/telemetry-ranges";
import { scene3dColor } from "./tokens";

export interface PropellerDiscProps {
  rpm: number;
  position: [number, number, number];
}

const MAX_RADIANS_PER_SECOND = Math.PI * 20; // visual ceiling at rpm's schema max, not a physical prop ratio

export function PropellerDisc({ rpm, position }: PropellerDiscProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current === null) return;
    const fraction = normalize("rpm", rpm);
    // Spins around X (the fuselage's nose-to-tail axis, per NOSE_POSITION's
    // own docstring in EngineScene.tsx) -- blades extend in the YZ plane
    // (below) so this sweeps them like an actual propeller disc, not a
    // rotation around their own long axis.
    groupRef.current.rotation.x += fraction * MAX_RADIANS_PER_SECOND * delta;
  });

  // Blade span sized against the model's own measured extent (~0.5 total
  // height/width post-scale) -- a fraction of the airframe, not an
  // arbitrary large number disconnected from the actual model's scale.
  const bladeSpan = 0.34;
  const hubRadius = 0.02;

  return (
    <group position={position} ref={groupRef}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[hubRadius, hubRadius, 0.02, 12]} />
        <meshStandardMaterial color={scene3dColor.textFaint} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[bladeSpan, 0.018, 0.006]} />
        <meshStandardMaterial color={scene3dColor.textDim} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh rotation={[0, 0, 0]}>
        <boxGeometry args={[0.006, 0.018, bladeSpan]} />
        <meshStandardMaterial color={scene3dColor.textDim} metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}
