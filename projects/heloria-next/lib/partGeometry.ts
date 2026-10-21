/**
 * Every part's geometry, built once, for both renderers.
 *
 * The page and the software renderer each built their own copy of this list
 * from the same functions with the same arguments — and "the same arguments"
 * was a promise kept by hand. Now that every part has a bore sized to the
 * shaft it turns on, a copy that forgot one bore would put a shaft through a
 * solid gear in one renderer and not the other, and the stills would stop
 * being evidence about the page. So there is one list.
 */

import * as THREE from "three";
import {
  CROWN_IN,
  CROWN_OUT,
  FLYWHEEL_R,
  GEAR_BEVEL,
  PINION_IN,
  PINION_OUT,
  SPUR_LOW,
  SPUR_TOP,
  boreFor,
  type Machine,
  type ShaftKey,
} from "./assembly.ts";
import { crownGeometry } from "./crown.ts";
import { flywheelShape } from "./flywheel.ts";
import { FREEWHEEL, hubShape, starShape } from "./freewheel.ts";
import { gearShape } from "./gears.ts";
import { axleGeometry, crankShape, crossShape, extrude, lockDiscShape } from "./genevaParts.ts";
import { TRAIN } from "./train.ts";

export function partGeometry(M: Machine) {
  const { d1, d2, t } = M;
  /* Each extruded part pays back its own bevel — see boreFor. */
  const bore = (k: ShaftKey, bevel = 0) => boreFor(M, k, bevel);
  return {
    cross1: extrude(crossShape(TRAIN.stage1, d1, bore("shaftCross1", d1.bevel)), t.plate, d1.bevel, 40),
    /* The locking discs are rings already: their inner arc runs the long way
       round, leaving a bore wider than the shaft. */
    disc1: extrude(lockDiscShape(TRAIN.stage1, d1), t.plate, d1.bevel, 40),
    crank1: extrude(crankShape(TRAIN.stage1, d1, bore("shaftDriver1", d1.bevel)), t.crank, d1.bevel, 32),
    cross2: extrude(crossShape(TRAIN.stage2, d2, bore("shaftCross2", d2.bevel)), d2.thickness, d2.bevel, 40),
    disc2: extrude(lockDiscShape(TRAIN.stage2, d2), d2.thickness, d2.bevel, 40),
    crank2: extrude(crankShape(TRAIN.stage2, d2, bore("shaftDriver2", d2.bevel)), t.crank, d2.bevel, 32),
    spurTop: extrude(gearShape(SPUR_TOP, 10, bore("shaftInput", GEAR_BEVEL)), t.gear, GEAR_BEVEL, 6),
    spurLow: extrude(gearShape(SPUR_LOW, 10, bore("shaftLow", GEAR_BEVEL)), t.gear, GEAR_BEVEL, 6),
    pinionIn: extrude(gearShape(PINION_IN, 10, bore("shaftLow", GEAR_BEVEL)), t.gear, GEAR_BEVEL, 6),
    pinionOut: extrude(gearShape(PINION_OUT, 10, bore("shaftDriver2", GEAR_BEVEL)), t.gear, GEAR_BEVEL, 6),
    crownIn: crownGeometry(CROWN_IN, t.crown, bore("shaftDriver1")),
    crownOut: crownGeometry(CROWN_OUT, t.crown, bore("shaftCross1")),
    flywheel: extrude(flywheelShape(FLYWHEEL_R, 6, bore("shaftInput", d1.bevel * 0.5)), t.flywheel, d1.bevel * 0.5, 22),
    star: extrude(starShape(FREEWHEEL, bore("shaftCross2", d2.bevel)), t.freewheel, d2.bevel, 24),
    hub: extrude(hubShape(FREEWHEEL), t.freewheel, d2.bevel, 24),
    roller: axleGeometry(FREEWHEEL.roller, t.freewheel * 0.94, 24),
  };
}

/**
 * A shaft's cylinder and where its middle sits along its frame's axis.
 *
 * Centred at the origin like every other axle, so a renderer places it at
 * `at` along its frame — the same place for both.
 */
export function shaftGeometry(M: Machine, k: ShaftKey, segments = 18) {
  const s = M.shafts[k];
  return {
    geometry: axleGeometry(s.r, s.to - s.from, segments) as THREE.BufferGeometry,
    at: (s.from + s.to) / 2,
    radius: s.r,
    length: s.to - s.from,
  };
}
