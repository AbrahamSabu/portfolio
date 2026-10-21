/**
 * Geneva kinematics — regression checks.
 *
 * Run with `npm run test:geneva` (Node strips the types natively).
 *
 * These exist because three bugs in step 1 were all of a kind that looks fine
 * in a still frame and only shows up in motion, or only once per revolution:
 *
 *   1. `Math.floor` winding attributed the half of the engagement window lying
 *      below k·2π to index k−1, so the cross jumped a full station backwards
 *      once per driver revolution.
 *   2. The renderer drew the crank at `driver` instead of at `theta`, putting
 *      the pin 180° out — parked inside the cross for the whole dwell.
 *   3. Slots were placed on the line of centres, so a slot mouth sat exactly
 *      where the locking disc needs material to grip.
 *
 * Each has a check below. Steps 2–6 change geometry, materials and the driving
 * signal; none of them may change these numbers.
 */

import {
  crankRadius,
  dutyCycle,
  engageHalfAngle,
  slotRadius,
  solve,
} from "./geneva.ts";
import { crankShape, crossShape, dims, lockDiscShape } from "./genevaParts.ts";
import { readFileSync, readdirSync } from "node:fs";
import { AXLE_ROTATION, axleAlignsWithPlateNormal, axleAxis } from "./axis.ts";

const spec = { slots: 4, centres: 1 };
const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

