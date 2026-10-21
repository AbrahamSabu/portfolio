/**
 * Involute spur gears.
 *
 * The gear train's job is contrast. Everything downstream of it stops — that is
 * the entire point of a Geneva — so there has to be something upstream that
 * visibly never does. Gears turning smoothly into a mechanism that refuses to
 * is the argument the whole assembly is making, and it only lands if the gears
 * are real gears rather than notched discs.
 *
 * ── Why involute and not something easier ────────────────────────────────────
 *
 * A tooth flank shaped as the involute of a circle has one property nothing
 * else does: the contact point slides along a fixed straight line, so the
 * velocity ratio is constant through the whole mesh. Triangular teeth, or an
 * arc "close enough" to a flank, bind and release once per tooth — at any real
 * frame rate that reads as a wheel that is subtly alive in the wrong way.
 *
 * ── The geometry ─────────────────────────────────────────────────────────────
 *
 * For a gear of N teeth, module m and pressure angle α:
 *
 *     pitch radius      rp = mN/2
 *     base radius       rb = rp·cos α
 *     addendum (tip)    ra = rp + m
 *     dedendum (root)   rf = rp − 1.25m
 *
 * A point of the involute at radius r stands at polar angle inv(α_r) from where
 * the curve leaves the base circle, where α_r = acos(rb/r) and
 * inv(x) = tan x − x. Tooth thickness at the pitch circle is half the circular
 * pitch, so a tooth spans π/N there, and the flank must therefore leave the
 * base circle at −(π/2N + inv α) from the tooth's own centreline.
 *
 * Below the base circle the involute does not exist, so the flank runs radially
 * into the root. That is what real cutters leave behind too.
 */

import * as THREE from "three";

export type GearSpec = {
  teeth: number;
  /** tooth size; two gears only mesh if they share it */
  module: number;
  /** radians; 20° is the modern standard and what these are drawn at */
  pressureAngle?: number;
  /**
   * Circular backlash at the pitch circle, as a fraction of the module.
   *
   * Two gears cut to nominal thickness mesh with their flanks exactly in
   * contact, which is correct on paper and unbuildable — and here it means an
   * interference test cannot separate "meshing" from "grinding", because both
   * come out as touching. Real gears are cut thin. So are these.
   */
  backlash?: number;
};

const TAU = Math.PI * 2;
const DEFAULT_ALPHA = (20 * Math.PI) / 180;

/** inv(x) = tan x − x. */
export const involute = (x: number) => Math.tan(x) - x;

export const alphaOf = (g: GearSpec) => g.pressureAngle ?? DEFAULT_ALPHA;
/** Half a tooth at the pitch circle, after backlash. */
export const halfToothAngle = (g: GearSpec) =>
  Math.PI / (2 * g.teeth) - ((g.backlash ?? 0.06) * g.module) / (2 * pitchRadius(g));
export const pitchRadius = (g: GearSpec) => (g.module * g.teeth) / 2;
export const baseRadius = (g: GearSpec) => pitchRadius(g) * Math.cos(alphaOf(g));
export const tipRadius = (g: GearSpec) => pitchRadius(g) + g.module;
export const rootRadius = (g: GearSpec) => pitchRadius(g) - 1.25 * g.module;

/** Distance between the centres of two meshing gears. */
export const centreDistance = (a: GearSpec, b: GearSpec) =>
  pitchRadius(a) + pitchRadius(b);

/** Angular velocity ratio, negative because meshed spur gears counter-rotate. */
export const gearRatio = (drivein: GearSpec, driven: GearSpec) =>
  -drivein.teeth / driven.teeth;

/**
 * Fewer than this and the cutter undercuts the flank near the root, which
 * weakens the tooth and — more to the point here — makes it visibly pinched.
 */
export const MIN_TEETH = 17;

/**
 * Polar angle of the involute flank at radius `r`, from the tooth centreline.
 *
 * Negative: this is the trailing flank. Below the base circle there is no
 * involute, so it holds at the base value and the caller runs a radial line.
 */
function flankAngle(r: number, g: GearSpec) {
  const rb = baseRadius(g);
  const alpha = alphaOf(g);
  // half a tooth at the pitch circle, less half the backlash
  const half =
    Math.PI / (2 * g.teeth) -
    ((g.backlash ?? 0.06) * g.module) / (2 * pitchRadius(g));
  const start = -(half + involute(alpha)); // where the flank leaves the base circle
  if (r <= rb) return start;
  return start + involute(Math.acos(Math.min(1, rb / r)));
}

