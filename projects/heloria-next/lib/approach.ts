/**
 * Which way each part comes in, and from how far.
 *
 * Every part slides onto its own shaft, along it, the way a machine is put
 * together. What this table decides is from WHICH end: a part further along
 * a shaft than one already fitted has to come from the other side, or it
 * slides through it. That is what the assembly did before this existed — the
 * input pinion through the spur gear beside it, shafts through the solid
 * middles of the gears they carry, the output hub through the standard.
 *
 * A fixed table, not a calculation, because the calculation needs every
 * part's real geometry and the page has no business extruding the machine
 * twice to decide which way a gear points. `approach.test.mts` builds the
 * geometry and holds every entry here to it: each part's whole path, from
 * where it starts to where it seats, clear of everything already fitted, at
 * every angle the machine could be at while it slides.
 */

import type { PartKey } from "./build.ts";

/** How far a part travels along its shaft on its way in. */
export const APPROACH_LENGTH = 0.5;

export type Approach = { dir: 1 | -1; length: number };

const IN = { dir: 1, length: APPROACH_LENGTH } as const;
/** From the other end of the shaft. */
const BACK = { dir: -1, length: APPROACH_LENGTH } as const;
/**
 * A shorter run, for the two spur gears: from the front of their shafts they
 * would start out past the flywheel, which is fitted first and sits further
 * out, and from the back the pinion is in the way. 0.40 starts them just short
 * of it — still far enough to be seen coming.
 */
const SHORT = { dir: 1, length: 0.4 } as const;

export const APPROACH: Record<PartKey, Approach> = {
  bed: IN,
  shaftInput: IN,
  shaftLow: IN,
  shaftDriver1: IN,
  shaftCross1: IN,
  standard: IN,
  flywheel: IN,
  pinionIn: IN,
  spurLow: SHORT,
  spurTop: SHORT,
  crownIn: IN,
  crank1: IN,
  pin1: IN,
  disc1: IN,
  cross1: IN,
  crownOut: IN,
  shaftDriver2: IN,
  pinionOut: IN,
  crank2: IN,
  pin2: IN,
  disc2: IN,
  /* In through the second cross's end, not out through the standard: the far
     end of this shaft runs in the standard's bearing. */
  shaftCross2: BACK,
  cross2: IN,
  star: IN,
  hub: IN,
};
