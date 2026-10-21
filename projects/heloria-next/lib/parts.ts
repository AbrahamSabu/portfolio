/**
 * The machine as a list of parts: geometry, finish, where it is, and what it
 * is called.
 *
 * Split out of `lib/shot.mts`, which is a command-line tool and did its work
 * on import — so anything that wanted the part list, like the finish check,
 * rendered a still as a side effect of asking for it. The software renderer,
 * the finish check and the approach check in `lib/approach.test.mts` all read
 * the machine from here.
 *
 * Mirrors `components/geneva/MachineScene.tsx` part for part. It has to: the
 * moment it drifts it stops being a picture of the thing. Anything structural
 * belongs in `lib/assembly.ts` so both read it rather than agreeing by hand.
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
  machine,
} from "./assembly.ts";
import { crownGeometry } from "./crown.ts";
import { anglesAt, hubAt } from "./drive.ts";
import { gearShape } from "./gears.ts";
import {
  axleGeometry,
  crankShape,
  crossShape,
  extrude,
  lockDiscShape,
} from "./genevaParts.ts";
import { flywheelShape } from "./flywheel.ts";
import {
  FREEWHEEL,
  hubShape,
  rollerPlacements,
  starShape,
} from "./freewheel.ts";
import { TRAIN } from "./train.ts";
import { partGeometry, shaftGeometry } from "./partGeometry.ts";
import type { ShaftKey } from "./assembly.ts";
import { AMBIENT, BACKDROP, FILL, FINISH, GROUND, KEY, RIM, SKY, hexToRgb } from "./finish.ts";
import { type Part } from "./render.mts";
import { type PartKey } from "./build.ts";

/**
 * A part, the name the assembly sequence knows it by, and the frame of the
 * shaft it turns on.
 *
 * The frame is carried separately from the matrix because the matrix also
 * holds the part's own rotation and its offset along the shaft — and a part's
 * approach is along the shaft, in the frame, whatever angle it happens to be
 * at. See `lib/approach.ts`.
 */
export type Tagged = Part & { key?: PartKey; frame?: THREE.Matrix4 };

const M = machine(TRAIN);
const { d1, d2, frames, z, t } = M;
const TAU = Math.PI * 2;

const STEEL = FINISH.cross;
const DARK = FINISH.crank;
const DEEP = FINISH.shaft;
const PALE = FINISH.crossSlow;
const BRASS = FINISH.brass;
const EMBER = FINISH.roller;
const BOARD = FINISH.bed;
const SPUR = FINISH.spur;
const FRAME = FINISH.frame;
const IRON = FINISH.iron;

/* ---------------------------------------------------------------- geometry */

/* One list, shared with the page — see lib/partGeometry.ts. */
const G = partGeometry(M);
const SH = Object.fromEntries(
  (Object.keys(M.shafts) as ShaftKey[]).map((k) => [k, shaftGeometry(M, k)]),
) as Record<ShaftKey, ReturnType<typeof shaftGeometry>>;

/** The shared Z-aligned cylinder; see genevaParts.axleGeometry. */
const axle = axleGeometry;

/* ------------------------------------------------------------------- scene */

const T = (x: number, y: number, zz: number) => new THREE.Matrix4().makeTranslation(x, y, zz);
const RZ = (a: number) => new THREE.Matrix4().makeRotationZ(a);
/** Flip a part so its local +Z points the other way — for teeth facing down. */
const FLIP = new THREE.Matrix4().makeRotationX(Math.PI);

const chain = (...ms: THREE.Matrix4[]) =>
  ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4());

