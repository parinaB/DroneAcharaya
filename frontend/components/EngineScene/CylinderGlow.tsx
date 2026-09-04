"use client";

/**
 * Four independent emissive markers standing in for the engine's cylinders
 * -- the real glTF model has no engine/cylinder geometry (exterior airframe
 * shell only), so these are separate small spheres near the model's
 * fuselage rather than parts of it. Each one's color/intensity is driven
 * ONLY by its own egt_c{n} value, independently of the other three -- this
 * is what makes a single-cylinder fault (e.g. injector fouling on C1)
 * visually distinguishable from a fleet-wide thermal issue: one sphere
 * glows hotter than its three siblings, exactly the diagnostic signature
 * failure-mode-matrix.csv describes for injector_degradation.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { normalize } from "../../lib/telemetry-ranges";

export interface CylinderGlowProps {
  egtC1: number;
  egtC2: number;
  egtC3: number;
  egtC4: number;
  /** Base position for cylinder 1; the other three are offset along X. */
  position: [number, number, number];
}

const COOL_COLOR = new THREE.Color("#3a6ea5");
const HOT_COLOR = new THREE.Color("#ff5d3d");
const SPACING = 0.22;

function CylinderMarker({ egt, x, z }: { egt: number; x: number; z: number }) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    if (materialRef.current === null) return;
    const fraction = normalize("egt_c1", egt); // all four cylinders share one schema range
    const color = COOL_COLOR.clone().lerp(HOT_COLOR, fraction);
    materialRef.current.color.copy(color);
    materialRef.current.emissive.copy(color);
    materialRef.current.emissiveIntensity = 0.4 + fraction * 2.2;
  });

  return (
    <mesh position={[x, 0, z]}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshStandardMaterial ref={materialRef} color={COOL_COLOR} emissive={COOL_COLOR} />
    </mesh>
  );
}

export function CylinderGlow({ egtC1, egtC2, egtC3, egtC4, position }: CylinderGlowProps) {
  const [baseX, baseY, baseZ] = position;
  const values = [egtC1, egtC2, egtC3, egtC4];

  return (
    <group position={[baseX, baseY, baseZ]}>
      {values.map((egt, i) => (
        <CylinderMarker key={i} egt={egt} x={i * SPACING - (SPACING * 3) / 2} z={0} />
      ))}
    </group>
  );
}
