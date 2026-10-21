/**
 * The Genevas as mounted — not as designed.
 *
 *   node lib/mounted.test.mts
 *
 * Every other suite here checks a mechanism in its own coordinates: the crank
 * at `theta` from the line of centres, the cross at `cross`, the roller in the
 * slot. All of that can be perfectly right and still come out wrong on screen,
 * because the scene does not draw parts in those coordinates — it draws them
 * through the frame matrices in `lib/assembly`, and a frame whose local X does
 * not lie along the line of centres silently rotates the whole relationship.
 *
 * So this takes the roller's position in WORLD space, carries it into the
 * cross's own frame, and asks the only question that matters: is it in a slot?
 * If the answer is no, the mechanism is not a mechanism, however good its
 * kinematics are.
 */

import * as THREE from "three";
import { machine } from "./assembly.ts";
import { crossShape, dims } from "./genevaParts.ts";
import { TRAIN, reduction, solveTrain } from "./train.ts";

const M = machine(TRAIN);
const { d1, d2, frames: F, z } = M;
const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(52)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(52)} ${detail}`);
  }
}

type Pt = readonly [number, number];
const poly = (spec: { slots: number; centres: number }, d: ReturnType<typeof dims>) =>
  crossShape(spec, d).extractPoints(64).shape.map((q) => [q.x, q.y] as Pt);

const inside = (px: number, py: number, pg: readonly Pt[]) => {
  let hit = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i];
    const [xj, yj] = pg[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/**
 * Follow one stage round: where is its roller, in its cross's own frame?
 *
 * `driverFrame` is the frame the crank is drawn in, `crossFrame` the one the
 * cross is drawn in, exactly as the scene uses them.
 */
function trace(
  name: string,
  spec: { slots: number; centres: number },
  d: ReturnType<typeof dims>,
  driverFrame: THREE.Matrix4,
  crossFrame: THREE.Matrix4,
  datum: number,
  angles: (driver: number) => { theta: number; cross: number; engaged: boolean },
) {
  const profile = poly(spec, d);
  const toCross = crossFrame.clone().invert();

  let inMetal = 0;
  let engagedButOut = 0;
  let lockedButIn = 0;
  let worstReach = 0;
  let firstBad = NaN;
  const N = 1440;

  for (let k = 0; k < N; k++) {
    const drv = (k / N) * TAU * reduction(TRAIN);
    const a = angles(drv);

    /* The roller, placed exactly as the scene places it: in the driver's frame,
       turned by theta, out at the crank radius, on the datum plane. */
    const world = new THREE.Vector3(d.crank, 0, datum)
      .applyMatrix4(
        driverFrame.clone().multiply(new THREE.Matrix4().makeRotationZ(a.theta)),
      );

    // into the cross's frame, undoing the cross's own rotation
    const local = world.clone().applyMatrix4(toCross);
    const un = local
      .clone()
      .applyMatrix4(new THREE.Matrix4().makeRotationZ(-a.cross));

    const r = Math.hypot(un.x, un.y);
    if (inside(un.x, un.y, profile)) {
      inMetal++;
      if (Number.isNaN(firstBad)) firstBad = deg(drv);
    }
    if (a.engaged) {
      // engaged means the pin is inside the rim, in a slot
      if (r > d.rim + 1e-6) {
        engagedButOut++;
        if (Number.isNaN(firstBad)) firstBad = deg(drv);
      }
      worstReach = Math.max(worstReach, r);
    } else if (r < d.rim - 1e-6) {
      lockedButIn++;
      if (Number.isNaN(firstBad)) firstBad = deg(drv);
    }
  }

  check(`${name}: roller is never in the metal`, inMetal === 0,
    inMetal ? `${inMetal}/${N} samples, first at input ${firstBad.toFixed(1)}°` : `${N} samples`);
  check(`${name}: engaged means inside the rim`, engagedButOut === 0,
    engagedButOut ? `${engagedButOut}/${N} outside while indexing` : `deepest reach ${worstReach.toFixed(4)} ≤ rim ${d.rim.toFixed(4)}`);
  check(`${name}: locked means clear of the rim`, lockedButIn === 0,
    lockedButIn ? `${lockedButIn}/${N} inside while locked` : "never inside during a dwell");
}

// ===========================================================================

trace(
  "stage 1",
  TRAIN.stage1,
  d1,
  F.driver1.matrix,
  F.cross1.matrix,
  z.datum1,
  (drv) => {
    const s = solveTrain(drv, TRAIN);
    return { theta: s.stage1.theta, cross: s.stage1.cross, engaged: s.stage1.engaged };
  },
);

trace(
  "stage 2",
  TRAIN.stage2,
  d2,
  F.geneva2.matrix,
  F.cross2.matrix,
  z.datum2,
  (drv) => {
    const s = solveTrain(drv, TRAIN);
    return { theta: s.stage2.theta, cross: s.stage2.cross, engaged: s.stage2.engaged };
  },
);

// ===========================================================================
// The frames themselves
// ===========================================================================
{
  /* A frame's local +X has to lie along the line of centres, because that is
     the axis the Geneva's own angles are measured from. Anything else rotates
     the crank and the cross by the same amount about DIFFERENT points, which
     is not a rigid motion and does not cancel. */
  const lineOf = (a: THREE.Matrix4, b: THREE.Matrix4) =>
    new THREE.Vector3()
      .setFromMatrixPosition(b)
      .sub(new THREE.Vector3().setFromMatrixPosition(a))
      .normalize();
  const localX = (m: THREE.Matrix4) =>
    new THREE.Vector3().setFromMatrixColumn(m, 0).normalize();

  const one = localX(F.driver1.matrix).dot(lineOf(F.driver1.matrix, F.cross1.matrix));
  check("stage 1's driver frame faces its cross", one > 1 - 1e-9,
    `local +X · line of centres = ${one.toFixed(6)}`);

  const oneCross = localX(F.cross1.matrix).dot(lineOf(F.driver1.matrix, F.cross1.matrix));
  check("stage 1's cross frame faces away from its driver", oneCross > 1 - 1e-9,
    `${oneCross.toFixed(6)} — crossShape puts the driver at local 180°`);

  const two = localX(F.geneva2.matrix).dot(lineOf(F.geneva2.matrix, F.cross2.matrix));
  check("stage 2's driver frame faces its cross", two > 1 - 1e-9,
    `${two.toFixed(6)}`);

  const twoCross = localX(F.cross2.matrix).dot(lineOf(F.geneva2.matrix, F.cross2.matrix));
  check("stage 2's cross frame faces away from its driver", twoCross > 1 - 1e-9,
    `${twoCross.toFixed(6)}`);

  /* And the centre distances have to be what the kinematics assumed. */
  const c1 = new THREE.Vector3()
    .setFromMatrixPosition(F.cross1.matrix)
    .distanceTo(new THREE.Vector3().setFromMatrixPosition(F.driver1.matrix));
  const c2 = new THREE.Vector3()
    .setFromMatrixPosition(F.cross2.matrix)
    .distanceTo(new THREE.Vector3().setFromMatrixPosition(F.geneva2.matrix));
  check("stage 1's centres are as solved", Math.abs(c1 - TRAIN.stage1.centres) < 1e-9,
    `${c1.toFixed(6)} vs ${TRAIN.stage1.centres}`);
  check("stage 2's centres are as solved", Math.abs(c2 - TRAIN.stage2.centres) < 1e-9,
    `${c2.toFixed(6)} vs ${TRAIN.stage2.centres}`);

  /* Both parts of a stage must share a plane, or the roller misses entirely. */
  const axis1 = new THREE.Vector3().setFromMatrixColumn(F.driver1.matrix, 2).normalize();
  const axis1c = new THREE.Vector3().setFromMatrixColumn(F.cross1.matrix, 2).normalize();
  const axis2 = new THREE.Vector3().setFromMatrixColumn(F.geneva2.matrix, 2).normalize();
  const axis2c = new THREE.Vector3().setFromMatrixColumn(F.cross2.matrix, 2).normalize();
  check("each stage's two axes are parallel",
    axis1.dot(axis1c) > 1 - 1e-9 && axis2.dot(axis2c) > 1 - 1e-9,
    `stage 1 ${axis1.dot(axis1c).toFixed(6)}, stage 2 ${axis2.dot(axis2c).toFixed(6)}`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