export function sceneAt(driver: number): Tagged[] {
  /* Every angle from lib/drive.ts, the same source the page reads. */
  const a = anglesAt(driver, TRAIN);
  const hub = hubAt(driver / TAU, TRAIN);
  const s = a.train;
  const pinInA = a.spurLow;
  const spurLowA = a.spurLow;
  const spurTopA = a.spurTop;
  const pinOutA = a.driver2;

  /* Every part carries the name the assembly sequence knows it by, so a still
     can show the machine as it stands at any stage — see `--stage`. */
  const p = (
    key: PartKey,
    geometry: THREE.BufferGeometry,
    finish: typeof FINISH[string],
    frame: THREE.Matrix4,
    ...rest: THREE.Matrix4[]
  ): Tagged => ({ key, geometry, finish, frame, matrix: chain(frame.clone(), ...rest) });

  const F = frames;

  return [
    /* ---------------------------------------------------- input shaft */
    p("flywheel", G.flywheel, IRON, F.inputTop.matrix, RZ(spurTopA), T(0, 0, z.flywheel)),
    p("spurTop", G.spurTop, SPUR, F.inputTop.matrix, RZ(spurTopA), T(0, 0, z.spurTop)),
    p(
      "shaftInput", SH.shaftInput.geometry,
      DEEP,
      F.inputTop.matrix,
      T(0, 0, SH.shaftInput.at),
    ),

    p("spurLow", G.spurLow, SPUR, F.inputLow.matrix, RZ(spurLowA), T(0, 0, z.spurLow)),
    p("pinionIn", G.pinionIn, BRASS, F.inputLow.matrix, RZ(pinInA), T(0, 0, z.pinionIn)),
    p(
      "shaftLow", SH.shaftLow.geometry,
      DEEP,
      F.inputLow.matrix,
      T(0, 0, SH.shaftLow.at),
    ),

    /* ------------------------------------------------- stage 1 driver */
    p("crownIn", G.crownIn, BRASS, F.driver1.matrix, T(0, 0, z.crownIn), FLIP, RZ(-a.driver1)),
    p("crank1", G.crank1, DARK, F.driver1.matrix, RZ(a.driver1), T(0, 0, z.crank1)),
    p("disc1", G.disc1, STEEL, F.driver1.matrix, RZ(a.driver1), T(0, 0, z.datum1)),
    p(
      "pin1", axle(d1.pin, t.plate * 1.24, 32),
      EMBER,
      F.driver1.matrix,
      RZ(a.driver1),
      T(d1.crank, 0, z.datum1),
    ),
    p(
      "shaftDriver1", SH.shaftDriver1.geometry,
      DEEP,
      F.driver1.matrix,
      T(0, 0, SH.shaftDriver1.at),
    ),

    /* -------------------------------------------------- stage 1 cross */
    p("cross1", G.cross1, STEEL, F.cross1.matrix, RZ(a.cross1), T(0, 0, z.datum1)),
    p("crownOut", G.crownOut, BRASS, F.cross1.matrix, T(0, 0, z.crownOut), RZ(a.cross1)),
    p(
      "shaftCross1", SH.shaftCross1.geometry,
      DEEP,
      F.cross1.matrix,
      T(0, 0, SH.shaftCross1.at),
    ),

    /* ------------------------------------------------- stage 2, on edge */
    p("pinionOut", G.pinionOut, BRASS, F.driver2.matrix, RZ(pinOutA), T(0, 0, z.pinionOut)),
    p("crank2", G.crank2, DARK, F.geneva2.matrix, RZ(a.crank2), T(0, 0, z.crank2)),
    p("disc2", G.disc2, PALE, F.geneva2.matrix, RZ(a.crank2), T(0, 0, z.datum2)),
    p(
      "pin2", axle(d2.pin, d2.thickness * 1.24, 32),
      EMBER,
      F.geneva2.matrix,
      RZ(a.crank2),
      T(d2.crank, 0, z.datum2),
    ),
    p("cross2", G.cross2, PALE, F.cross2.matrix, RZ(a.cross2), T(0, 0, z.datum2)),

    /* ------------------------------------------------- the freewheel */
    /* The star is keyed to the cross, so it shares its angle exactly. The hub
       does not share anything: it is on the far side of a clutch that has
       usually let go of it, and its angle comes from an integration rather than
       from a solve. */
    p("star", G.star, DARK, F.cross2.matrix, RZ(a.cross2), T(0, 0, z.freewheel)),
    ...rollerPlacements(hub.slip).map((r) =>
      p(
        "star", axle(FREEWHEEL.roller, t.freewheel * 0.94, 24),
        EMBER,
        F.cross2.matrix,
        RZ(a.cross2),
        T(r.x, r.y, z.freewheel),
      ),
    ),
    p("hub", G.hub, STEEL, F.cross2.matrix, RZ(hub.angle), T(0, 0, z.freewheel)),
    p(
      "shaftCross2", SH.shaftCross2.geometry,
      DEEP,
      F.cross2.matrix,
      T(0, 0, SH.shaftCross2.at),
    ),
    /* the layshaft that carries stage 2 out past the fast stage's rim */
    p(
      "shaftDriver2", SH.shaftDriver2.geometry,
      DEEP,
      F.driver2.matrix,
      T(0, 0, SH.shaftDriver2.at),
    ),

    /* ------------------------------------------------------- standard */
    {
      key: "standard",
      geometry: new THREE.BoxGeometry(M.post.w, M.post.d, M.post.h),
      finish: FRAME,
      matrix: T(M.post.x, M.post.y, M.post.h / 2),
    },

    /* ------------------------------------------------------------- bed */
    {
      key: "bed",
      geometry: new THREE.BoxGeometry(M.bed.w, M.bed.d, M.bed.thickness),
      finish: BOARD,
      matrix: T(M.bed.cx, M.bed.cy, -t.plate * 0.4),
    },
  ];
}

export const mid = new THREE.Vector3()
  .addVectors(M.bounds.min, M.bounds.max)
  .multiplyScalar(0.5);
const span = new THREE.Vector3().subVectors(M.bounds.max, M.bounds.min);
const reach = Math.max(span.x, span.y, span.z);

/** A three-quarter view from above and in front — the point is to see depth. */
export const VIEW: {
  width: number;
  height: number;
  from: [number, number, number];
  to: [number, number, number];
  fov: number;
  up: [number, number, number];
} = {
  width: 1280,
  height: 800,
  from: [mid.x - reach * 0.55, mid.y - reach * 1.25, mid.z + reach * 0.85] as [
    number,
    number,
    number,
  ],
  to: [mid.x, mid.y, mid.z] as [number, number, number],
  fov: 34,
  up: [0, 0, 1] as [number, number, number],
};

/** One rig, shared with the page. See lib/finish.ts. */
export const LIGHTS = {
  ambient: AMBIENT,
  sky: hexToRgb(SKY),
  ground: hexToRgb(GROUND),
  lights: [KEY, FILL, RIM].map((l) => ({
    dir: l.dir,
    colour: hexToRgb(l.colour),
    intensity: l.intensity,
  })),
};

