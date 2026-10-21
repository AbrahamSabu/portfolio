/**
 * Gears, asserted before they are drawn.
 *
 *   node lib/gears.test.mts
 *
 * The check that earns its place is the mesh sweep. Two gears at the right
 * centre distance with the wrong phase look, in any still frame and at any
 * casual glance, exactly like two gears meshing — the teeth interleave, the
 * pitch circles touch, the ratio is right. They are passing through each other.
 * Nothing but sweeping the whole revolution and testing the outlines will say
 * so, which is the same lesson the crank pin taught in step 2.
 */

import {
  baseRadius,
  centreDistance,
  driverAngleFor,
  gearRatio,
  gearShape,
  halfToothAngle,
  involute,
  meshAngle,
  meshAngleAt,
  meshPhase,
  MIN_TEETH,
  pitchRadius,
  rootRadius,
  tipRadius,
  type GearSpec,
} from "./gears.ts";

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

/** The train as built: a pinion driving a wheel on the Geneva's input shaft. */
const MODULE = 0.0233;
const PINION: GearSpec = { teeth: 18, module: MODULE };
const WHEEL: GearSpec = { teeth: 36, module: MODULE };

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

type Pt = readonly [number, number];

const poly = (g: GearSpec): Pt[] =>
  gearShape(g).extractPoints(1).shape.map((q) => [q.x, q.y] as Pt);

const rot = (p: Pt, a: number, ox = 0, oy = 0): Pt => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s + ox, p[0] * s + p[1] * c + oy];
};

/**
 * Point in polygon, with a radial reject in front of it.
 *
 * The sweeps here are every vertex of one gear against every edge of the other,
 * which is 900 positions by 2,400 points by 1,600 edges — three and a half
 * billion operations, and the suite took 73 seconds. Almost every one of those
 * points is nowhere near the other gear, and a point outside its tip circle
 * cannot possibly be inside it, so one distance check removes the lot. Exact,
 * not approximate: the reject only ever skips points that would have answered
 * false anyway.
 */
