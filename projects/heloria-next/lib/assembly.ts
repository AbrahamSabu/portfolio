/**
 * The machine: where every part is, and which way it faces.
 *
 * ── What changed, and why ────────────────────────────────────────────────────
 *
 * The first version of this file put every part on a parallel axis and a
 * parallel plane. That is not a small thing: it made the machine a flat drawing
 * with thickness, gave the eye no depth to read, and — because the two Geneva
 * stages ended up coaxial — put the slow stage directly in front of the fast
 * one, hiding it completely. Correct in every dimension and wrong to look at.
 *
 * So the drive now turns two right angles, through crown gears. There are three
 * families of axis in here:
 *
 *   the input shaft, horizontal, carrying a flywheel and a spur train
 *   stage 1, vertical, its plates lying flat like a machine bed
 *   stage 2, horizontal again and at 90° to the input, standing on edge
 *
 * ── Frames, not offsets ──────────────────────────────────────────────────────
 *
 * Parts are placed by a frame: a matrix whose local Z is the axis it turns
 * about and whose origin sits on that axis. A renderer mounts a part at a local
 * offset along Z and rotates it about local Z, and never has to know which way
 * the shaft points. When everything was parallel a single number could stand in
 * for this; it cannot now, and pretending otherwise is how parts end up facing
 * the wrong way with nothing able to detect it.
 */

import * as THREE from "three";
import {
  crownDepth,
  crownOuter,
  crownPitchHeight,
  crownPitchRadius,
  type CrownSpec,
} from "./crown.ts";
import { FREEWHEEL, hubOuter } from "./freewheel.ts";
import { pitchRadius, tipRadius, type GearSpec } from "./gears.ts";
import { dims, type Dims } from "./genevaParts.ts";
import { TRAIN, type TrainSpec } from "./train.ts";

/* ------------------------------------------------------------------- specs */

/** Tooth size, shared by everything that meshes. */
export const MODULE = 0.026;

/**
 * Chamfer on a gear tooth, and the backlash that pays for it.
 *
 * `ExtrudeGeometry` grows a profile outward by the bevel, so two meshing flanks
 * spend 2·bevel before anything turns. The plate chamfer used on the Geneva
 * plates is 0.006 — near a quarter of this module — and would eat the tooth,
 * not merely the backlash.
 */
export const GEAR_BEVEL = MODULE * 0.1;
const BACKLASH = 0.3;

/** Input: a spur pair on horizontal axes, then the pinion into crown A. */
/* 22, not 24. The second input shaft is offset perpendicular to its own axis
   — a spur mesh allows nothing else — and stage 1's crank sweeps a 0.789 disc
   a fixed 0.33 above it, so a gear of tip radius 0.338 fouls the crank once a
   revolution wherever it is put. 22 teeth clears it by 0.019. */
export const SPUR_TOP: GearSpec = { teeth: 22, module: MODULE, backlash: BACKLASH };
export const SPUR_LOW: GearSpec = { teeth: 20, module: MODULE, backlash: BACKLASH };
export const PINION_IN: GearSpec = { teeth: 18, module: MODULE, backlash: BACKLASH };

/**
 * Crown tooth counts must be even.
 *
 * Both crowns are meshed on their −X or +X radius, and swapping between those
 * is a rotation of π. That only leaves the tooth phase alone if π is a whole
 * number of pitches, which is N/2 — an integer exactly when N is even.
 */
export const CROWN_IN: CrownSpec = { teeth: 30, module: MODULE, backlash: BACKLASH };
export const CROWN_OUT: CrownSpec = { teeth: 24, module: MODULE, backlash: BACKLASH };
export const PINION_OUT: GearSpec = { teeth: 18, module: MODULE, backlash: BACKLASH };

/** The flywheel hangs off the far end of the input shaft. */
export const FLYWHEEL_R = 0.30;

/**
 * Where stage 2's line of centres points, in its own frame.
 *
 * Its driver shaft runs along world +X, so the line of centres lies in the YZ
 * plane and this angle picks a direction within it. Straight up: the slow wheel
 * is then the highest thing in the machine and sits directly over the shaft
 * that drives it. It used to lean back as well as up, which put the heaviest
 * part of the machine out on a diagonal from everything else.
 */
