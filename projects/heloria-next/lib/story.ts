/**
 * Pointing at parts of the machine, and naming the views to watch it from.
 *
 * This file used to hold the narrative as well. The narrative is now an
 * assembly sequence and lives in `build.ts`; what is left here is the machinery
 * both it and the workbench figures need — where a label points, and how a
 * named view is looked up.
 *
 * ── Why labels exist at all ──────────────────────────────────────────────────
 *
 * Without them the figure is a handsome object doing something unexplained. The
 * sentence says "a crown gear turns the drive through a right angle" and the
 * reader is looking at forty machined parts with no idea which one that is.
 *
 * The labels say what a part *does*, not what a machinist would call it.
 * "Crown gear", "three-slot cross" and "cam" are shop terms: to anyone who is
 * not an engineer they are noise, and noise that makes a reader feel they are
 * missing something. What a part does is plainer, and is what the sentence
 * beside it is about anyway.
 */

import * as THREE from "three";

import { machine } from "./assembly.ts";
import { PRESETS, type Preset } from "./orbit.ts";

/**
 * A label pinned to a part of the machine.
 *
 * Given as a frame and an offset along it rather than a position, for the same
 * reason every other placement in this project is: a coordinate written down
 * here is a coordinate that stops matching the machine the first time a shaft
 * moves. `lib/assembly` already knows where everything is.
 */
export type Anchor = {
  label: string;
  /** a frame of the machine */
  frame:
    | "inputTop"
    | "inputLow"
    | "driver1"
    | "cross1"
    | "driver2"
    | "geneva2"
    | "cross2";
  /** how far along that frame's own axis */
  at:
    | "flywheel"
    | "spurTop"
    | "spurLow"
    | "pinionIn"
    | "crownIn"
    | "crank1"
    | "datum1"
    | "crownOut"
    | "pinionOut"
    | "crank2"
    | "datum2"
    | "freewheel";
  /** sideways within that frame, for two labels on one shaft */
  offset?: [number, number];
};

/**
 * Where a label points, in the scene's own coordinates.
 *
 * The machine group is shifted so its centre sits at the origin, so the offset
 * has to come off here too — otherwise every label is correct relative to a
 * machine that is not where it is drawn.
 */
export function anchorPoint(a: Anchor): [number, number, number] {
  const M = machine();
  const mid = new THREE.Vector3()
    .addVectors(M.bounds.min, M.bounds.max)
    .multiplyScalar(0.5);
  const [x, y] = a.offset ?? [0, 0];
  const p = new THREE.Vector3(x, y, M.z[a.at])
    .applyMatrix4(M.frames[a.frame].matrix)
    .sub(mid);
  return [p.x, p.y, p.z];
}

/**
 * A named view, by key.
 *
 * Throws rather than falling back, because a silent fallback is a camera
 * pointed at whatever happened to be first in the list — which looks like a
 * design decision and is a typo.
 */
export function viewFor(key: string): Preset {
  const p = PRESETS.find((v) => v.key === key);
  if (!p) throw new Error(`no view "${key}" — the story asked for one that does not exist`);
  return p;
}
