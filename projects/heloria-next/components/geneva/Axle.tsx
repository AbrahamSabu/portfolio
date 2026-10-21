import { AXLE_ROTATION } from "@/lib/axis";

/**
 * A cylinder whose axis is the mechanism's axis of rotation.
 *
 * This exists because of one bug. Everything in this build is authored in a
 * frame where profiles lie in XY and thickness runs along Z — which is what
 * `ExtrudeGeometry` does, and what `rotation.z` on a driver or a cross means.
 * `CylinderGeometry` does not follow that frame: it builds along Y. So a plain
 * `<cylinderGeometry>` dropped in beside these plates comes out lying *flat in
 * their plane*, and the crank pin spent step 2 on its side, sweeping through
 * the cross once per revolution.
 *
 * It was invisible to fifty numeric checks, because those all work in plan and
 * in plan a sideways pin is the same circle as an upright one. It was invisible
 * in stills for the same reason. The fix on its own is one rotation; this
 * component is so the fix cannot be forgotten the next time a shaft is added.
 */
export function Axle({
  radius,
  length,
  radiusBottom,
  segments = 32,
  position = [0, 0, 0],
  castShadow,
  receiveShadow,
  children,
}: {
  radius: number;
  length: number;
  radiusBottom?: number;
  segments?: number;
  position?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <mesh
      position={position}
      rotation={AXLE_ROTATION}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <cylinderGeometry
        args={[radius, radiusBottom ?? radius, length, segments]}
      />
      {children}
    </mesh>
  );
}

export { AXLE_ROTATION, axleAlignsWithPlateNormal } from "@/lib/axis";