let fails = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(42)} ${detail}`);
};

// --- dimensions ------------------------------------------------------------
const a = crankRadius(spec);
const b = slotRadius(spec);
check("crank radius = centres·sin(π/n)", Math.abs(a - 0.70710678) < 1e-7, `a = ${a.toFixed(8)}`);
check("slot radius  = centres·cos(π/n)", Math.abs(b - 0.70710678) < 1e-7, `b = ${b.toFixed(8)}`);
check("a = b for a four-slot", Math.abs(a - b) < 1e-12, `Δ = ${Math.abs(a - b).toExponential(2)}`);
check("engage half-angle = 45°", Math.abs(deg(engageHalfAngle(spec)) - 45) < 1e-9, `${deg(engageHalfAngle(spec)).toFixed(6)}°`);
check("duty cycle = 25%", Math.abs(dutyCycle(spec) - 0.25) < 1e-12, `${(dutyCycle(spec) * 100).toFixed(4)}%`);

// --- one index per driver revolution ---------------------------------------
for (const revs of [1, 2, 3, 4, 10]) {
  const s = solve(revs * TAU, spec);
  const want = -revs * (TAU / 4); // counter-rotating
  check(`cross after ${String(revs).padStart(2)} driver rev(s)`, Math.abs(s.cross - want) < 1e-9,
    `${deg(s.cross).toFixed(4)}° (want ${deg(want).toFixed(0)}°)`);
}

// --- bug 2: theta is the angle to draw, and it is π off driver -------------
{
  const rest = solve(0, spec);
  check("bug 2 — crank points away at rest", Math.abs(Math.abs(rest.theta) - Math.PI) < 1e-9,
    `θ = ${deg(rest.theta).toFixed(1)}° (driver 0°)`);
  // pin distance from the cross centre must exceed the slot radius while locked
  const px = Math.cos(rest.theta) * a;
  const py = Math.sin(rest.theta) * a;
  const d = Math.hypot(px - spec.centres, py);
  check("bug 2 — pin clear of the cross at rest", d > b, `|pin→cross| = ${d.toFixed(4)} > b = ${b.toFixed(4)}`);
}

// --- zero angular velocity at entry and exit -------------------------------
const t0 = engageHalfAngle(spec);
for (const [name, d] of [["entry", Math.PI - t0], ["exit", Math.PI + t0]] as const) {
  const s = solve(d, spec);
  check(`engaged at ${name}`, s.engaged, `driver ${deg(d).toFixed(1)}°`);
  check(`dφ/dθ at ${name}`, Math.abs(s.ratio) < 1e-9, `${s.ratio.toExponential(2)}`);
}
{
  const mid = solve(Math.PI, spec);
  check("mid-index is halfway round", Math.abs(mid.cross + TAU / 8) < 1e-9, `${deg(mid.cross).toFixed(4)}° (want −45°)`);
  check("dφ/dθ peaks mid-index", Math.abs(mid.ratio - (1 + Math.SQRT2)) < 1e-9, `${mid.ratio.toFixed(6)} = 1+√2`);
  check("progress 0 → 1 across the window",
    Math.abs(solve(Math.PI - t0, spec).progress - 0) < 1e-9 &&
    Math.abs(solve(Math.PI + t0, spec).progress - 1) < 1e-9,
    `${solve(Math.PI - t0, spec).progress.toFixed(3)} → ${solve(Math.PI + t0, spec).progress.toFixed(3)}`);
}

// --- the pin is always inside a slot while engaged -------------------------
{
  let outside = 0;
  let worst = 0;
  const step = TAU / spec.slots;
  /* Two angle conventions meet here and they are π apart, which is worth
     stating explicitly because getting it wrong looks exactly like a broken
     mechanism. `crossAngle` inside the solver measures the pin's bearing from
     the direction pointing *back at the driver* — that is why its x term is
     (c − a·cosθ) rather than (a·cosθ − c). The model's slots are placed in the
     ordinary atan2 frame. So the pin's standard-frame angle is what must be
     compared against the slots, and slot i sits at cross + step/2 + i·step. */
  for (let d = Math.PI - t0; d <= Math.PI + t0; d += 0.001) {
    const s = solve(d, spec);
    const px = Math.cos(s.theta) * a;
    const py = Math.sin(s.theta) * a;
    const ang = Math.atan2(py, px - spec.centres); // standard frame
    let rel = ang - (s.cross + step / 2);
    rel = ((rel % step) + step) % step; // 0 .. step
    const off = Math.min(rel, step - rel);
    worst = Math.max(worst, off);
    if (off > 1e-9) outside++;
  }
  check("pin tracks a slot centreline exactly", outside === 0,
    `worst deviation ${deg(worst).toExponential(2)}°`);
}

// --- locked everywhere outside the window ----------------------------------
{
  let moved = 0;
  let wrongState = 0;
  for (let d = Math.PI + t0 + 1e-4; d < TAU + Math.PI - t0 - 1e-4; d += 0.005) {
    const s = solve(d, spec);
    if (s.engaged) wrongState++;
    if (Math.abs(s.cross + TAU / 4) > 1e-12) moved++;
  }
  check("reports locked through the dwell", wrongState === 0, `${wrongState} violations`);
  check("cross rigid through the dwell", moved === 0, `${moved} violations`);
}
{
  let engaged = 0;
  let n = 0;
  for (let d = 0; d < 8 * TAU; d += 0.0005, n++) if (solve(d, spec).engaged) engaged++;
  check("engaged 25% of the time", Math.abs(engaged / n - 0.25) < 1e-3, `${((engaged / n) * 100).toFixed(3)}%`);
}

// --- bug 4: the cross must counter-rotate ---------------------------------
{
  const mid = solve(Math.PI, spec);
  check("bug 4 — cross turns against the driver", mid.cross < 0,
    `driver +180° → cross ${deg(mid.cross).toFixed(1)}°`);
}

// --- bug 1: no seam at the revolution boundary -----------------------------
{
  let maxJump = 0;
  let backwards = 0;
  let prev = solve(-0.5, spec).cross;
  for (let d = -0.5; d < 6 * TAU; d += 0.0005) {
    const c = solve(d, spec).cross;
    maxJump = Math.max(maxJump, Math.abs(c - prev));
    if (c > prev + 1e-12) backwards++;
    prev = c;
  }
  check("bug 1 — no discontinuity at the seam", maxJump < 2e-3, `max step ${deg(maxJump).toFixed(5)}° per 0.0005 rad`);
  check("bug 1 — cross never reverses", backwards === 0, `${backwards} reversals`);
}
check("negative driver winds correctly", Math.abs(solve(-TAU, spec).cross - TAU / 4) < 1e-9,
  `${deg(solve(-TAU, spec).cross).toFixed(4)}°`);

// --- other slot counts still hold ------------------------------------------
for (const slots of [3, 5, 6, 8]) {
  const s2 = { slots, centres: 1 };
  const one = solve(TAU, s2);
  check(`n=${slots}: one index per revolution`, Math.abs(one.cross + TAU / slots) < 1e-9,
    `${deg(one.cross).toFixed(3)}° (want ${(-360 / slots).toFixed(1)}°)`);
  check(`n=${slots}: dφ/dθ zero at entry`,
    Math.abs(solve(Math.PI - engageHalfAngle(s2), s2).ratio) < 1e-9, "0");
}

// ===========================================================================
// Step 2 — machined profiles
// ===========================================================================
{
  const d = dims(spec);
  const step = TAU / spec.slots;

  // the crescent is cut by the locking disc, so its ends lie on both circles
  const cresR = d.lock + d.clearance;
  const x = (d.centres ** 2 + d.rim ** 2 - cresR ** 2) / (2 * d.centres);
  const y = Math.sqrt(d.rim ** 2 - x * x);
  check("crescent end lies on the cross rim", Math.abs(Math.hypot(x, y) - d.rim) < 1e-12,
    `r = ${Math.hypot(x, y).toFixed(6)} (rim ${d.rim.toFixed(6)})`);
  check("crescent cut proud of the disc",
    Math.abs(Math.hypot(x - d.centres, y) - cresR) < 1e-12 && cresR > d.lock,
    `crescent ${cresR.toFixed(4)} > disc ${d.lock.toFixed(4)}`);

  // metal must survive between the crescent and the slot beside it
  const cresHalf = Math.atan2(y, x);
  const slotHalfAng = Math.asin(d.slotHalf / d.rim);
  const margin = step / 2 - slotHalfAng - cresHalf;
  check("tooth of metal between crescent and slot", margin > 0.05,
    `${deg(margin).toFixed(2)}° clear`);

  // the pin must never bottom out in the slot
  const deepest = d.centres - d.crank;
  check("slot floor clears the pin at mid-index", d.slotRoot < deepest - 1e-6,
    `root ${d.slotRoot.toFixed(4)} < deepest reach ${deepest.toFixed(4)}`);

  check("gate wider than the engagement", d.gateHalf > engageHalfAngle(spec),
    `±${deg(d.gateHalf).toFixed(1)}° vs ±${deg(engageHalfAngle(spec)).toFixed(1)}°`);

  /* At rest the two slots either side of the line of centres put their outer
     corners nearest the driver; the locking disc must clear them. */
  const mouth = Math.hypot(
    d.centres - d.rim * Math.cos(step / 2),
    d.rim * Math.sin(step / 2),
  );
  check("locking disc clears the slot mouths", d.lock < mouth - 0.02,
    `lock ${d.lock.toFixed(4)} < mouth ${mouth.toFixed(4)}`);

  // the profiles must close into usable outlines and stay in their envelopes
  const cs = crossShape(spec, d).extractPoints(48);
  const ds = lockDiscShape(spec, d).extractPoints(48);
  check("cross profile is a closed outline", cs.shape.length > 200, `${cs.shape.length} points`);
  check("driver profile is a closed outline", ds.shape.length > 100, `${ds.shape.length} points`);

  const rs = cs.shape.map((q) => Math.hypot(q.x, q.y));
  check("cross never exceeds its rim", Math.max(...rs) <= d.rim + 1e-6,
    `max r = ${Math.max(...rs).toFixed(6)}`);
  const floor = d.slotRoot - d.slotHalf; // fillet bows inward
  check("slot bottoms one fillet radius below the root", Math.abs(Math.min(...rs) - floor) < 0.006,
    `min r = ${Math.min(...rs).toFixed(4)} (floor ${floor.toFixed(4)})`);
}

// ===========================================================================
// Interference — the parts must not pass through each other

// ===========================================================================
// Orientation — the failure no plan-view check can see
// ===========================================================================
{
  const d = dims(spec);

  /* Plan view cannot distinguish an upright pin from one lying on its side:
     both are the same circle. Everything above this line works in plan. So the
     crank pin spent step 2 flat in the cross's plane, scything through the
     metal once a revolution, under fifty passing checks — `ExtrudeGeometry`
     runs its thickness along Z and `CylinderGeometry` runs its length along Y,
     and nothing reconciled the two. These are the checks that would have. */
  check("an Axle points along the plate normal", axleAlignsWithPlateNormal(),
    `rotation ${AXLE_ROTATION.map((r) => deg(r).toFixed(0)).join(", ")}°`);
  check("an unrotated cylinder does NOT", !axleAlignsWithPlateNormal([0, 0, 0]),
    "guards the guard: a broken check would pass the line above");

  /* And the reason it cannot come back: no scene file builds a bare cylinder.
     A source check is a blunt instrument, but this is a blunt mistake.

     Both spellings, and only actual construction. The check used to look for
     the JSX tag alone, and the freewheel's rollers went in as
     `new THREE.CylinderGeometry(...)` in a scene file — the exact shape of the
     original bug, straight through a guard written for it. Widening it to the
     bare class name then flagged Stage2, which only *names* it in the comment
     explaining the bug: a guard that fires on its own documentation teaches
     people to delete the documentation. A scene wanting a cylinder uses
     `axleGeometry`, which is the one place that rotation is right. */
  const BUILDS = /<cylinderGeometry|new\s+(THREE\.)?CylinderGeometry/;
  /* Both directories, for the same reason the finish check watches both. */
  const scenes: string[] = [];
  const offenders: string[] = [];
  for (const d of ["../components/geneva/", "../components/site/"]) {
    const dir = new URL(d, import.meta.url);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".tsx") || f === "Axle.tsx") continue;
      scenes.push(f);
      if (BUILDS.test(readFileSync(new URL(f, dir), "utf8"))) offenders.push(f);
    }
  }
  check("no scene builds a bare cylinder", offenders.length === 0,
    offenders.length ? offenders.join(", ") : `${scenes.length} scene files clean`);

  /* A source check narrowed twice is a source check worth checking. */
  const wouldCatch = [
    "<cylinderGeometry args={[1, 1, 2]} />",
    "new THREE.CylinderGeometry(r, r, len)",
    "new CylinderGeometry(r, r, len)",
  ].every((s) => BUILDS.test(s));
  const wouldAllow = [
    "// `CylinderGeometry` runs along Y and ExtrudeGeometry along Z",
    "roller: axleGeometry(FREEWHEEL.roller, t.freewheel, 24),",
  ].every((s) => !BUILDS.test(s));
  check("...and the check still knows one when it sees one",
    wouldCatch && wouldAllow,
    "catches all three spellings, ignores prose and the shared builder");
}

// ===========================================================================
// The roller
// ===========================================================================
{
  const d = dims(spec);
  const t0 = engageHalfAngle(spec);
  const b = slotRadius(spec);

  const entry = solve(Math.PI - t0 + 1e-9, spec);
  const mid = solve(Math.PI, spec);
  const exit = solve(Math.PI + t0 - 1e-9, spec);

  check("pin sits at the slot mouth on entry", Math.abs(entry.reach - b) < 1e-6,
    `reach ${entry.reach.toFixed(6)} (mouth ${b.toFixed(6)})`);
  check("pin reaches the slot root mid-index",
    Math.abs(mid.reach - (spec.centres - crankRadius(spec))) < 1e-9,
    `reach ${mid.reach.toFixed(6)}`);
  check("pin is back at the mouth on exit", Math.abs(exit.reach - b) < 1e-6,
    `reach ${exit.reach.toFixed(6)}`);

  /* The roller rolls in and back out over the same arc, so it finishes each
     index exactly where it started. That is correct and it is also why the
     roller needs a witness mark to be legible at all. */
  check("roller starts and ends each index square",
    Math.abs(entry.roll) < 1e-6 && Math.abs(exit.roll) < 1e-6,
    `entry ${entry.roll.toFixed(6)}, exit ${exit.roll.toFixed(6)}`);
  check("roller is stationary through the dwell", solve(0, spec).roll === 0,
    "locked");

  const turns = Math.abs(mid.roll / d.pin) / TAU;
  check("roller turns a visible amount per index", turns > 0.5,
    `${turns.toFixed(2)} turns each way (${(b - (spec.centres - crankRadius(spec))).toFixed(3)} of travel on a ${d.pin.toFixed(3)} radius)`);

  /* Reversal at mid-index is not a rendering cheat: that is the instant the pin
     stops driving the slot's trailing wall and starts restraining its leading
     one, and a real roller changes hands there too. */
  const before = solve(Math.PI - 0.2, spec).roll;
  const after = solve(Math.PI + 0.2, spec).roll;
  check("roller reverses at mid-index", Math.abs(before - after) < 1e-9 && before !== 0,
    `${before.toFixed(4)} either side of the root`);
}


// ===========================================================================
// Every slot count, not just the one in use
// ===========================================================================
{
  /* The slot centrelines have to straddle the line of centres at rest, and
     that is a statement about where the DRIVER is, not about local zero. Placed
     from zero it comes out right whenever n is even, because π is then a whole
     number of steps — and half a step out when it is odd, which buries the pin
     in metal for the whole of every index.
     
     Four slots hid this for two whole steps of the build. Three found it
     immediately. So: all of them, every time. */
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const sp = { slots: n, centres: 1 };
    const dd = dims(sp);
    const prof = crossShape(sp, dd).extractPoints(48).shape.map(
      (q) => [q.x, q.y] as const,
    );
    const inCross = (px: number, py: number) => {
      let hit = false;
      for (let i = 0, j = prof.length - 1; i < prof.length; j = i++) {
        const [xi, yi] = prof[i];
        const [xj, yj] = prof[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };

    let buried = 0;
    let engagedOutside = 0;
    const N = 900;
    for (let k = 0; k < N; k++) {
      const drv = (k / N) * TAU * n;
      const st = solve(drv, sp);
      // the pin, in the cross's own frame, with the cross's spin undone
      const px = Math.cos(st.theta) * crankRadius(sp) - sp.centres;
      const py = Math.sin(st.theta) * crankRadius(sp);
      const ca = Math.cos(-st.cross);
      const sa = Math.sin(-st.cross);
      const lx = px * ca - py * sa;
      const ly = px * sa + py * ca;
      if (inCross(lx, ly)) buried++;
      if (st.engaged && Math.hypot(lx, ly) > slotRadius(sp) + 1e-6) engagedOutside++;
    }
    check(`n=${n}: the pin rides a slot, never metal`, buried === 0 && engagedOutside === 0,
      buried || engagedOutside
        ? `${buried} buried, ${engagedOutside} outside while indexing`
        : `${N} samples over ${n} revolutions`);
  }
}

// ===========================================================================
// Three dimensions — where every check above is blind
// ===========================================================================
{
  /* Everything before this line works in plan, and plan view is exactly where
     a cylinder lying on its side is indistinguishable from one standing up.
     That is not a hypothetical: it is how the crank pin shipped step 2, flat in
     the cross's plane, cutting through the metal once a revolution while fifty
     checks and a screenshot both said it was fine.

     So: the roller as a solid, sampled over its length as well as its
     circumference, against the cross as a solid — outline AND thickness. */
  const d = dims(spec);
  const cross = crossShape(spec, d).extractPoints(64).shape.map(
    (q) => [q.x, q.y] as const,
  );

  const inside = (px: number, py: number, pg: readonly (readonly [number, number])[]) => {
    let hit = false;
    for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
      const [xi, yi] = pg[i];
      const [xj, yj] = pg[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  const plateHalf = d.thickness / 2 + d.bevel; // the chamfer adds depth too
  const rollerHalf = (d.thickness + d.thickness * 0.24) / 2;
  const axis = axleAxis(); // (0, 0, 1) — along the plate normal, as it must be

  /** Solid roller points: rings around the circumference, along its length. */
  const rollerPts: (readonly [number, number, number])[] = [];
  for (let L = -3; L <= 3; L++) {
    const along = (L / 3) * rollerHalf;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      for (const r of [d.pin, d.pin * 0.5]) {
        rollerPts.push([
          Math.cos(a) * r + axis[0] * along,
          Math.sin(a) * r + axis[1] * along,
          axis[2] * along,
        ] as const);
      }
    }
  }

  let solidHits = 0;
  let firstAt = 0;
  for (let k = 0; k < 900; k++) {
    const drv = (k / 900) * TAU;
    const s = solve(drv, spec);
    const cx = Math.cos(s.theta) * d.crank;
    const cy = Math.sin(s.theta) * d.crank;
    // into the cross's own frame: undo its position, then its rotation
    const ca = Math.cos(-s.cross);
    const sa = Math.sin(-s.cross);
    for (const [rx, ry, rz] of rollerPts) {
      if (Math.abs(rz) > plateHalf) continue; // above or below the plate entirely
      const wx = cx + rx - d.centres;
      const wy = cy + ry;
      /* Outside the cross's rim it cannot be in the metal, and almost every
         sample is. One distance check ahead of the polygon walk takes this
         suite from 46 seconds to under two, and skips only points that would
         have answered false. */
      if (wx * wx + wy * wy > d.rim * d.rim) continue;
      const lx = wx * ca - wy * sa;
      const ly = wx * sa + wy * ca;
      if (inside(lx, ly, cross)) {
        solidHits++;
        if (!firstAt) firstAt = deg(drv);
      }
    }
  }
  check("roller solid never enters the cross solid", solidHits === 0,
    `${solidHits} of ${rollerPts.length * 900} samples${firstAt ? ` (first at driver ${firstAt.toFixed(1)}°)` : ""}`);

  /* And the counter-test, because a suite that cannot fail proves nothing: lay
     the roller down the way the bug had it and the same sweep must scream. */
  const flat = axleAxis([0, 0, 0]); // (0, 1, 0) — in the plane
  let flatHits = 0;
  for (let k = 0; k < 900; k++) {
    const drv = (k / 900) * TAU;
    const s = solve(drv, spec);
    const cx = Math.cos(s.theta) * d.crank;
    const cy = Math.sin(s.theta) * d.crank;
    const ca = Math.cos(-s.cross);
    const sa = Math.sin(-s.cross);
    for (let L = -3; L <= 3; L++) {
      const along = (L / 3) * rollerHalf;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const px = Math.cos(a) * d.pin + flat[0] * along;
        const py = Math.sin(a) * d.pin + flat[1] * along;
        const pz = flat[2] * along;
        if (Math.abs(pz) > plateHalf) continue;
        const wx = cx + px - d.centres;
        const wy = cy + py;
        if (wx * wx + wy * wy > d.rim * d.rim) continue;
        if (inside(wx * ca - wy * sa, wx * sa + wy * ca, cross)) flatHits++;
      }
    }
  }
  check("...and catches the pin laid flat, which is what shipped", flatHits > 0,
    `${flatHits} penetrations with the old orientation`);
}

// ===========================================================================
{
  const d = dims(spec);

  const poly = (pts: { x: number; y: number }[]) => pts.map((q) => [q.x, q.y] as const);
  const cross = poly(crossShape(spec, d).extractPoints(64).shape);
  const disc = poly(lockDiscShape(spec, d).extractPoints(64).shape);
  const crank = poly(crankShape(spec, d).extractPoints(64).shape);

  const inside = (px: number, py: number, pg: readonly (readonly [number, number])[]) => {
    let hit = false;
    for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
      const [xi, yi] = pg[i];
      const [xj, yj] = pg[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const rot = (pt: readonly [number, number], a: number, ox = 0, oy = 0) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [pt[0] * c - pt[1] * s + ox, pt[0] * s + pt[1] * c + oy] as const;
  };

  /* Sweep a whole revolution. At each step put both coplanar profiles into
     world space and test every vertex of each against the other's polygon.
     This is what the arm-through-the-slot bug looked like from the outside: it
     rendered perfectly and was solid metal passing through solid metal. */
  let discInCross = 0;
  let crossInDisc = 0;
  let worstAngle = 0;
  for (let step = 0; step < 720; step++) {
    const drv = (step / 720) * TAU;
    const s = solve(drv, spec);
    const dw = disc.map((q) => rot(q, s.theta));
    const cw = cross.map((q) => rot(q, s.cross, d.centres, 0));
    let bad = false;
    /* A point beyond the other part's outer radius cannot be inside it, and
       almost every one of these is. The reject is exact — it only skips points
       that would have answered false — and it is the difference between this
       suite taking seconds and taking a minute. */
    for (const q of dw) {
      const ox = q[0] - d.centres;
      if (ox * ox + q[1] * q[1] > d.rim * d.rim) continue;
      if (inside(q[0], q[1], cw)) { discInCross++; bad = true; }
    }
    for (const q of cw) {
      if (q[0] * q[0] + q[1] * q[1] > d.lock * d.lock) continue;
      if (inside(q[0], q[1], dw)) { crossInDisc++; bad = true; }
    }
    if (bad && !worstAngle) worstAngle = deg(drv);
  }
  check("locking disc never enters the cross", discInCross === 0,
    `${discInCross} vertex penetrations${worstAngle ? ` (first at ${worstAngle.toFixed(1)}°)` : ""}`);
  check("cross never enters the locking disc", crossInDisc === 0,
    `${crossInDisc} vertex penetrations`);

  /* Vertex-in-polygon is necessary and not sufficient. Two outlines can overlap
     with no vertex of either inside the other — they cross edge-on-edge, like
     the limbs of an X — and at 64 segments a shallow overlap between two arcs
     is exactly that shape. So: every edge against every edge, and separately
     the closest approach, because a gap that is merely positive is not the same
     as a gap you can see. */
  const segHit = (
    p1: readonly [number, number], p2: readonly [number, number],
    p3: readonly [number, number], p4: readonly [number, number],
  ) => {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return false;
    const tt = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den;
    const uu = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / den;
    return tt > 0 && tt < 1 && uu > 0 && uu < 1;
  };

  /** Distance from point p to segment ab. */
  const segDist = (
    p: readonly [number, number],
    a: readonly [number, number], b: readonly [number, number],
  ) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const L = vx * vx + vy * vy;
    const tt = L < 1e-15 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / L));
    const dx = wx - vx * tt, dy = wy - vy * tt;
    return Math.hypot(dx, dy);
  };

  let edgeHits = 0;
  let firstEdge = 0;
  let closest = Infinity;
  let closestAt = 0;
  for (let step = 0; step < 720; step++) {
    const drv = (step / 720) * TAU;
    const s = solve(drv, spec);
    const dw = disc.map((q) => rot(q, s.theta));
    const cw = cross.map((q) => rot(q, s.cross, d.centres, 0));
    /* Only the cross edges anywhere near the locking disc can cross one of its
       edges. The profile is walked at 64 segments a curve, so no segment is
       longer than a few thousandths — a margin of 0.03 on the disc's own radius
       is an order of magnitude more than one, so nothing real is missed. */
    const reach = (d.lock + 0.03) ** 2;
    /* EDGES, not points. Filtering the point list and then walking it in pairs
       invents edges between points that were never adjacent — which reported
       1,156 crossings against a profile that has none. */
    type P = readonly [number, number];
    const nearDisc: (readonly [P, P])[] = [];
    for (let j = 0; j < cw.length; j++) {
      const a = cw[j];
      const b = cw[(j + 1) % cw.length];
      if (a[0] * a[0] + a[1] * a[1] < reach || b[0] * b[0] + b[1] * b[1] < reach) {
        nearDisc.push([a, b] as const);
      }
    }
    for (let i = 0; i < dw.length; i++) {
      const a1 = dw[i], a2 = dw[(i + 1) % dw.length];
      for (let j = 0; j < nearDisc.length; j++) {
        const [b1, b2] = nearDisc[j];
        if (segHit(a1, a2, b1, b2)) {
          edgeHits++;
          if (!firstEdge) firstEdge = deg(drv);
        }
        const g = segDist(a1, b1, b2);
        if (g < closest) { closest = g; closestAt = deg(drv); }
      }
    }
  }
  check("no edge of the disc crosses an edge of the cross", edgeHits === 0,
    `${edgeHits} crossings${firstEdge ? ` (first at driver ${firstEdge.toFixed(1)}°)` : ""}`);

  /* Every check above this line measures the OUTLINE. The renderer extrudes it
     with a chamfer, and `ExtrudeGeometry` pays for a chamfer by growing the
     profile outward — each part comes back `bevel` larger, each pocket `bevel`
     smaller. So two parts facing each other across a gap spend 2·bevel of it
     before anything moves, and a gap that is positive here can be an overlap on
     screen. That is what the 0.008 crescent clearance was: −0.004 of real
     metal, with 50 passing checks over it.

     Hence these two. They are the only checks in the file that know the parts
     get thicker after they leave the file, and they are the reason the numbers
     in `dims()` are what they are. */
  const wantGap = d.bevel * 2 + d.thickness * 0.12;
  check("disc clears the crescent once chamfered", closest > wantGap,
    `${closest.toFixed(4)} nominal − ${(d.bevel * 2).toFixed(4)} chamfer = ${(closest - d.bevel * 2).toFixed(4)} real, at driver ${closestAt.toFixed(1)}°`);

  /* Same arithmetic for the slot, which only has one chamfer facing the pin —
     the pin is turned, not extruded, so it does not grow. */
  /* Threshold deliberately tighter than the crescent's. The roller is meant to
     look like a running fit; the chamfer still has to be paid for, but what is
     left over only has to read as a line, not a gap. */
  const pinGap = d.slotHalf - d.pin;
  check("pin clears the slot wall once chamfered", pinGap - d.bevel > d.thickness * 0.08,
    `${pinGap.toFixed(4)} nominal − ${d.bevel.toFixed(4)} chamfer = ${(pinGap - d.bevel).toFixed(4)} real per side`);

  /* The crank is below the cross plane, so it may overlap in plan — that is the
     whole point of moving it. What must hold is that the PIN, which does cross
     the plane, stays inside a slot for the entire engagement. */
  check("arm is wider than a slot (why it had to move)", d.armHalf > d.slotHalf,
    `arm ${d.armHalf.toFixed(3)} vs slot ${d.slotHalf.toFixed(3)}`);
  check("pin is narrower than a slot", d.pin < d.slotHalf,
    `pin ${d.pin.toFixed(3)} < slot ${d.slotHalf.toFixed(3)}`);

  /* The pin's BODY, not just its centre, and across the whole revolution
     rather than only the engagement window. Checking the centre proves the pin
     follows the slot; it says nothing about whether the 0.055-radius cylinder
     around that centre is clipping a slot wall or catching the rim on its way
     in. Those are different failures and only the second is visible. */
  const pinRing: (readonly [number, number])[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    pinRing.push([Math.cos(a) * d.pin, Math.sin(a) * d.pin] as const);
  }

  let pinHits = 0;
  let firstHit = 0;
  let deepest = 0;
  for (let k = 0; k < 1440; k++) {
    const drv = (k / 1440) * TAU;
    const s = solve(drv, spec);
    const cx = Math.cos(s.theta) * d.crank;
    const cy = Math.sin(s.theta) * d.crank;
    const cw = cross.map((q) => rot(q, s.cross, d.centres, 0));
    for (const rp of pinRing) {
      const px = cx + rp[0];
      const py = cy + rp[1];
      if (inside(px, py, cw)) {
        pinHits++;
        if (!firstHit) firstHit = deg(drv);
        deepest = Math.max(deepest, d.pin);
      }
    }
  }
  check("pin body never touches the cross", pinHits === 0,
    `${pinHits} penetrations${firstHit ? ` (first at driver ${firstHit.toFixed(1)}°)` : ""}`);

  check("pin has clearance in the slot", d.slotHalf - d.pin > 0.004,
    `${(d.slotHalf - d.pin).toFixed(4)} per side`);

  void crank;
}

console.log(fails ? `\n${fails} FAILED` : `\nall checks passed`);
process.exit(fails ? 1 : 0);