export const STAGE2_AIM = Math.PI / 2;

/**
 * How far out along its own shaft stage 2 sits, past the pinion.
 *
 * A layshaft, and it is structural rather than decorative. Stage 2's crank
 * radius is 0.87 of its centre distance — a three-slot Geneva swings its pin
 * *outside* its own cross — so mounted at the pinion it sweeps a circle that
 * passes clean through stage 1's cross plate twice a revolution, whichever way
 * the line of centres is aimed. The only place it fits is further along the
 * shaft, past the fast stage's rim.
 *
 * 0.52, found rather than chosen. At 0.44 the interference sweep reports stage
 * 2's crank through stage 1's cross at every one of 96 sampled positions; 0.48
 * is the first clean value. The extra is margin against the sweep being a
 * sample rather than a proof.
 */
export const STAGE2_REACH = 0.52;

/* ------------------------------------------------------------------ layout */

export type Frame = {
  /** local Z is the axis of rotation; the origin lies on it */
  matrix: THREE.Matrix4;
};

export type Machine = {
  d1: Dims;
  d2: Dims;
  frames: {
    /** horizontal, carries the flywheel and the top spur gear */
    inputTop: Frame;
    /** horizontal, carries the lower spur gear and the crown pinion */
    inputLow: Frame;
    /** vertical, stage 1's driver: crown IN, crank, locking disc */
    driver1: Frame;
    /** vertical, stage 1's cross: the cross, and crown OUT beneath it */
    cross1: Frame;
    /** horizontal along +X, stage 2's driver shaft: the output pinion */
    driver2: Frame;
    /** the same shaft, turned so local +X is stage 2's line of centres */
    geneva2: Frame;
    /** parallel to driver2, offset by stage 2's centre distance */
    cross2: Frame;
  };
  /** offsets along each frame's local Z */
  z: {
    flywheel: number;
    spurTop: number;
    spurLow: number;
    pinionIn: number;
    crownIn: number;
    crank1: number;
    datum1: number;
    crownOut: number;
    pinionOut: number;
    crank2: number;
    datum2: number;
    /** the freewheel's star, outboard of stage 2's cross on the same shaft */
    freewheel: number;
  };
  t: {
    plate: number;
    crank: number;
    gear: number;
    crown: number;
    flywheel: number;
    /** the clutch pack: star, rollers and hub all share one thickness */
    freewheel: number;
  };
  /** world-space bounding box of everything */
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  /**
   * The base plate, sized to what actually stands on it.
   *
   * It used to be cut from the whole bounding box, which was fine while the
   * machine was a low sprawl and absurd once it stood up: a slab as wide as the
   * tallest part is tall, with the mechanism growing off one corner of it. A
   * base plate is a thing shafts are footed in, so it is sized from the shafts
   * that are footed in it.
   */
  bed: { cx: number; cy: number; w: number; d: number; thickness: number };
  /**
   * The standard that carries the far end of stage 2's layshaft.
   *
   * Structural, not scenery. That shaft was cantilevered off the crown with
   * nothing under its outboard end, and the heaviest wheel in the machine hung
   * on the end of it — which is exactly why the thing read as leaning rather
   * than standing. A real machine would put a bearing there, so there is one.
   */
  post: { x: number; y: number; w: number; d: number; h: number };
  /**
   * Every shaft, defined once: which frame it lies along, its radius, and the
   * span it occupies along that frame's axis.
   *
   * These were written out separately in each renderer, and no two agreed
   * with the parts mounted on them: the upper crown sat above the top of its
   * shaft, the freewheel past the end of the output shaft, and the output
   * shaft ran back into the plane the second crank turns in — so every time
   * the crank pointed at it, its end passed through the shaft. Now each span
   * is derived from what it carries, and every part's bore from its shaft.
   */
  shafts: Record<ShaftKey, Shaft>;
};

export type ShaftKey =
  | "shaftInput"
  | "shaftLow"
  | "shaftDriver1"
  | "shaftCross1"
  | "shaftDriver2"
  | "shaftCross2";

