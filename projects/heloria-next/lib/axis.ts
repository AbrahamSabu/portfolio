/**
 * Which way is the axis of rotation.
 *
 * Trivial, and it lives in its own file because it has to be reachable from the
 * test suite — which runs under Node's TypeScript stripping and cannot parse
 * JSX, so it can never import the component that uses it.
 *
 * The whole build is authored in one frame: profiles lie in XY, thickness runs
 * along Z, and every `rotation.z` in the scene turns about that same Z.
 * `ExtrudeGeometry` agrees. `CylinderGeometry` does not — it builds along Y. So
 * a bare cylinder standing among these plates lies *flat in their plane*, and
 * the crank pin did exactly that for the whole of step 2: a rod on its side,
 * scything through the cross once per revolution, under fifty passing checks.
 *
 * Plan view cannot see it. A sideways pin and an upright one are the same
 * circle from above, and every geometric check in this project works from
 * above.
 */

/** Rotation that turns a Y-built cylinder into a Z-aligned axle. */
export const AXLE_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0];

/**
 * Where a Y-built cylinder's axis ends up under a three.js Euler rotation.
 *
 * That is the second column of the XYZ rotation matrix — the image of (0,1,0).
 * Written out rather than pulled from three.js so the test does not have to
 * load a rendering library to answer a question about an arrow.
 */
export function axleAxis(
  [x, y, z]: readonly [number, number, number] = AXLE_ROTATION,
): readonly [number, number, number] {
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return [
    -cy * sz,
    cx * cz - sx * sy * sz,
    sx * cz + cx * sy * sz,
  ] as const;
}

/** True when a cylinder under this rotation stands along the plate normal, Z. */
export function axleAlignsWithPlateNormal(
  rotation: readonly [number, number, number] = AXLE_ROTATION,
) {
  return Math.abs(axleAxis(rotation)[2]) > 1 - 1e-9;
}