const inside = (
  px: number,
  py: number,
  pg: readonly Pt[],
  centre?: readonly [number, number],
  radius?: number,
) => {
  if (centre && radius !== undefined) {
    const dx = px - centre[0];
    const dy = py - centre[1];
    if (dx * dx + dy * dy > radius * radius) return false;
  }
  let hit = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i];
    const [xj, yj] = pg[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

// ===========================================================================
// One gear
// ===========================================================================
{
  check("inv(0) = 0", Math.abs(involute(0)) < 1e-15, involute(0).toExponential(1));
  check("inv(20°) is the standard 0.014904",
    Math.abs(involute((20 * Math.PI) / 180) - 0.0149044) < 1e-6,
    involute((20 * Math.PI) / 180).toFixed(7));

  check("radii nest correctly",
    rootRadius(WHEEL) < baseRadius(WHEEL) &&
      baseRadius(WHEEL) < pitchRadius(WHEEL) &&
      pitchRadius(WHEEL) < tipRadius(WHEEL),
    `root ${rootRadius(WHEEL).toFixed(4)} < base ${baseRadius(WHEEL).toFixed(4)} < pitch ${pitchRadius(WHEEL).toFixed(4)} < tip ${tipRadius(WHEEL).toFixed(4)}`);

  /* A tooth spans π/N at the pitch circle, less the backlash. Get this wrong
     and the gear still looks like a gear — the teeth are simply too fat or too
     thin to mesh, which only shows up two tests further down. */
  const nominal = Math.PI / (2 * WHEEL.teeth);
  const half = halfToothAngle(WHEEL);
  check("tooth thickness is half the circular pitch",
    half < nominal && nominal - half < nominal * 0.2,
    `${deg(half * 2).toFixed(3)}° against a nominal ${deg(nominal * 2).toFixed(3)}°`);

  const p = poly(WHEEL);
  const rs = p.map((q) => Math.hypot(q[0], q[1]));
  check("outline never leaves the tip circle", Math.max(...rs) - tipRadius(WHEEL) < 1e-9,
    `max r ${Math.max(...rs).toFixed(6)} (tip ${tipRadius(WHEEL).toFixed(6)})`);
  check("outline reaches the root circle", Math.abs(Math.min(...rs) - rootRadius(WHEEL)) < 1e-9,
    `min r ${Math.min(...rs).toFixed(6)}`);

  /* Count the teeth by counting the runs at tip radius. If the walk round the
     profile has dropped or doubled a tooth this is where it shows. */
  let runs = 0;
  let wasTip = Math.abs(rs[rs.length - 1] - tipRadius(WHEEL)) < 1e-9;
  for (const r of rs) {
    const isTip = Math.abs(r - tipRadius(WHEEL)) < 1e-9;
    if (isTip && !wasTip) runs++;
    wasTip = isTip;
  }
  check("the outline has the teeth it claims", runs === WHEEL.teeth,
    `${runs} tips, ${WHEEL.teeth} teeth`);

  let threw = false;
  try {
    gearShape({ teeth: MIN_TEETH - 1, module: MODULE });
  } catch {
    threw = true;
  }
  check("refuses a tooth count that undercuts", threw, `floor is ${MIN_TEETH}`);
}

// ===========================================================================
// Two gears — the mesh
// ===========================================================================
{
  const C = centreDistance(PINION, WHEEL);
  check("centres are the sum of the pitch radii", Math.abs(C - (pitchRadius(PINION) + pitchRadius(WHEEL))) < 1e-15,
    `${C.toFixed(4)}`);

  check("ratio is the tooth ratio, reversed", Math.abs(gearRatio(PINION, WHEEL) + 0.5) < 1e-15,
    `${gearRatio(PINION, WHEEL).toFixed(3)} — the wheel turns half as fast, backwards`);

  /* Tip circles must not reach each other's root circles, or the teeth bottom
     out however well they are phased. */
  check("tips clear the opposing roots",
    tipRadius(PINION) + tipRadius(WHEEL) > C && // they do overlap — that is meshing
      tipRadius(PINION) < C - rootRadius(WHEEL) + 1e-9,
    `pinion tip ${tipRadius(PINION).toFixed(4)} vs ${(C - rootRadius(WHEEL)).toFixed(4)} available`);

  const pinion = poly(PINION);
  const wheel = poly(WHEEL);

  /** Sweep a full turn of the pinion; nothing of either may enter the other. */
  const sweep = (phase: number) => {
    let hits = 0;
    let firstAt = 0;
    for (let k = 0; k < 900; k++) {
      const a = (k / 900) * TAU;
      const b = a * gearRatio(PINION, WHEEL) + phase;
      const pw = pinion.map((q) => rot(q, a));
      const ww = wheel.map((q) => rot(q, b, C, 0));
      const wC = [C, 0] as const;
      const pC = [0, 0] as const;
      for (const q of pw) if (inside(q[0], q[1], ww, wC, tipRadius(WHEEL))) { hits++; if (!firstAt) firstAt = deg(a); }
      for (const q of ww) if (inside(q[0], q[1], pw, pC, tipRadius(PINION))) { hits++; if (!firstAt) firstAt = deg(a); }
    }
    return { hits, firstAt };
  };

  const good = sweep(meshPhase(WHEEL));
  check("gears mesh without passing through each other", good.hits === 0,
    `${good.hits} penetrations over ${900 * (pinion.length + wheel.length)} vertex tests`);

  /* Half a pitch out is the mistake that looks right. It must be caught. */
  const halfPitch = TAU / WHEEL.teeth / 2;
  const bad = sweep(meshPhase(WHEEL) + halfPitch);
  check("...and half a pitch out grinds", bad.hits > 0,
    `${bad.hits} penetrations, first at ${bad.firstAt.toFixed(1)}° of pinion`);

  check("mesh phase is inside one pitch", meshPhase(WHEEL) >= 0 && meshPhase(WHEEL) < TAU / WHEEL.teeth,
    `${deg(meshPhase(WHEEL)).toFixed(3)}° of a ${deg(TAU / WHEEL.teeth).toFixed(3)}° pitch`);

  /* And the ratio holds over many turns, which is the only thing the involute
     is actually for. */
  const turns = 7;
  const end = meshAngle(TAU * turns, PINION, WHEEL) - meshAngle(0, PINION, WHEEL);
  check("ratio holds over seven turns", Math.abs(end + TAU * turns * 0.5) < 1e-12,
    `${deg(end).toFixed(1)}° of wheel for ${turns * 360}° of pinion`);
}

// ===========================================================================
// Meshing anywhere, not just on the x-axis
// ===========================================================================
{
  const C = centreDistance(PINION, WHEEL);
  const pinion = poly(PINION);
  const wheel = poly(WHEEL);

  /* The scene hangs the pinion below the driver, not beside it. A phase derived
     for bearing 0 and used at bearing −90° is wrong by 90°, and two gears that
     are wrong by any amount other than a whole pitch are two gears passing
     through each other. */
  const sweepAt = (bearing: number, use: (a: number) => number) => {
    let hits = 0;
    for (let k = 0; k < 600; k++) {
      const a = (k / 600) * TAU;
      const b = use(a);
      const wx = Math.cos(bearing) * C;
      const wy = Math.sin(bearing) * C;
      const pw = pinion.map((q) => rot(q, a));
      const ww = wheel.map((q) => rot(q, b, wx, wy));
      const wC = [wx, wy] as const;
      const pC = [0, 0] as const;
      for (const q of pw) if (inside(q[0], q[1], ww, wC, tipRadius(WHEEL))) hits++;
      for (const q of ww) if (inside(q[0], q[1], pw, pC, tipRadius(PINION))) hits++;
    }
    return hits;
  };

  for (const [name, bearing] of [
    ["below", -Math.PI / 2],
    ["above", Math.PI / 2],
    ["behind", Math.PI],
    ["off-axis", 2.317],
  ] as const) {
    const ok = sweepAt(bearing, (a) => meshAngleAt(a, PINION, WHEEL, bearing));
    check(`meshes with the driven gear ${name}`, ok === 0,
      `${ok} penetrations at ${deg(bearing).toFixed(0)}°`);
  }

  /* And the inverse, which is the direction the scene actually uses: the wheel
     is bolted to the Geneva's input shaft, so the pinion has to be solved for. */
  let worstInverse = 0;
  for (let k = 0; k < 500; k++) {
    const want = (k / 500) * TAU * 3 - TAU;
    const a = driverAngleFor(want, PINION, WHEEL, Math.PI / 2);
    const got = meshAngleAt(a, PINION, WHEEL, Math.PI / 2);
    worstInverse = Math.max(worstInverse, Math.abs(got - want));
  }
  check("solving back for the driver round-trips", worstInverse < 1e-12,
    `worst error ${worstInverse.toExponential(1)} rad`);

  const naive = sweepAt(-Math.PI / 2, (a) => meshAngle(a, PINION, WHEEL));
  check("...and the x-axis phase used off-axis grinds", naive > 0,
    `${naive} penetrations`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
