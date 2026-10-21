/**
 * The machine: what may touch what, in three dimensions.
 *
 *   node lib/assembly.test.mts
 *
 * The previous version of this test compared plan footprints against depths.
 * That worked while every axis was parallel and is meaningless now — the drive
 * turns two right angles, so "depth" is three different directions depending on
 * which part you ask.
 *
 * So: oriented boxes and the separating-axis theorem, sampled across the whole
 * cycle. Parts are grouped by the shaft family they belong to, and the rule is
 * that different groups keep out of each other's way except where they are
 * meant to mesh. Within a group, the per-stage suites already cover it.
 *
 * This is the check that would have caught what the renderer found by eye:
 * stage 2's crank radius is 0.87 of its centre distance — a three-slot Geneva
 * swings its pin outside its own cross — so mounted at the crown pinion it
 * sweeps clean through stage 1's cross plate, twice a revolution, whichever way
 * its line of centres is aimed.
 */

import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  CROWN_IN,
  CROWN_OUT,
  FLYWHEEL_R,
  GEAR_BEVEL,
  MODULE,
  PINION_IN,
  PINION_OUT,
  SPUR_LOW,
  SPUR_TOP,
  STAGE2_REACH,
  machine,
} from "./assembly.ts";
import { crownGeometry, crownOuter, crownPinionAngle } from "./crown.ts";
import { gearShape, pitchRadius, tipRadius } from "./gears.ts";
import { crankShape, crossShape, extrude, lockDiscShape } from "./genevaParts.ts";
import { flywheelShape } from "./flywheel.ts";
import { FREEWHEEL, hubShape, starShape } from "./freewheel.ts";
import { TRAIN, reduction, solveTrain } from "./train.ts";