/**
 * The gear outline, one tooth centreline on the +x axis.
 *
 * Walked as: root arc, up the trailing flank, across the tip, down the leading
 * flank, root arc, and so on. `steps` samples each flank; 10 is plenty at this
 * size and 4 already shows as faceting on the tip.
 */
export function gearShape(g: GearSpec, steps = 10, bore?: number): THREE.Shape {
  if (g.teeth < MIN_TEETH) {
    throw new Error(`${g.teeth} teeth undercuts; ${MIN_TEETH} is the floor`);
  }
  const rb = baseRadius(g);
  const ra = tipRadius(g);
  const rf = rootRadius(g);
  const pitch = TAU / g.teeth;
  const lo = Math.max(rf, rb); // where the involute can actually start

  const s = new THREE.Shape();
  const at = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;

  for (let i = 0; i < g.teeth; i++) {
    const c = i * pitch; // this tooth's centreline

    /* Root arc, from the previous tooth's leading flank to this one's
       trailing flank. Both sit at the same angle by symmetry. */
    const trailRoot = c + flankAngle(rf, g);
    if (i === 0) s.moveTo(...at(rf, trailRoot));
    else s.absarc(0, 0, rf, c - pitch + -flankAngle(rf, g), trailRoot, false);

    // radial run up to the base circle, where the involute begins
    if (rf < rb) s.lineTo(...at(lo, c + flankAngle(lo, g)));

    // trailing flank
    for (let k = 1; k <= steps; k++) {
      const r = lo + ((ra - lo) * k) / steps;
      s.lineTo(...at(r, c + flankAngle(r, g)));
    }

    // across the tip
    s.absarc(0, 0, ra, c + flankAngle(ra, g), c - flankAngle(ra, g), false);

    // leading flank, back down
    for (let k = steps - 1; k >= 0; k--) {
      const r = lo + ((ra - lo) * k) / steps;
      s.lineTo(...at(r, c - flankAngle(r, g)));
    }

    if (rf < rb) s.lineTo(...at(rf, c - flankAngle(rf, g)));
  }

  s.closePath();
  /* A bore for the shaft, when asked — see withBore in genevaParts. Cut
     here rather than by the caller so the hole is part of the shape every
     renderer extrudes. */
  if (bore && bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

/**
 * The angle to set the driven gear to so its spaces take the driver's teeth.
 *
 * With both gears drawn with a tooth centreline on their own +x axis and placed
 * along the line of centres, the driven gear needs a *space* centreline
 * pointing back down that line. Its spaces sit half a pitch from its teeth, so
 * the answer is π − π/N — and since the gear repeats every 2π/N, only that
 * remainder matters.
 *
 * Derived, and then checked: `gears.test.mts` sweeps a full revolution and
 * asserts no tooth of either gear is ever inside the other. A phase that is
 * wrong by half a pitch produces two gears grinding straight through each
 * other, which at a glance looks exactly like two gears meshing.
 */
export function meshPhase(driven: GearSpec) {
  const pitch = TAU / driven.teeth;
  const raw = Math.PI - Math.PI / driven.teeth;
  return ((raw % pitch) + pitch) % pitch;
}

/** Where a driven gear sits, given the driver's angle. */
export function meshAngle(driverAngle: number, driver: GearSpec, driven: GearSpec) {
  return driverAngle * gearRatio(driver, driven) + meshPhase(driven);
}

/**
 * Same, for a pair whose line of centres does not lie on the x-axis.
 *
 * `meshPhase` is derived for the driven gear sitting at bearing 0 from the
 * driver. Put it anywhere else and the phase is wrong by that bearing — which
 * produces two gears grinding through each other while looking, in every still,
 * exactly like two gears meshing. Rotating a meshing pair rigidly keeps it
 * meshing, so: rotate into the canonical frame, solve, rotate back.
 */
export function meshAngleAt(
  driverAngle: number,
  driver: GearSpec,
  driven: GearSpec,
  bearing: number,
) {
  return meshAngle(driverAngle - bearing, driver, driven) + bearing;
}

/**
 * The driver's angle, given where the driven gear has to be.
 *
 * Backwards from the usual direction, and that is the direction the scene needs
 * it: the wheel is bolted to the Geneva's input shaft, so its angle is decided
 * elsewhere and the pinion has to follow. Inverting `meshAngleAt` rather than
 * eyeballing it keeps one description of the mesh.
 */
export function driverAngleFor(
  drivenAngle: number,
  driver: GearSpec,
  driven: GearSpec,
  bearing: number,
) {
  // meshAngleAt(a) = (a − β)·ratio + phase + β, so invert about β
  const ratio = gearRatio(driver, driven);
  return (drivenAngle - bearing - meshPhase(driven)) / ratio + bearing;
}
