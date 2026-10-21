/**
 * The right-angle mesh, in three dimensions.
 *
 *   node lib/crown.test.mts
 *
 * Every interference test in this project so far has worked in plan, because
 * until now every axis was parallel and plan was enough. A crown gear and its
 * pinion do not share a plane — that is the whole reason they are here — so
 * this one samples the pinion's actual tooth surfaces in space and asks whether
 * each point is inside the crown's metal.
 *
 * It matters because the failure is invisible. A pinion half a pitch out of
 * phase still sits over the pitch circle, still turns at the right ratio, and
 * still has teeth interleaved with the crown's in every frame you could
 * screenshot. It is also passing straight through them.
 */

import {
  crownDepth,
  crownGeometry,
  crownHalfAngle,
  crownInner,
  crownMesh,
  crownOuter,
  crownPitchHeight,
  crownPitchRadius,
  crownPinionAngle,
  crownRatio,
  type CrownSpec,
} from "./crown.ts";
import { gearShape, pitchRadius, rootRadius, tipRadius, type GearSpec } from "./gears.ts";

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

const MODULE = 0.026;
const CROWN: CrownSpec = { teeth: 30, module: MODULE, backlash: 0.3 };
const PINION: GearSpec = { teeth: 18, module: MODULE, backlash: 0.3 };

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

/* -------------------------------------------------------------- the solid */

const Rp = crownPitchRadius(CROWN);
const Ri = crownInner(CROWN);
const Ro = crownOuter(CROWN);
const H = crownDepth(CROWN);
const mesh = crownMesh(CROWN, pitchRadius(PINION));

/** Is a point (crown frame: axis = z, face at z = 0) inside the crown's metal? */
function insideCrown(x: number, y: number, z: number, plate: number) {
  const r = Math.hypot(x, y);
  const bore = Rp * 0.22;
  if (z < 0) return z > -plate && r > bore && r < Ro; // the body
  if (z > H) return false;
  if (r < Ri || r > Ro) return false;
  const pitch = TAU / CROWN.teeth;
  const b = Math.atan2(y, x);
  const delta = b - Math.round(b / pitch) * pitch;
  return Math.abs(delta) < crownHalfAngle(CROWN, r, z);
}

// ===========================================================================
// Proportions
// ===========================================================================
{
  check("pitch plane sits one addendum below the tip",
    Math.abs(H - crownPitchHeight(CROWN) - MODULE) < 1e-12,
    `tip ${H.toFixed(4)}, pitch ${crownPitchHeight(CROWN).toFixed(4)}, addendum ${MODULE}`);

  /* The pinion's addendum must clear the crown's root, or the teeth bottom out
     however well they are phased. Standard clearance is 0.25 module. */
  const lowest = mesh.height - tipRadius(PINION);
  check("pinion tips clear the crown's root", lowest > MODULE * 0.15,
    `${lowest.toFixed(5)} of daylight, ${(lowest / MODULE).toFixed(2)} module`);

  /* And it must reach deep enough to actually be a mesh rather than two parts
     near each other. */
  check("pinion reaches below the crown's pitch plane",
    lowest < crownPitchHeight(CROWN),
    `reaches ${lowest.toFixed(4)}, pitch plane at ${crownPitchHeight(CROWN).toFixed(4)}`);

  check("a crown tooth is a wedge, not a block",
    crownHalfAngle(CROWN, Ro, H) > crownHalfAngle(CROWN, Ri, H) &&
      crownHalfAngle(CROWN, Rp, 0) > crownHalfAngle(CROWN, Rp, H),
    `tip half-angle ${deg(crownHalfAngle(CROWN, Ri, H)).toFixed(3)}° inner vs ${deg(crownHalfAngle(CROWN, Ro, H)).toFixed(3)}° outer`);

  const g = crownGeometry(CROWN, 0.05);
  const pos = g.attributes.position;
  let bad = 0;
  let maxR = 0;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) bad++;
    maxR = Math.max(maxR, Math.hypot(x, y));
    maxZ = Math.max(maxZ, z);
  }
  check("the solid builds without NaN", bad === 0 && pos.count > 0,
    `${pos.count.toLocaleString("en")} vertices`);
  check("nothing escapes the outer radius", maxR - Ro < 1e-6,
    `max r ${maxR.toFixed(5)} (outer ${Ro.toFixed(5)})`);
  check("teeth stand full depth", Math.abs(maxZ - H) < 1e-9,
    `${maxZ.toFixed(5)} (want ${H.toFixed(5)})`);
  g.dispose();
}

