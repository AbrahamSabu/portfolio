/**
 * Every angle in the machine, from one input angle.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * It did not, and the two renderers drifted. `lib/shot.mts` solved the input
 * spur pair properly; `Stage3.tsx` handed both gears the same angle, so on the
 * page two meshed wheels turned the same way at the same rate while the stills
 * showed them meshing correctly. The stills were not lying about the geometry —
 * they were describing a different machine.
 *
 * The palette was already shared for exactly this reason. The angles were not.
 * They are now: a scene's job is to put parts where this says, and nothing
 * else.
 *
 * ── The chain ────────────────────────────────────────────────────────────────
 *
 *   flywheel + spur top
 *        │ meshed, counter-rotating, 20:22
 *   spur low + crown pinion        ── one shaft
 *        │ crown mesh, 30:18
 *   crown in + crank 1 + disc 1    ── one shaft: stage 1's driver
 *        │ Geneva
 *   cross 1 + crown out            ── one shaft
 *        │ crown mesh, 24:18
 *   pinion out + crank 2 + disc 2  ── one shaft: stage 2's driver
 *        │ Geneva
 *   cross 2
 *
 * Parts on one shaft share an angle exactly. Parts across a mesh turn opposite
 * ways, in the tooth ratio. Both of those are asserted.
 */

import * as THREE from "three";
import {
  CROWN_IN,
  CROWN_OUT,
  PINION_IN,
  PINION_OUT,
  SPUR_LOW,
  SPUR_TOP,
  machine,
} from "./assembly.ts";
import { crownPinionAngle } from "./crown.ts";
import { HUB, restHub, stepHub, type HubSpec, type HubState } from "./freewheel.ts";
import { meshAngleAt } from "./gears.ts";
import { DRIVE } from "./motion.ts";
import { TRAIN, solveTrain, type TrainSpec } from "./train.ts";

export type Angles = {
  /** the solved train, for readouts */
  train: ReturnType<typeof solveTrain>;
  /** flywheel and the upper spur gear */
  spurTop: number;
  /** lower spur gear and the crown pinion — one shaft */
  spurLow: number;
  /** stage 1's driver: crown in, crank, locking disc */
  driver1: number;
  /** stage 1's cross, and the crown bolted under it */
  cross1: number;
  /** stage 2's shaft: output pinion, crank 2, locking disc 2 */
  driver2: number;
  /**
   * Stage 2's crank and locking disc — the same shaft as `driver2`.
   *
   * Two names for one shaft because they are clocked differently, not because
   * they turn differently: a Geneva's crank sits half a turn from the driver
   * angle its kinematics are written in (see geneva.ts), so this is `driver2`
   * plus π, wrapped. Same rate, always — drive.test.mts holds the offset
   * constant across a full cycle.
   *
   * Named here so a scene never reaches into the solved train for an angle. One
   * did, and when the crown's reversal moved `driver2` the crank stayed where it
   * was: a gear and the arm bolted to it turning opposite ways on one shaft.
   */
  crank2: number;
  /** stage 2's cross */
  cross2: number;
};

/**
 * Bearing of one shaft from another, in the first one's own frame.
 *
 * Worked out from the frames rather than written down, because a mesh phase
 * derived for one bearing and used at another is two gears grinding — and
 * moving a shaft is exactly the sort of change that would not think to come
 * back and update a constant.
 */
function bearingBetween(from: THREE.Matrix4, to: THREE.Matrix4) {
  const local = new THREE.Vector3()
    .setFromMatrixPosition(to)
    .applyMatrix4(from.clone().invert());
  return Math.atan2(local.y, local.x);
}

export function anglesAt(driver: number, spec: TrainSpec = TRAIN): Angles {
  const train = solveTrain(driver, spec);
  const M = machine(spec);

  /* Stage 1's driver shaft is the datum everything else is solved back from,
     because it is the one the Geneva's own kinematics are expressed in. */
  const driver1 = train.stage1.theta;
  const cross1 = train.stage1.cross;

  /* Up the input: the crown pinion is whatever crown IN demands, and the lower
     spur gear is on the same shaft as it. Crown IN is bolted teeth-down, which
     reverses its pinion; crown OUT is teeth-up and does not — see
     crownPinionAngle. */
  const inBearing = bearingBetween(M.frames.driver1.matrix, M.frames.inputLow.matrix);
  const spurLow = crownPinionAngle(driver1, CROWN_IN, PINION_IN.teeth, "down", inBearing);

  /* And the upper spur gear meshes that one — opposite way, 20:22. */
  const spurBearing = bearingBetween(M.frames.inputLow.matrix, M.frames.inputTop.matrix);
  const spurTop = meshAngleAt(spurLow, SPUR_LOW, SPUR_TOP, spurBearing);

  /* Down the output: crown OUT rides stage 1's cross, and stage 2's whole
     shaft is its pinion. */
  const outBearing = bearingBetween(M.frames.cross1.matrix, M.frames.driver2.matrix);
  /* `true`: this pinion's frame happens to put a tooth on its reference axis.
     An artefact of how `frameAt` built it, measured against the mounted mesh
     rather than assumed — see crownPinionAngle. */
  const driver2 = crownPinionAngle(
    cross1,
    CROWN_OUT,
    PINION_OUT.teeth,
    "up",
    outBearing,
    true,
  );

  return {
    train,
    spurTop,
    spurLow,
    driver1,
    cross1,
    driver2,
    crank2: train.stage2.theta,
    cross2: train.stage2.cross,
  };
}

/**
 * The output hub after a given number of input revolutions.
 *
 * Every other angle in this file is a function of the input angle and nothing
 * else — hand it 2.4 revolutions and it answers without having seen 0 through
 * 2.39. The hub is not like that and cannot be made like that. It carries
 * momentum through a clutch that has already let go, so where it is depends on
 * how it got there: the same slow cross, at the same angle, leaves the hub
 * spinning or nearly stopped depending on how long ago it was last kicked.
 *
 * So this integrates from rest. It is here rather than in `freewheel.ts`
 * because it is the one part of the clutch that needs to know what is driving
 * it, and the scenes need a hub angle for an arbitrary frame without keeping
 * their own copy of the integration and drifting from the stills again.
 *
 * Deterministic: same revolutions in, same hub out, and a step small enough
 * that halving it does not move the answer (checked in freewheel.test.mts).
 */
export function hubAt(
  revs: number,
  spec: TrainSpec = TRAIN,
  hubSpec: HubSpec = HUB,
  dt = 1 / 240,
): HubState {
  const rate = DRIVE.idle * Math.PI * 2;
  const steps = Math.max(1, Math.ceil((revs * Math.PI * 2) / rate / dt));
  let hub = restHub();
  let angle = 0;
  let last = anglesAt(0, spec).cross2;
  for (let k = 0; k < steps; k++) {
    angle += rate * dt;
    const cross = anglesAt(angle, spec).cross2;
    hub = stepHub(hub, (cross - last) / dt, dt, hubSpec);
    last = cross;
  }
  return hub;
}
