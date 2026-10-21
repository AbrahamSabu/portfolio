/**
 * The crown meshes AS MOUNTED, not as designed.
 *
 *   node lib/crownMounted.test.mts
 *
 * `crown.test.mts` checks a crown with its teeth pointing +Z and a pinion at
 * its +X radius, which is the orientation the maths was derived in. Neither
 * crown in this machine is mounted that way: both are flipped so their teeth
 * point down, and the input one meshes on the −X radius rather than the +X.
 *
 * A flip mirrors the frame. A half-turn about the axis shifts the tooth phase
 * by half the tooth count. Either can turn a correct mesh into two wheels
 * grinding through each other while leaving the *direction* of rotation
 * perfectly right — which is exactly what a rolling-contact check confirms and
 * cannot detect.
 *
 * So: the real frames, the real angles, the real transforms the scene uses.
 */

import * as THREE from "three";
import {
  CROWN_IN,
  CROWN_OUT,
  PINION_IN,
  PINION_OUT,
  machine,
} from "./assembly.ts";
import {
  crownDepth,
  crownHalfAngle,
  crownInner,
  crownOuter,
  crownPinionAngle,
  type CrownSpec,
} from "./crown.ts";
import { anglesAt } from "./drive.ts";
import { gearShape, type GearSpec } from "./gears.ts";
import { reduction, TRAIN } from "./train.ts";

const M = machine();
const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(48)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(48)} ${detail}`);
  }
}

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const RZ = (a: number) => new THREE.Matrix4().makeRotationZ(a);
const FLIP = new THREE.Matrix4().makeRotationX(Math.PI);

/** Is a point inside a crown's teeth, in the crown's OWN local frame? */
function insideTeeth(c: CrownSpec, p: THREE.Vector3) {
  const H = crownDepth(c);
  if (p.z < 0 || p.z > H) return false;
  const r = Math.hypot(p.x, p.y);
  if (r < crownInner(c) || r > crownOuter(c)) return false;
  const pitch = TAU / c.teeth;
  const bearing = Math.atan2(p.y, p.x);
  const delta = bearing - Math.round(bearing / pitch) * pitch;
  return Math.abs(delta) < crownHalfAngle(c, r, p.z);
}

/**
 * Sweep one crown pair through a full cycle and count penetrations.
 *
 * `crownWorld` and `pinionWorld` build exactly the transforms the scene builds,
 * flip and all — that is the entire point of this file.
 */
function sweep(
  label: string,
  crown: CrownSpec,
  pinion: GearSpec,
  crownWorld: (t: number) => THREE.Matrix4,
  pinionWorld: (t: number) => THREE.Matrix4,
  faceHalf: number,
  samples = 480,
  /** false for the deliberately-broken run, which is expected to find plenty */
  assertClean = true,
) {
  const profile = gearShape(pinion).extractPoints(6).shape.map((q) => [q.x, q.y] as const);
  const p = new THREE.Vector3();
  const H = crownDepth(crown);

  let hits = 0;
  let firstAt = NaN;
  let closest = Infinity;

  for (let k = 0; k < samples; k++) {
    const at = (k / samples) * TAU * reduction(TRAIN);
    const toCrown = crownWorld(at).clone().invert();
    const pw = pinionWorld(at);

    for (const [u, v] of profile) {
      for (let f = -2; f <= 2; f++) {
        p.set(u, v, (f / 2) * faceHalf).applyMatrix4(pw).applyMatrix4(toCrown);
        if (p.z < -0.02 || p.z > H + 0.02) continue;
        if (insideTeeth(crown, p)) {
          hits++;
          if (Number.isNaN(firstAt)) firstAt = at;
        } else {
          const r = Math.hypot(p.x, p.y);
          if (r > crownInner(crown) && r < crownOuter(crown) && p.z > 0 && p.z < H) {
            const pitch = TAU / crown.teeth;
            const b = Math.atan2(p.y, p.x);
            const d = Math.abs(b - Math.round(b / pitch) * pitch);
            closest = Math.min(closest, (d - crownHalfAngle(crown, r, p.z)) * r);
          }
        }
      }
    }
  }

  if (assertClean) {
    check(`${label}: meshes without grinding`, hits === 0,
      hits === 0
        ? `${samples} positions, closest approach ${closest === Infinity ? "n/a" : closest.toFixed(4)}`
        : `${hits} penetrations, first at input ${deg(firstAt).toFixed(1)}°`);
  }
  return hits;
}

// ===========================================================================
// The input crown: flipped, meshed on the −X radius
// ===========================================================================
{
  /* The pinion's own half-thickness, not the crown's band. Sampling across the
     band tests metal the pinion does not have: it is 0.056 thick against a
     0.070 band, so a third of every "penetration" was phantom material outside
     the part. */
  const faceHalf = M.t.gear / 2;
  sweep(
    "input crown",
    CROWN_IN,
    PINION_IN,
    (t) =>
      M.frames.driver1.matrix
        .clone()
        .multiply(T(0, 0, M.z.crownIn))
        .multiply(FLIP)
        .multiply(RZ(-anglesAt(t).driver1)),
    (t) => M.frames.inputLow.matrix.clone().multiply(RZ(anglesAt(t).spurLow)),
    faceHalf,
  );
}

// ===========================================================================
// The output crown: upright now, meshed on the +X radius
// ===========================================================================
{
  const faceHalf = M.t.gear / 2;
  sweep(
    "output crown",
    CROWN_OUT,
    PINION_OUT,
    (t) =>
      M.frames.cross1.matrix
        .clone()
        .multiply(T(0, 0, M.z.crownOut))
        .multiply(RZ(anglesAt(t).cross1)),
    (t) => M.frames.driver2.matrix.clone().multiply(RZ(anglesAt(t).driver2)),
    faceHalf,
  );
}

// ===========================================================================
// The guard's guard
// ===========================================================================
{
  const faceHalf = M.t.gear / 2;
  const halfPitch = TAU / PINION_IN.teeth / 2;
  const detuned = sweep(
    "detuned",
    CROWN_IN,
    PINION_IN,
    (t) =>
      M.frames.driver1.matrix
        .clone()
        .multiply(T(0, 0, M.z.crownIn))
        .multiply(FLIP)
        .multiply(RZ(-anglesAt(t).driver1)),
    (t) =>
      M.frames.inputLow.matrix.clone().multiply(RZ(anglesAt(t).spurLow + halfPitch)),
    faceHalf,
    120,
    false,
  );
  check("half a pitch out still grinds", detuned > 0,
    `${detuned} penetrations when detuned`);

  /* And the failure that shipped: driving a teeth-down crown as though it were
     teeth-up. No constant offset can rescue it, which is the tell — an inverted
     rate is right at one instant and progressively wronger after. */
  const asIfUp = sweep(
    "as if mounted up",
    CROWN_IN,
    PINION_IN,
    (t) =>
      M.frames.driver1.matrix
        .clone()
        .multiply(T(0, 0, M.z.crownIn))
        .multiply(FLIP)
        .multiply(RZ(-anglesAt(t).driver1)),
    (t) =>
      M.frames.inputLow.matrix
        .clone()
        .multiply(RZ(crownPinionAngle(anglesAt(t).driver1, CROWN_IN, PINION_IN.teeth))),
    faceHalf,
    120,
    false,
  );
  check("driving a flipped crown as if upright grinds", asIfUp > 1000,
    `${asIfUp} penetrations — what shipped`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