// ===========================================================================
// The mesh, swept in three dimensions
// ===========================================================================
{
  const plate = 0.05;
  const profile = gearShape(PINION).extractPoints(6).shape.map((q) => [q.x, q.y] as const);
  const faceW = crownOuter(CROWN) - crownInner(CROWN);

  /* The pinion's axis runs along world X — radially, pointing at the crown's
     centre — with its centre over the pitch circle at (Rp, 0, height). Its
     profile therefore lies in the YZ plane and its face width runs along X,
     covering the crown's toothed band. A profile point (u, v) at face offset w
     lands at (Rp + w, v, height − u). */
  const sample = (crownAngle: number, phaseNudge: number) => {
    const pinA = crownPinionAngle(crownAngle, CROWN, PINION.teeth) + phaseNudge;
    const ca = Math.cos(pinA);
    const sa = Math.sin(pinA);
    const cc = Math.cos(-crownAngle);
    const sc = Math.sin(-crownAngle);
    let hits = 0;
    for (const [u0, v0] of profile) {
      const u = u0 * ca - v0 * sa;
      const v = u0 * sa + v0 * ca;
      // only the part of the pinion anywhere near the crown can interfere
      if (mesh.height - u > H + 0.02) continue;
      for (let f = -3; f <= 3; f++) {
        const w = (f / 3) * (faceW / 2);
        const X = Rp + w;
        const Y = v;
        const Z = mesh.height - u;
        // into the crown's frame: undo the crown's own rotation
        if (insideCrown(X * cc - Y * sc, X * sc + Y * cc, Z, plate)) hits++;
      }
    }
    return hits;
  };

  let good = 0;
  for (let k = 0; k < 720; k++) good += sample((k / 720) * TAU, 0);
  check("crown and pinion mesh without interference", good === 0,
    good === 0
      ? `720 crown positions × ${profile.length} profile points × 7 face offsets`
      : `${good} penetrations — try phase nudges: ${scanPhase()}`);

  /* Half a pitch out is the mistake that renders perfectly. */
  const halfPitch = TAU / PINION.teeth / 2;
  let bad = 0;
  for (let k = 0; k < 360; k++) bad += sample((k / 360) * TAU, halfPitch);
  check("...and half a pitch out grinds", bad > 0, `${bad} penetrations`);

  /* Widen the face and it must bind — inboard, because that is where the gap
     is narrowest. If this ever stops failing, the face width has stopped being
     the thing that makes the mesh work and something else is carrying it. */
  {
    const wide: CrownSpec = { ...CROWN, face: 0.3 };
    const wRp = crownPitchRadius(wide);
    const wRi = crownInner(wide);
    const wRo = crownOuter(wide);
    const wH = crownDepth(wide);
    const wMesh = crownMesh(wide, pitchRadius(PINION));
    let inner = 0;
    let outer = 0;
    for (let k = 0; k < 360; k++) {
      const ca = (k / 360) * TAU;
      const pa = crownPinionAngle(ca, wide, PINION.teeth);
      const cs = Math.cos(pa);
      const sn = Math.sin(pa);
      const cc = Math.cos(-ca);
      const sc = Math.sin(-ca);
      for (const [u0, v0] of profile) {
        const u = u0 * cs - v0 * sn;
        const v = u0 * sn + v0 * cs;
        const Z = wMesh.height - u;
        if (Z < 0 || Z > wH) continue;
        for (let f = -3; f <= 3; f++) {
          const w = (f / 3) * ((wRo - wRi) / 2);
          const X = wRp + w;
          const x = X * cc - v * sc;
          const y = X * sc + v * cc;
          const r = Math.hypot(x, y);
          if (r < wRi || r > wRo) continue;
          const pitchA = TAU / wide.teeth;
          const b = Math.atan2(y, x);
          const dd = b - Math.round(b / pitchA) * pitchA;
          if (Math.abs(dd) < crownHalfAngle(wide, r, Z)) {
            if (w < 0) inner++;
            else outer++;
          }
        }
      }
    }
    check("a wide face binds, and binds inboard", inner + outer > 0 && inner > outer * 4,
      `at face 0.30: ${inner} inner against ${outer} outer`);
  }

  /* A mesh that never comes close is not a mesh. Somewhere in the cycle a
     pinion tooth has to be down between two crown teeth. */
  let deepest = Infinity;
  for (let k = 0; k < 360; k++) {
    const crownAngle = (k / 360) * TAU;
    const pinA = crownPinionAngle(crownAngle, CROWN, PINION.teeth);
    for (const [u0, v0] of profile) {
      const u = u0 * Math.cos(pinA) - v0 * Math.sin(pinA);
      deepest = Math.min(deepest, mesh.height - u);
    }
  }
  check("the pinion actually engages", deepest < crownPitchHeight(CROWN),
    `reaches z = ${deepest.toFixed(5)}, pitch plane ${crownPitchHeight(CROWN).toFixed(5)}, root 0`);

  check("ratio is the tooth ratio", Math.abs(crownRatio(CROWN, PINION.teeth) - 30 / 18) < 1e-12,
    `${crownRatio(CROWN, PINION.teeth).toFixed(4)} pinion turns per crown turn`);

  /** If the derived phase is wrong, say what would have worked. */
  function scanPhase() {
    const pitch = TAU / PINION.teeth;
    let best = 0;
    let bestHits = Infinity;
    for (let i = 0; i < 240; i++) {
      const nudge = (i / 240) * pitch;
      let h = 0;
      for (let k = 0; k < 120; k++) h += sample((k / 120) * TAU, nudge);
      if (h < bestHits) {
        bestHits = h;
        best = nudge;
      }
    }
    return `${deg(best).toFixed(3)}° gives ${bestHits}`;
  }
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