export type Shaft = {
  frame: keyof Machine["frames"];
  r: number;
  from: number;
  to: number;
};

/**
 * How much bigger a bore is than its shaft, at its narrowest.
 *
 * At its narrowest, which is the middle of the plate: a bevelled extrusion
 * grows its outline and shrinks its holes by the bevel there, so a hole drawn
 * at the shaft radius plus this came out smaller than the shaft. Enough to
 * clear the clearance check's own tolerance; small enough to read as a fit.
 */
export const CLEAR = 0.004;

/**
 * The radius to draw a bore at, for a part turning on this shaft.
 *
 * `bevel` is the part's own chamfer, paid back so the hole is still CLEAR
 * wider than the shaft where the bevel pinches it.
 */
export const boreFor = (M: Machine, shaft: ShaftKey, bevel = 0) => M.shafts[shaft].r + CLEAR + bevel;

/**
 * Room left between the freewheel and the standard, for the freewheel's parts
 * to slide on from the outboard end of their shaft.
 *
 * The standard stood just clear of the hub, which left nowhere for the hub to
 * come from: the post blocked the outboard end and the second Geneva the
 * inboard one. Parts arrive along their own shaft, so the shaft has to have a
 * free end, and a real machine is assembled exactly this way — wheels onto
 * the shaft, then the outboard bearing. Further from the hub is also further
 * from being in front of it.
 */
