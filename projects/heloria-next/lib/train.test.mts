/**
 * The train, asserted before it is drawn.
 *
 *   node lib/train.test.mts
 *
 * The one that matters is "stage 2 is never parked mid-index". Everything else
 * here is arithmetic; that one is the design. A Geneva driven in steps has to
 * receive its whole engagement window in a single step, and if the phase is
 * wrong by any amount at all, a step ends with a pin sitting inside a slot —
 * which renders as a perfectly tidy mechanism that has quietly stopped being a
 * mechanism. Nothing in a still frame would show it.
 */

import { crossBearing, engageHalfAngle, solve, type GenevaSpec } from "./geneva.ts";
import {
  TRAIN,
  jumpsPerTurn,
  peakRatio,
  peakStageRatio,
  reduction,
  solveTrain,
  stage2Slack,
  type TrainSpec,
} from "./train.ts";

const TAU = Math.PI * 2;
const train: TrainSpec = TRAIN;
const spec: GenevaSpec = train.stage1; // stage 1, where the pawl lives
const deg = (r: number) => (r * 180) / Math.PI;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(46)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(46)} ${detail}`);
  }
}

// ===========================================================================
// The phase offset — the only thing here that is a decision
// ===========================================================================
{
  /* The link ratio is not free: stage 2's driver has to make a whole number of
     jumps per revolution or it indexes at irregular intervals. */
  const jumps = jumpsPerTurn(train);
  check("whole number of jumps per driver turn", Math.abs(jumps - Math.round(jumps)) < 1e-12,
    `${jumps} jumps of ${deg((TAU / spec.slots) * Math.abs(train.link)).toFixed(0)}°`);

  /* The reason stage 2 has three slots. A jump of 360/n₁ has to bracket a
     window of 2(π/2 − π/n₂) with room to spare at both ends. Four slots gives
     exactly zero, which is not "tight" — it means every rest position sits on
     the entry or exit angle, where the gate is open and the cross is held by a
     pin touching a slot mouth. */
  const slack = stage2Slack(train);
  check("the jump brackets the window with room", slack > 0.2,
    `${deg(slack).toFixed(1)}° at each end of a ${deg(TAU / spec.slots).toFixed(0)}° jump`);
  check("...which four slots on a 1:1 link would not",
    Math.abs(stage2Slack({ ...train, link: 1, stage2: { slots: 4, centres: 1 } })) < 1e-12,
    "0.0° — no margin at all");

  /* THE test. Whenever stage 1 is resting, stage 2 must be resting too —
     because stage 1 resting is the only time stage 2's driver is stationary,
     and a stationary driver inside an engagement window is a parked pin. */
  let parked = 0;
  let parkedAt = 0;
  for (let k = 0; k < 20000; k++) {
    const drv = (k / 20000) * TAU * reduction(train);
    const t = solveTrain(drv, train);
    if (!t.stage1.engaged && t.stage2.engaged) {
      parked++;
      if (!parkedAt) parkedAt = deg(drv);
    }
  }
  check("stage 2 is never parked mid-index", parked === 0,
    parked ? `${parked} samples parked, first at input ${parkedAt.toFixed(1)}°` : "20000 samples over 9 revolutions");

  /* And the counter-test, because the check above passes trivially if stage 2
     never engages at all. Break the offset and it must catch it. */
  const broken = (phase: number) => {
    let bad = 0;
    for (let k = 0; k < 4000; k++) {
      const drv = (k / 4000) * TAU * reduction(train);
      const s1 = solve(drv, train.stage1);
      const s2 = solve(s1.cross * train.link + phase, train.stage2);
      if (!s1.engaged && s2.engaged) bad++;
    }
    return bad;
  };
  check("...and a wrong offset parks it", broken(Math.PI / 3) > 0 && broken(Math.PI / 5) > 0,
    `60° → ${broken(Math.PI / 3)} parked, 36° → ${broken(Math.PI / 5)} parked`);
}

// ===========================================================================
// Reduction
// ===========================================================================
{
  check("nine input turns per output turn", reduction(train) === 9, `${reduction(train)}:1`);

  const start = solveTrain(0, train);
  const end = solveTrain(TAU * reduction(train), train);
  const swept = end.stage2.cross - start.stage2.cross;
  check("output turns exactly once in 9", Math.abs(Math.abs(swept) - TAU) < 1e-9,
    `${deg(swept).toFixed(3)}°`);

  const oneRev = solveTrain(TAU, train);
  check("stage 1 indexes once per input turn",
    Math.abs(Math.abs(oneRev.stage1.cross - start.stage1.cross) - TAU / spec.slots) < 1e-9,
    `${deg(oneRev.stage1.cross - start.stage1.cross).toFixed(1)}°`);

  const fourRev = solveTrain(TAU * jumpsPerTurn(train), train);
  check("stage 2 indexes once per three input turns",
    Math.abs(Math.abs(fourRev.stage2.cross - start.stage2.cross) - TAU / train.stage2.slots) < 1e-9,
    `${deg(fourRev.stage2.cross - start.stage2.cross).toFixed(1)}°`);
}

// ===========================================================================
// Sense of rotation
// ===========================================================================
{
  /* The two crosses turn the SAME way, and that is the crown's doing.

     Two counter-rotations make a co-rotation and leave the crosses opposed —
     which is what this asserted, and what the machine did, until the output
     crown turned out to be mounted teeth-down. That reversal is a third
     negative in the chain and it lands here: the slow cross now follows the
     fast one instead of opposing it.

     Asserted against the link's sign rather than against whatever the code
     happens to do, so it stays a claim about the mechanism. */
  /* Sampled inside stage 2's index, not at an arbitrary angle. Stage 2 is
     stationary for 47 of every 48 samples, so picking one at random and
     concluding anything about its direction is a coin toss that lands on
     "+0.000°" and passes nothing. */
  let at = 0;
  for (let k = 0; k < 20000 && !at; k++) {
    const drv = (k / 20000) * TAU * reduction(train);
    if (solveTrain(drv, train).stage2.engaged) at = drv + 0.01;
  }
  const a = solveTrain(at, train);
  const b = solveTrain(at + 0.02, train);
  const d1 = b.stage1.cross - a.stage1.cross;
  const d2 = b.stage2.cross - a.stage2.cross;
  /* d(cross2)/d(cross1) = −ratio₂ · link, and ratio₂ > 0 through an index, so
     the crosses oppose when the link is positive and follow when it is not. */
  const shouldOppose = train.link > 0;
  check(`the crosses turn ${shouldOppose ? "opposite ways" : "together"}`,
    d1 < 0 && (shouldOppose ? d2 > 0 : d2 < 0),
    `at input ${(at / TAU).toFixed(2)} rev: stage 1 ${deg(d1).toFixed(3)}°, stage 2 ${deg(d2).toFixed(3)}°`);

  /* The same sweep with the link's sign flipped, which must come out the other
     way. Without it the check above also passes for a machine whose second
     stage never moves at all. */
  const mirrored = { ...train, link: -train.link };
  let mAt = 0;
  for (let k = 0; k < 20000 && !mAt; k++) {
    const drv = (k / 20000) * TAU * reduction(mirrored);
    if (solveTrain(drv, mirrored).stage2.engaged) mAt = drv + 0.01;
  }
  const md =
    solveTrain(mAt + 0.02, mirrored).stage2.cross - solveTrain(mAt, mirrored).stage2.cross;
  check("...and reversing the link reverses the slow cross", md * d2 < 0,
    `${deg(d2).toFixed(3)}° becomes ${deg(md).toFixed(3)}°`);
}

// ===========================================================================
// The composed snap
// ===========================================================================
{
  let peak = 0;
  let peakAt = 0;
  let moving = 0;
  const N = 40000;
  for (let k = 0; k < N; k++) {
    const drv = (k / N) * TAU * reduction(train);
    const t = solveTrain(drv, train);
    if (Math.abs(t.ratio) > peak) {
      peak = Math.abs(t.ratio);
      peakAt = drv;
    }
    if (t.stage2.engaged) moving++;
  }

  check("output peak is both stages and the link", Math.abs(peak - peakRatio(train)) < 3e-3,
    `${peak.toFixed(3)} = ${peakStageRatio(train.stage1).toFixed(3)} × ${peakStageRatio(train.stage2).toFixed(3)} × ${Math.abs(train.link).toFixed(3)}`);

  /* Both stages peak together — that is where the square comes from, and it is
     not something to take on trust. */
  const atPeak = solveTrain(peakAt, train);
  check("both stages peak at the same instant",
    Math.abs(atPeak.stage1.ratio - peakStageRatio(train.stage1)) < 2e-3 &&
      Math.abs(atPeak.stage2.ratio - peakStageRatio(train.stage2)) < 2e-3,
    `stage 1 ${atPeak.stage1.ratio.toFixed(4)}, stage 2 ${atPeak.stage2.ratio.toFixed(4)}`);

  /* Stage 2 engages while |bearing of stage 1's cross| ≤ stage 2's half-window.
     Inverting that for the input angle is the whole point of the exercise: the
     naive answer — 60° of window out of a 90° jump, so two thirds — is wrong
     by exactly a factor of two, because stage 1's cross is at its *fastest*
     across the middle of the jump, which is precisely where the window is.

         a(√3·sinθ + cosθ) = 1   →   √2·sin(θ + 30°) = 1   →   θ = 15°

     15° of a ±45° window is one third, not two, so the output moves for
     (1/3)(1/4)(1/4) = 1/48 of the cycle. Solved here rather than asserted, so
     the check still means something for other slot counts. */
  let enter = 0;
  /* A width, so the link's magnitude. Signed, this went negative, the search
     below matched on its first sample, and the "expected" duty came out 0.000%
     — a test failing on its own arithmetic rather than on the machine's. */
  const half2 = engageHalfAngle(train.stage2) / Math.abs(train.link);
  for (let k = 1; k <= 200000; k++) {
    const th = (k / 200000) * engageHalfAngle(train.stage1);
    if (crossBearing(th, train.stage1) >= half2) { enter = th; break; }
  }
  const want = ((2 * enter) / TAU) / jumpsPerTurn(train);
  const duty = moving / N;
  check("the output's duty matches the geometry", Math.abs(duty - want) < 5e-4,
    `${(duty * 100).toFixed(3)}% (want ${(want * 100).toFixed(3)}%, entry at θ ${deg(enter).toFixed(2)}°)`);

  /* Entry and exit at zero, twice over: stage 2 enters exactly as stage 1 is
     itself entering, so the composed velocity is zero to second order. */
  const t0 = engageHalfAngle(spec);
  const entry = solveTrain(TAU * 2 + Math.PI - t0 + 1e-7, train);
  check("output starts from a dead stop", Math.abs(entry.ratio) < 1e-5,
    `dφ/dθ ${entry.ratio.toExponential(2)}`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