const M = machine(TRAIN);
const { d1, d2, frames: F, z, t } = M;
const TAU = Math.PI * 2;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(50)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(50)} ${detail}`);
  }
}

/* ---------------------------------------------------------------- geometry */

const G = {
  cross1: extrude(crossShape(TRAIN.stage1, d1), t.plate, d1.bevel, 40),
  disc1: extrude(lockDiscShape(TRAIN.stage1, d1), t.plate, d1.bevel, 40),
  crank1: extrude(crankShape(TRAIN.stage1, d1), t.crank, d1.bevel, 32),
  cross2: extrude(crossShape(TRAIN.stage2, d2), d2.thickness, d2.bevel, 40),
  disc2: extrude(lockDiscShape(TRAIN.stage2, d2), d2.thickness, d2.bevel, 40),
  crank2: extrude(crankShape(TRAIN.stage2, d2), t.crank, d2.bevel, 32),
  spurTop: extrude(gearShape(SPUR_TOP), t.gear, GEAR_BEVEL, 6),
  spurLow: extrude(gearShape(SPUR_LOW), t.gear, GEAR_BEVEL, 6),
  pinionIn: extrude(gearShape(PINION_IN), t.gear, GEAR_BEVEL, 6),
  pinionOut: extrude(gearShape(PINION_OUT), t.gear, GEAR_BEVEL, 6),
  crownIn: crownGeometry(CROWN_IN, t.crown),
  crownOut: crownGeometry(CROWN_OUT, t.crown),
  flywheel: extrude(flywheelShape(FLYWHEEL_R, 6, d1.shaft * 0.52), t.flywheel, d1.bevel * 0.5, 22),
  star: extrude(starShape(FREEWHEEL, d2.shaft), t.freewheel, d2.bevel, 24),
  hub: extrude(hubShape(FREEWHEEL), t.freewheel, d2.bevel, 24),
};

/* ------------------------------------------------------------------- boxes */

const T = (x: number, y: number, zz: number) => new THREE.Matrix4().makeTranslation(x, y, zz);
const RZ = (a: number) => new THREE.Matrix4().makeRotationZ(a);
const FLIP = new THREE.Matrix4().makeRotationX(Math.PI);
const chain = (...ms: THREE.Matrix4[]) =>
  ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4());

/**
 * A part, as the cylinder it sweeps.
 *
 * Not a box. Every part in this machine is a solid turning about its own axis,
 * so the volume it can possibly occupy is a cylinder \u2014 and an oriented *box*
 * round a spinning disc has corners at R\u221a2, which sweep a third further out
 * than any metal ever goes. That conservatism is not harmless: it reported the
 * input train fouling stage 1's locking disc in 174 of 240 positions when the
 * two are 42 thousandths apart and never touch.
 *
 * A cylinder is exact for these parts rather than merely tighter, and the
 * point-inside test is three lines.
 */
type Cyl = {
  name: string;
  group: string;
  /** centre, world */
  c: THREE.Vector3;
  /** unit axis, world */
  a: THREE.Vector3;
  r: number;
  halfH: number;
};

/** Radius and height of a geometry about its own local Z. */
const envelope = new Map<THREE.BufferGeometry, { r: number; halfH: number; mid: number }>();
function envelopeOf(g: THREE.BufferGeometry) {
  const hit = envelope.get(g);
  if (hit) return hit;
  const pos = g.attributes.position;
  let r = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    r = Math.max(r, Math.hypot(pos.getX(i), pos.getY(i)));
    lo = Math.min(lo, pos.getZ(i));
    hi = Math.max(hi, pos.getZ(i));
  }
  const e = { r, halfH: (hi - lo) / 2, mid: (hi + lo) / 2 };
  envelope.set(g, e);
  return e;
}

function cyl(
  name: string,
  group: string,
  g: THREE.BufferGeometry,
  ...ms: THREE.Matrix4[]
): Cyl {
  const e = envelopeOf(g);
  const m = chain(...ms.map((x) => x.clone())).multiply(T(0, 0, e.mid));
  return {
    name,
    group,
    c: new THREE.Vector3().setFromMatrixPosition(m),
    a: new THREE.Vector3().setFromMatrixColumn(m, 2).normalize(),
    r: e.r,
    halfH: e.halfH,
  };
}

function partsAt(driver: number): Cyl[] {
  const s = solveTrain(driver, TRAIN);
  const pinInA = crownPinionAngle(s.stage1.theta, CROWN_IN, PINION_IN.teeth);
  const pinOutA = crownPinionAngle(s.stage1.cross, CROWN_OUT, PINION_OUT.teeth);

  return [
    cyl("flywheel", "input", G.flywheel, F.inputTop.matrix, RZ(pinInA), T(0, 0, z.flywheel)),
    cyl("spur top", "input", G.spurTop, F.inputTop.matrix, RZ(pinInA), T(0, 0, z.spurTop)),
    cyl("spur low", "input", G.spurLow, F.inputLow.matrix, RZ(pinInA), T(0, 0, z.spurLow)),
    cyl("pinion in", "input", G.pinionIn, F.inputLow.matrix, RZ(pinInA), T(0, 0, 0)),

    cyl("crown in", "stage1", G.crownIn, F.driver1.matrix, T(0, 0, z.crownIn), FLIP, RZ(-s.stage1.theta)),
    cyl("crank 1", "stage1", G.crank1, F.driver1.matrix, RZ(s.stage1.theta), T(0, 0, z.crank1)),
    cyl("disc 1", "stage1", G.disc1, F.driver1.matrix, RZ(s.stage1.theta), T(0, 0, z.datum1)),
    cyl("cross 1", "stage1", G.cross1, F.cross1.matrix, RZ(s.stage1.cross), T(0, 0, z.datum1)),
    cyl("crown out", "stage1", G.crownOut, F.cross1.matrix, T(0, 0, z.crownOut), FLIP, RZ(-s.stage1.cross)),

    cyl("pinion out", "stage2", G.pinionOut, F.driver2.matrix, RZ(pinOutA), T(0, 0, 0)),
    cyl("crank 2", "stage2", G.crank2, F.geneva2.matrix, RZ(s.stage2.theta), T(0, 0, z.crank2)),
    cyl("disc 2", "stage2", G.disc2, F.geneva2.matrix, RZ(s.stage2.theta), T(0, 0, z.datum2)),
    cyl("cross 2", "stage2", G.cross2, F.cross2.matrix, RZ(s.stage2.cross), T(0, 0, z.datum2)),

    /* The freewheel is its own group, not part of "stage2". Filed under stage 2
       it would be exempt from the one comparison that matters: the hub is 0.46
       across on a shaft 0.78 from stage 2's crank, and the crank swings. A part
       grouped with the things it is most likely to hit is a part nothing checks.
       The hub's angle is left at zero because it is a ring — turning it does not
       change what space it occupies. */
    cyl("star", "output", G.star, F.cross2.matrix, RZ(s.stage2.cross), T(0, 0, z.freewheel)),
    cyl("hub", "output", G.hub, F.cross2.matrix, T(0, 0, z.freewheel)),
  ];
}

/** Is a world point inside a cylinder? Exact. */
function insideCyl(p: THREE.Vector3, k: Cyl) {
  const d = new THREE.Vector3().subVectors(p, k.c);
  const along = d.dot(k.a);
  if (Math.abs(along) > k.halfH) return false;
  return d.addScaledVector(k.a, -along).length() <= k.r;
}

/** Points over a cylinder's two faces and mid-plane, out to the rim. */
function shell(k: Cyl, rings = 9, around = 24) {
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(k.a.x) > 0.9) u.set(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(u, k.a).normalize();
  const e2 = new THREE.Vector3().crossVectors(k.a, e1);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= rings; i++) {
    const rr = (i / rings) * k.r;
    for (let j = 0; j < around; j++) {
      const th = (j / around) * TAU;
      const radial = new THREE.Vector3()
        .addScaledVector(e1, Math.cos(th) * rr)
        .addScaledVector(e2, Math.sin(th) * rr);
      for (const h of [-k.halfH, 0, k.halfH]) {
        out.push(new THREE.Vector3().copy(k.c).add(radial).addScaledVector(k.a, h));
      }
    }
  }
  return out;
}

function clash(a: Cyl, b: Cyl) {
  for (const p of shell(a)) if (insideCyl(p, b)) return true;
  for (const p of shell(b)) if (insideCyl(p, a)) return true;
  return false;
}

/** Pairs across groups that are supposed to be in contact. */
const MESHES = new Set(["crown in|pinion in", "crown out|pinion out"]);
const key = (a: string, b: string) => [a, b].sort().join("|");

// ===========================================================================
// Groups keep out of each other's way
// ===========================================================================
{
  const clashes = new Map<string, number>();
  const SAMPLES = 96;
  for (let k = 0; k < SAMPLES; k++) {
    const parts = partsAt((k / SAMPLES) * TAU * reduction(TRAIN));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i];
        const b = parts[j];
        if (a.group === b.group) continue;
        const kk = key(a.name, b.name);
        if (MESHES.has(kk)) continue;
        if (clash(a, b)) clashes.set(kk, (clashes.get(kk) ?? 0) + 1);
      }
    }
  }
  const worst = [...clashes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  check("no two groups occupy the same space", clashes.size === 0,
    clashes.size
      ? worst.map(([n, c]) => `${n} ${c}/${SAMPLES}`).join("; ")
      : `${SAMPLES} positions over a full ${reduction(TRAIN)}-revolution cycle`);

  /* The guard's guard: pull stage 2 back down its shaft to the crown pinion,
     which is where it would naturally be mounted, and it must foul the fast
     stage. If this ever stops failing, the layshaft has stopped being load
     bearing and something else is quietly holding the machine apart. */
  let wouldFoul = 0;
  for (let k = 0; k < 96; k++) {
    const s = solveTrain((k / 96) * TAU * reduction(TRAIN), TRAIN);
    const crank = cyl("crank 2", "stage2", G.crank2, F.geneva2.matrix, RZ(s.stage2.theta),
      T(0, 0, z.crank2 - STAGE2_REACH));
    const cross = cyl("cross 1", "stage1", G.cross1, F.cross1.matrix, RZ(s.stage1.cross),
      T(0, 0, z.datum1));
    if (clash(crank, cross)) wouldFoul++;
  }
  check("...and mounting stage 2 at the pinion would foul", wouldFoul > 0,
    `${wouldFoul} of 96 positions — hence a ${STAGE2_REACH} layshaft`);
}

// ===========================================================================
// Both renderers draw the same machine
// ===========================================================================
{
  /* The failure this catches has now happened three times.
  
     `lib/shot.mts` and the interactive scene each place the parts themselves,
     and every time a part is added one of them gets it and the other does not.
     The freewheel went into the stills and the bench figure went on showing a
     machine that stopped at the slow cross; before that it was the input spur
     pair handed one angle instead of two. Angles got a single home in
     `lib/drive.ts` after the second time and geometry got one in
     `MachineScene.tsx` after the third, but nothing stops a fourth renderer,
     or one of these two quietly skipping an offset.
  
     `machine().z` is the list of places a part goes. A renderer that never
     mentions one is a renderer missing that part. Blunt, like the cylinder
     check, and for the same reason: the mistake is blunt. */
  const places = Object.keys(machine(TRAIN).z);
  const renderers = [
    /* parts.ts, not shot.mts: the part list moved out of the command-line
       tool so that asking for it no longer renders a still. A guard that
       watches where a thing used to live stops working the day it moves. */
    ["lib/parts.ts", new URL("./parts.ts", import.meta.url)],
    ["MachineScene.tsx", new URL("../components/geneva/MachineScene.tsx", import.meta.url)],
  ] as const;

  /* A plain substring, not a regex. The first version built one out of a
     template literal, where `\.` collapses to `.` and `\b` becomes an actual
     backspace character — so it matched nothing, reported all twelve offsets
     missing from both renderers, and its own counter-test passed because a
     regex that never matches never matches the bad case either. */
  const unplaced = (src: string, keys: readonly string[]) =>
    keys.filter((k) => !src.includes(`z.${k}`));

  const missing: string[] = [];
  for (const [name, url] of renderers) {
    const absent = unplaced(readFileSync(url, "utf8"), places);
    if (absent.length) missing.push(`${name} never places ${absent.join(", ")}`);
  }
  check("every renderer places every part", missing.length === 0,
    missing.length ? missing.join("; ") : `${places.length} offsets across ${renderers.length} renderers`);

  /* The counter-test, run against the same helper the check uses: a part that
     nothing places must come back named. */
  const src = readFileSync(renderers[0][1], "utf8");
  const caught = unplaced(src, [...places, "nowhere"]);
  check("...and would notice one going missing",
    caught.length === 1 && caught[0] === "nowhere",
    `flags an unplaced offset and nothing else (${caught.join(", ") || "none"})`);
}

// ===========================================================================
// The rules each Geneva stage still obeys
// ===========================================================================
{
  const clear1 = Math.abs(z.datum1 - z.crank1) - (t.crank + t.plate) / 2;
  const clear2 = Math.abs(z.datum2 - z.crank2) - (t.crank + d2.thickness) / 2;
  check("stage 1's crank is clear of its cross plane", clear1 > 0 && d1.armHalf > d1.slotHalf,
    `${clear1.toFixed(4)} of daylight; arm ${d1.armHalf.toFixed(3)} > slot ${d1.slotHalf.toFixed(3)}`);
  check("stage 2's crank is clear of its cross plane", clear2 > 0 && d2.armHalf > d2.slotHalf,
    `${clear2.toFixed(4)} of daylight; arm ${d2.armHalf.toFixed(3)} > slot ${d2.slotHalf.toFixed(3)}`);
}

// ===========================================================================
// Three families of axis, which is the entire point
// ===========================================================================
{
  const axisOf = (m: THREE.Matrix4) =>
    new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
  const input = axisOf(F.inputLow.matrix);
  const one = axisOf(F.driver1.matrix);
  const two = axisOf(F.driver2.matrix);
  const show = (v: THREE.Vector3) => v.toArray().map((n) => n.toFixed(2)).join(", ");

  check("the input shaft is perpendicular to stage 1", Math.abs(input.dot(one)) < 1e-9,
    `${show(input)} against ${show(one)}`);
  check("stage 2 is perpendicular to stage 1", Math.abs(two.dot(one)) < 1e-9, show(two));
  check("...so this is not a flat machine extruded",
    Math.abs(input.dot(one)) < 1e-9 && Math.abs(two.dot(one)) < 1e-9,
    "two right angles in the drive");

  /* Meshing on the −X radius rather than +X is a rotation of π, which is a
     whole number of tooth pitches only when N/2 is an integer. */
  check("crown tooth counts are even", CROWN_IN.teeth % 2 === 0 && CROWN_OUT.teeth % 2 === 0,
    `${CROWN_IN.teeth} in, ${CROWN_OUT.teeth} out`);
  /* The link's sign is the crown's mount, and it has changed once already:
     negative while that crown hung teeth-down under stage 1, positive now it
     is turned over so stage 2 can stack on top. So this no longer asserts a
     direction — a hardcoded expectation here would just have to be edited
     every time the machine is re-laid, which makes it a note rather than a
     check. What must hold is that the number agrees with the machine: the
     output really does turn the way the link says it does. */
  {
    const h = 1e-5;
    let at = 0;
    for (let k = 0; k < 20000 && !at; k++) {
      const drv = (k / 20000) * TAU * reduction(TRAIN);
      if (solveTrain(drv, TRAIN).stage2.engaged) at = drv + 0.01;
    }
    const d =
      (solveTrain(at + h, TRAIN).stage2.cross - solveTrain(at - h, TRAIN).stage2.cross) /
      (2 * h);
    check("the link's sign is the direction the output actually turns",
      Math.sign(d) === Math.sign(TRAIN.link),
      `link ${TRAIN.link.toFixed(3)}, output ${d.toFixed(3)} rad per rad of input`);
  }

  check("the link ratio IS the crown pair's",
    Math.abs(Math.abs(TRAIN.link) - CROWN_OUT.teeth / PINION_OUT.teeth) < 1e-12,
    `${CROWN_OUT.teeth}/${PINION_OUT.teeth} = ${(CROWN_OUT.teeth / PINION_OUT.teeth).toFixed(4)}`);
}

// ===========================================================================
// Build, and budget
// ===========================================================================
{
  let verts = 0;
  const broken: string[] = [];
  for (const [name, g] of Object.entries(G)) {
    const pos = g.attributes.position;
    verts += pos.count;
    if (pos.count === 0) broken.push(`${name}: empty`);
    for (let i = 0; i < pos.count * 3; i++) {
      if (!Number.isFinite(pos.array[i])) {
        broken.push(`${name}: non-finite`);
        break;
      }
    }
  }
  check("every part builds without NaN", broken.length === 0,
    broken.length
      ? broken.join("; ")
      : `${Object.keys(G).length} parts, ${verts.toLocaleString("en")} vertices`);
  check("the scene stays inside its vertex budget", verts < 300_000,
    `${verts.toLocaleString("en")} of 300,000`);

  const span = new THREE.Vector3().subVectors(M.bounds.max, M.bounds.min);
  check("the machine has real height", span.z > span.x * 0.3,
    `${span.x.toFixed(2)} × ${span.y.toFixed(2)} × ${span.z.toFixed(2)}`);
  check("gears share a module or nothing meshes",
    [SPUR_TOP, SPUR_LOW, PINION_IN, PINION_OUT].every((g) => g.module === MODULE) &&
      CROWN_IN.module === MODULE &&
      CROWN_OUT.module === MODULE,
    `m = ${MODULE}`);
  check("the input crown tucks under stage 1's locking disc",
    crownOuter(CROWN_IN) < d1.lock,
    `crown ${crownOuter(CROWN_IN).toFixed(3)} under disc ${d1.lock.toFixed(3)}`);
  check("the output pinion is a sane size beside its crown",
    pitchRadius(PINION_OUT) < crownOuter(CROWN_OUT) && tipRadius(PINION_OUT) > d2.rim * 0.4,
    `pinion ${pitchRadius(PINION_OUT).toFixed(3)}, crown ${crownOuter(CROWN_OUT).toFixed(3)}`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