export const APPROACH_ROOM = 0.56;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A frame from an origin and the direction its local Z should point. */
function frameAt(origin: THREE.Vector3, axis: THREE.Vector3, roll = 0): Frame {
  const z = axis.clone().normalize();
  /* Any perpendicular will do for local X; pick the one that keeps world Z
     "up" in the frame where that is meaningful, so rolls are predictable. */
  const ref = Math.abs(z.z) > 0.9 ? V(1, 0, 0) : V(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(ref, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
  return { matrix: roll ? m.multiply(new THREE.Matrix4().makeRotationZ(roll)) : m };
}

/**
 * Built once per spec and remembered.
 *
 * `machine()` is pure, and it was being called afresh on every invocation of
 * `anglesAt` — which the render loop calls sixty times a second, and each call
 * rebuilds every dimension, profile radius and frame matrix in the assembly.
 * It also made the test suite take minutes rather than seconds.
 */
const built = new Map<TrainSpec, Machine>();

export function machine(train: TrainSpec = TRAIN): Machine {
  const hit = built.get(train);
  if (hit) return hit;
  const made = buildMachine(train);
  built.set(train, made);
  return made;
}

function buildMachine(train: TrainSpec): Machine {
  const d1 = dims(train.stage1);
  const d2 = dims(train.stage2, 0.078);

  const plate = d1.thickness;
  const t = {
    plate,
    crank: plate * 0.78,
    gear: plate * 0.62,
    crown: plate * 0.55,
    flywheel: plate * 0.62,
    /* Thicker than a gear. A clutch carries its load on six line contacts
       rather than a tooth flank, and a roller thinner than it is wide reads as
       a washer that fell in. */
    freewheel: plate * 0.92,
  };
  /**
   * Daylight between one part and the next on a shaft.
   *
   * 0.16 of a plate — a hundredth of a unit — is a clearance, not a gap, and it
   * made the machine unreadable. Stage 1's locking disc and its cross came out
   * very nearly coplanar and read as one continuous slab, and each brass crown
   * sat so close under the plate above it that it looked like a skirt on that
   * plate rather than a separate gear.
   *
   * Nothing was wrong: every part was where the kinematics put it, and every
   * interference check passed. It was simply impossible to see what the thing
   * was made of. A full plate thickness of air between layers is what turns a
   * dense cluster back into an assembly you can count the parts of.
   */
  const gap = plate * 1.0;

  const rIn = pitchRadius(PINION_IN);
  const RpIn = crownPitchRadius(CROWN_IN);
  const RpOut = crownPitchRadius(CROWN_OUT);
  const rOut = pitchRadius(PINION_OUT);

  /* ---- heights, built up from the bed -------------------------------- */

  /** Input shaft: high enough that the biggest thing on it clears the bed. */
  /* 2.2 plates of clearance, not 1.2: at the lower figure the flywheel's rim
     came within a hundredth of the bed and the whole input assembly read as
     half-buried in it. */
  const hLow = Math.max(tipRadius(PINION_IN), tipRadius(SPUR_LOW)) + plate * 2.2;
  /** Crown IN takes its teeth downward, so its pitch plane is above the pinion. */
  const crownInPitch = hLow + rIn;
  const crownInFace = crownInPitch + crownPitchHeight(CROWN_IN);
  /** Stage 1's crank and datum stack above that. */
  const crank1 = crownInFace + t.crown + gap + t.crank / 2;
  const datum1 = crank1 + t.crank / 2 + gap + plate / 2;

  /* Crown OUT sits ON TOP of stage 1's cross, teeth up, and its pinion above
     that again — so stage 2 stacks over stage 1 instead of hanging beside it.
  
     It used to hang underneath. Nothing was wrong with that mechanically, but
     it made the drive dip downward before climbing again, and a chain that
     descends in the middle cannot produce a tall machine however the rest is
     arranged: the whole thing came out 3.4 wide and 2.2 tall, which is a
     landscape object on a page that scrolls vertically.
  
     Turning the crown over is not free. A teeth-up crown drives its pinion the
     other way, so the link between the two Geneva stages changes sign, and the
     output's direction — and therefore the freewheel's handedness — follows it.
     All of that is derived rather than written down, so it propagates; the
     crown mesh, the interference sweep and the shaft-direction checks are what
     say whether it propagated correctly. */
  const crownOutFace = datum1 + plate / 2 + gap + t.crown;
  const crownOutPitch = crownOutFace + crownPitchHeight(CROWN_OUT);
  const pinionOutZ = crownOutPitch + rOut;

  /* ---- frames -------------------------------------------------------- */

  /* Input: two horizontal shafts along X. The lower one carries the crown
     pinion and must sit on crown IN's −X radius, axis pointing at the crown's
     centre. The upper one is a spur pair above it, and the flywheel. */
  /* Along Y — into the depth of the machine rather than out to its side.
  
     A crown pinion only has to be *radial* to the crown it drives, and every
     horizontal direction is radial to a vertical shaft, so which one you pick
     is free. The old choice of −X cost 1.08 units of width: the flywheel hung
     a full unit out to the left of everything else, on a machine meant to be
     read on a page that scrolls. Pointing the same assembly into the depth
     spends that on a dimension the viewport does not have to pay for. */
  const lowOrigin = V(0, -RpIn, hLow);
  const inputLow = frameAt(lowOrigin, V(0, -1, 0));
  /* Offset sideways rather than upward: straight up puts it inside the disc
     stage 1's crank sweeps, and a spur pair can only be offset perpendicular
     to its shafts, so sideways is the only direction left that is not through
     the bed. Behind, so it does not stand in front of the mechanism. */
  const spurGap = pitchRadius(SPUR_LOW) + pitchRadius(SPUR_TOP);
  /* Offset toward the machine, not away from it. Either side satisfies the
     mesh; the far side put the spur pair beyond the left edge of everything
     else and handed back the width the shaft rotation had just saved, while
     this side tucks it under stage 1's own footprint and costs nothing. */
  const inputTop = frameAt(V(lowOrigin.x + spurGap, lowOrigin.y, hLow), V(0, -1, 0));

  /* Rolled a quarter turn so local +X lies along the line of centres, which is
     world +X here. That is not cosmetic. A Geneva's crank angle and its cross
     angle are both measured FROM the line of centres, so a frame whose X points
     somewhere else rotates the crank and the cross by the same amount about two
     DIFFERENT axes — which is not a rigid motion and does not cancel. Without
     it the roller sits in solid metal, is outside the rim while the solver says
     it is indexing, and inside it while the solver says it is locked.

     `frameAt` picks its own reference direction and had no way to know; the
     roll is how the caller says where the mechanism actually points. */
  const LINE_OF_CENTRES = Math.PI / 2;
  const driver1 = frameAt(V(0, 0, 0), V(0, 0, 1), LINE_OF_CENTRES);
  const cross1 = frameAt(V(train.stage1.centres, 0, 0), V(0, 0, 1), LINE_OF_CENTRES);

  /* Stage 2's shaft: on crown OUT's +X radius, axis radial — pointing back at
     that crown's centre, which is +X from the shaft's own origin. */
  const driver2 = frameAt(
    V(train.stage1.centres + RpOut, 0, pinionOutZ),
    V(1, 0, 0),
  );
  const geneva2: Frame = {
    matrix: driver2.matrix
      .clone()
      .multiply(new THREE.Matrix4().makeRotationZ(STAGE2_AIM)),
  };
  const cross2: Frame = {
    matrix: geneva2.matrix
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(train.stage2.centres, 0, 0)),
  };

  const z = {
    /* Out at the far end of the input shaft. Positive, because these frames
       have their local +Z pointing away from the crown they drive. */
    flywheel: 0.66,
    spurTop: 0.2,
    spurLow: 0.2,
    pinionIn: 0,
    crownIn: crownInFace,
    crank1,
    datum1,
    crownOut: crownOutFace,
    pinionOut: 0,
    crank2: STAGE2_REACH,
    datum2: STAGE2_REACH + gap + t.crank / 2 + d2.thickness / 2,
    /* Outboard of the cross, on the far side from the crank, so the clutch is
       not looked at through the mechanism that drives it. */
    freewheel:
      STAGE2_REACH + gap + t.crank / 2 + d2.thickness + gap + t.freewheel / 2,
  };

  /* ---- bounds -------------------------------------------------------- */

  /* A part is a disc on a shaft, so its world extent along each axis is the
     exact cylinder bound: r·sin(angle to that axis) + h·cos(it). The first
     version grew a CUBE of half-size r around each centre, which for a 0.7
     radius plate 0.09 thick overstated its depth eightfold — and since the
     camera frames off these bounds, the machine sat small in the middle of a
     lot of empty frame with an oversized bed under it. */
  const min = V(Infinity, Infinity, Infinity);
  const max = V(-Infinity, -Infinity, -Infinity);
  const add = (f: Frame, local: THREE.Vector3, r: number, h = 0) => {
    const c = local.clone().applyMatrix4(f.matrix);
    const axis = new THREE.Vector3().setFromMatrixColumn(f.matrix, 2).normalize();
    for (const [i, e] of ([V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)] as const).entries()) {
      const along = Math.abs(axis.dot(e));
      const reach = r * Math.sqrt(Math.max(0, 1 - along * along)) + h * along;
      const centre = i === 0 ? c.x : i === 1 ? c.y : c.z;
      const lo = centre - reach;
      const hi = centre + reach;
      if (i === 0) {
        min.x = Math.min(min.x, lo);
        max.x = Math.max(max.x, hi);
      } else if (i === 1) {
        min.y = Math.min(min.y, lo);
        max.y = Math.max(max.y, hi);
      } else {
        min.z = Math.min(min.z, lo);
        max.z = Math.max(max.z, hi);
      }
    }
  };

  add(inputTop, V(0, 0, z.flywheel), FLYWHEEL_R, t.flywheel / 2);
  add(inputTop, V(0, 0, z.spurTop), tipRadius(SPUR_TOP), t.gear / 2);
  add(inputLow, V(0, 0, z.spurLow), tipRadius(SPUR_LOW), t.gear / 2);
  add(inputLow, V(0, 0, 0), tipRadius(PINION_IN), t.gear / 2);
  add(driver1, V(0, 0, z.crownIn), crownOuter(CROWN_IN), t.crown);
  add(driver1, V(0, 0, z.datum1), d1.lock, plate / 2);
  add(driver1, V(0, 0, z.crank1), d1.crank + d1.armHalf, t.crank / 2);
  add(cross1, V(0, 0, z.datum1), d1.rim, plate / 2);
  add(cross1, V(0, 0, z.crownOut), crownOuter(CROWN_OUT), t.crown);
  add(driver2, V(0, 0, 0), tipRadius(PINION_OUT), t.gear / 2);
  add(geneva2, V(0, 0, z.crank2), d2.crank + d2.armHalf, t.crank / 2);
  add(cross2, V(0, 0, z.datum2), d2.rim, d2.thickness / 2);
  add(cross2, V(0, 0, z.freewheel), hubOuter(FREEWHEEL), t.freewheel / 2);

  /* ---- the base plate ------------------------------------------------ */

  /* Only the frames whose shafts are footed in it, plus whatever overhangs at
     low level — the flywheel hangs out past the edge, which is what a flywheel
     on a bench does. */
  const footed = [driver1, cross1, inputLow, inputTop];
  let bx0 = Infinity;
  let bx1 = -Infinity;
  let by0 = Infinity;
  let by1 = -Infinity;
  for (const f of footed) {
    const o = new THREE.Vector3().setFromMatrixPosition(f.matrix);
    bx0 = Math.min(bx0, o.x);
    bx1 = Math.max(bx1, o.x);
    by0 = Math.min(by0, o.y);
    by1 = Math.max(by1, o.y);
  }
  const overhang = plate * 5;
  bx0 -= overhang;
  bx1 += overhang;
  by0 -= overhang;
  by1 += overhang;

  /* The standard stands just outboard of everything on the layshaft, and the
     plate has to reach under it — a post footed on nothing is no better than
     the cantilever it replaces. */
  const outboard =
    new THREE.Vector3().setFromMatrixPosition(cross2.matrix).x +
    z.freewheel +
    t.freewheel / 2 +
    plate * 1.6 +
    APPROACH_ROOM;
  /* Slender, and stopping at the shaft rather than running past it.
  
     The freewheel is watched very nearly down its own axis — that is the only
     angle a wheel reads from — and anything standing outboard of it is directly
     between the reader and the payoff. A stout post cut a wide band out of the
     middle of it. Narrow, and ending at the bearing it exists to carry, it
     takes a sliver off the lower half instead. */
  const postW = plate * 1.3;
  const post = {
    x: outboard,
    y: 0,
    w: postW,
    d: plate * 1.7,
    h: new THREE.Vector3().setFromMatrixPosition(cross2.matrix).z,
  };
  bx1 = Math.max(bx1, post.x + postW / 2 + overhang * 0.5);

  const bed = {
    cx: (bx0 + bx1) / 2,
    cy: (by0 + by1) / 2,
    w: bx1 - bx0,
    d: by1 - by0,
    thickness: plate * 0.6,
  };

  // the plate sits under the lot
  min.z = Math.min(min.z, -plate);

  /* ---- the shafts ---------------------------------------------------- */

  const cross2x = new THREE.Vector3().setFromMatrixPosition(cross2.matrix).x;
  const shafts: Record<ShaftKey, Shaft> = {
    shaftInput: { frame: "inputTop", r: d1.shaft * 0.8, from: -0.31, to: z.flywheel + 0.11 },
    shaftLow: { frame: "inputLow", r: d1.shaft * 0.8, from: -0.24, to: z.spurLow + 0.1 },
    shaftDriver1: { frame: "driver1", r: d1.shaft, from: -0.04, to: z.datum1 + 0.12 },
    /* Up through the output crown, which sat above the top of it. */
    shaftCross1: {
      frame: "cross1",
      r: d1.shaft,
      from: -0.04,
      to: z.crownOut + t.crown + crownDepth(CROWN_OUT) + 0.03,
    },
    /* Out through the second locking disc, which overhung its end. */
    shaftDriver2: { frame: "driver2", r: d2.shaft * 1.25, from: -0.1, to: z.datum2 + d2.thickness / 2 + 0.03 },
    /* From just outboard of the second crank's plane — it used to reach back
       into it — out through the cross and the freewheel to the standard,
       which it exists to be carried by. */
    shaftCross2: {
      frame: "cross2",
      r: d2.shaft,
      from: z.crank2 + t.crank / 2 + 0.03,
      to: post.x - cross2x + postW * 0.25,
    },
  };

  return {
    d1,
    d2,
    frames: { inputTop, inputLow, driver1, cross1, driver2, geneva2, cross2 },
    z,
    t,
    bed,
    post,
    shafts,
    bounds: { min, max },
  };
}

/** Depth of a crown's teeth, re-exported so a renderer need not import both. */
export { crownDepth };
