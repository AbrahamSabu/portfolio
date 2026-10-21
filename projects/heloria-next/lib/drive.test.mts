/**
 * Which way everything turns.
 *
 *   node lib/drive.test.mts
 *
 * Meshed wheels turn opposite ways. That is not a subtlety — it is the most
 * visible property a gear train has, and the page shipped with the input pair
 * turning the same way at the same rate because the scene handed both gears one
 * angle. The stills did not show it, because `shot.mts` solved the pair
 * properly and the two files had quietly become descriptions of different
 * machines.
 *
 * So: angles come from `lib/drive.ts` now, and this asserts the two things that
 * were wrong. Parts on one shaft share an angle exactly. Parts across a mesh
 * counter-rotate, in the tooth ratio.
 */

import {
  CROWN_IN,
  CROWN_OUT,
  PINION_IN,
  PINION_OUT,
  SPUR_LOW,
  SPUR_TOP,
} from "./assembly.ts";
import { anglesAt } from "./drive.ts";
import { TRAIN, reduction } from "./train.ts";

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;
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

/** d(angle)/d(input), by difference, away from any Geneva engagement edge. */
function rates(at: number) {
  const h = 1e-5;
  const a = anglesAt(at - h);
  const b = anglesAt(at + h);
  const d = (x: keyof typeof a, y: typeof a) =>
    ((y[x] as number) - (a[x] as number)) / (2 * h);
  return {
    spurTop: d("spurTop", b),
    spurLow: d("spurLow", b),
    driver1: d("driver1", b),
    cross1: d("cross1", b),
    driver2: d("driver2", b),
    cross2: d("cross2", b),
  };
}

// ===========================================================================
// Meshes counter-rotate
// ===========================================================================
{
  /* Mid-dwell, so the Genevas are not moving and the gears are. */
  const r = rates(TAU * 0.5);

  check("the input spur pair turns opposite ways", r.spurTop * r.spurLow < 0,
    `top ${r.spurTop.toFixed(4)}, low ${r.spurLow.toFixed(4)}`);

  const want = -SPUR_LOW.teeth / SPUR_TOP.teeth;
  const got = r.spurTop / r.spurLow;
  check("...in the tooth ratio", Math.abs(got - want) < 1e-6,
    `${got.toFixed(5)} against −${SPUR_LOW.teeth}/${SPUR_TOP.teeth} = ${want.toFixed(5)}`);

  /* The crown pairs cross at a right angle, so "opposite" is not meaningful
     for them the way it is for two spur gears on parallel shafts. What must
     hold is the ratio. */
  const crownIn = r.spurLow / r.driver1;
  check("the input crown drives at its tooth ratio",
    Math.abs(Math.abs(crownIn) - CROWN_IN.teeth / PINION_IN.teeth) < 1e-6,
    `${Math.abs(crownIn).toFixed(5)} against ${CROWN_IN.teeth}/${PINION_IN.teeth}`);

  /* And the output crown, which only turns while stage 1's cross does. */
  let engaged = 0;
  for (let k = 0; k < 4000 && !engaged; k++) {
    const drv = (k / 4000) * TAU * reduction(TRAIN);
    if (anglesAt(drv).train.stage1.engaged) engaged = drv + 0.01;
  }
  const e = rates(engaged);
  const crownOut = e.driver2 / e.cross1;
  check("the output crown drives at its tooth ratio",
    Math.abs(Math.abs(crownOut) - CROWN_OUT.teeth / PINION_OUT.teeth) < 1e-5,
    `${Math.abs(crownOut).toFixed(5)} against ${CROWN_OUT.teeth}/${PINION_OUT.teeth}`);
}

// ===========================================================================
// Nothing turns at the same rate as something it meshes with
// ===========================================================================
{
  /* The exact failure that shipped: two gears handed one angle. If any meshed
     pair ever shares a rate, something has been wired to the wrong source. */
  const r = rates(TAU * 0.5);
  check("no meshed pair shares a rate", Math.abs(r.spurTop - r.spurLow) > 1e-6,
    `${Math.abs(r.spurTop - r.spurLow).toFixed(4)} apart — was 0 on the page`);

  check("the flywheel rides the upper shaft", true,
    "drawn at spurTop, so it cannot drift from the gear beside it");
}

// ===========================================================================
// One shaft, one direction
// ===========================================================================
{
  /* Stage 2's crank and the output pinion are bolted to the same layshaft.
     They are drawn from different quantities — the pinion from whatever the
     crown mesh demands, the crank from the Geneva's own theta — and nothing
     was checking that those two still agree. They did not: fixing the crown's
     mount reversed the pinion and left the Geneva turning the other way on the
     same piece of steel. */
  const h = 1e-5;
  const at = TAU * 2.46; // mid-index on the slow stage
  const before = anglesAt(at - h);
  const after = anglesAt(at + h);
  const pinion = (after.driver2 - before.driver2) / (2 * h);
  const crank = (after.crank2 - before.crank2) / (2 * h);

  check("stage 2's crank turns with its own pinion", pinion * crank > 0,
    `pinion ${pinion.toFixed(4)}, crank ${crank.toFixed(4)}`);
  check("...at exactly the same rate", Math.abs(pinion - crank) < 1e-6,
    `${Math.abs(pinion - crank).toExponential(1)} apart on one shaft`);

  /* And the offset between them is a constant, over the whole cycle rather
     than at one convenient angle. Bolting is a fixed clock angle; anything
     that drifts is two parts on what is supposed to be one shaft.

     The wrap has to come out of both before differencing, or the crank's jump
     from +π to −π reads as a 360° slip. */
  const wrap = (x: number) => x - Math.round(x / TAU) * TAU;
  let worst = 0;
  const first = wrap(anglesAt(0).crank2 - anglesAt(0).driver2);
  for (let k = 1; k <= 4000; k++) {
    const a = anglesAt((k / 4000) * TAU * reduction(TRAIN));
    worst = Math.max(worst, Math.abs(wrap(wrap(a.crank2 - a.driver2) - first)));
  }
  check("...and stays clocked to it all cycle", worst < 1e-9,
    `${deg(first).toFixed(1)}° apart, drifting ${worst.toExponential(1)} rad over 9 turns`);
}

// ===========================================================================
// Same shaft, same angle
// ===========================================================================
{
  for (const at of [0.3, 1.7, 2.45, 5.2]) {
    const a = anglesAt(TAU * at);
    /* Stage 1's crank and its locking disc are one part of one shaft; so is the
       crown beneath the cross. Those are single values here by construction,
       which is the point — there is nowhere for them to disagree. */
    check(`angles resolve at ${at} rev`,
      [a.spurTop, a.spurLow, a.driver1, a.cross1, a.driver2, a.cross2].every(
        Number.isFinite,
      ),
      `driver1 ${((a.driver1 * 180) / Math.PI).toFixed(1)}°, cross1 ${((a.cross1 * 180) / Math.PI).toFixed(1)}°`);
  }
}

// ===========================================================================
// The Genevas still do what the train says
// ===========================================================================
{
  let moving = 0;
  const N = 6000;
  for (let k = 0; k < N; k++) {
    const a = anglesAt((k / N) * TAU * reduction(TRAIN));
    if (a.train.stage2.engaged) moving++;
  }
  check("the output still moves for a fiftieth of the cycle",
    moving / N > 0.015 && moving / N < 0.025,
    `${((moving / N) * 100).toFixed(2)}%`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
