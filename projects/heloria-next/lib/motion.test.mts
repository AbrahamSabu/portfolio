/**
 * How the machine is driven.
 *
 *   node lib/motion.test.mts
 *
 * The check that earns its place is frame-rate independence. A decay written
 * `v *= 0.9` is a different machine at 144Hz than at 60Hz — whoever tuned the
 * feel tuned it for their own screen and nobody else gets it — and the failure
 * is invisible to the person who wrote it, because their screen is the one it
 * was tuned on.
 */

import {
  DRIVE,
  SITE_DRIVE,
  idleRate,
  push,
  rateOf,
  step,
  stepCalm,
  type Drive,
} from "./motion.ts";
import { TRAIN, reduction, solveTrain } from "./train.ts";

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

const start = (): Drive => ({ angle: 0, spin: 0 });

/** Run for `seconds` at a given frame rate. */
function run(d: Drive, seconds: number, hz: number) {
  const dt = 1 / hz;
  let s = d;
  for (let t = 0; t < seconds - 1e-9; t += dt) s = step(s, dt);
  return s;
}

// ===========================================================================
// Frame rate must not change the machine
// ===========================================================================
{
  const a = run(push(start(), 600), 3, 60);
  const b = run(push(start(), 600), 3, 144);
  const c = run(push(start(), 600), 3, 24);

  const spread = Math.max(a.angle, b.angle, c.angle) - Math.min(a.angle, b.angle, c.angle);
  check("three seconds is three seconds at any frame rate", spread < 1e-9,
    `${(spread / TAU).toExponential(1)} rev between 24, 60 and 144Hz`);

  /* And one big step must match many small ones, or a dropped frame costs the
     machine ground and it drifts out of step with the page. */
  const fine = run(push(start(), 600), 1, 240);
  const coarse = step(push(start(), 600), 1);
  check("a dropped frame costs nothing",
    Math.abs(fine.angle - coarse.angle) < 1e-6,
    `${Math.abs(fine.angle - coarse.angle).toExponential(1)} rad over a 1s step`);
}

// ===========================================================================
// Idle
// ===========================================================================
{
  const d = run(start(), 5, 60);
  check("it turns on its own", Math.abs(d.angle / TAU - DRIVE.idle * 5) < 1e-9,
    `${(d.angle / TAU).toFixed(3)} rev in 5s at ${DRIVE.idle} rev/s`);

  check("an untouched machine has no boost", d.spin === 0, `${d.spin}`);

  /* The index has to be long enough to watch. Under about half a second the
     snap is over in a handful of frames and reads as a jump cut. */
  const indexSeconds = 1 / DRIVE.idle / TRAIN.stage1.slots;
  check("an index lasts long enough to see", indexSeconds > 0.7 && indexSeconds < 2,
    `${indexSeconds.toFixed(2)}s per index, ${(1 / DRIVE.idle).toFixed(2)}s per revolution`);

  const slowEvery = reduction(TRAIN) / TRAIN.stage2.slots / DRIVE.idle;
  check("the slow stage moves often enough to wait for",
    slowEvery > 8 && slowEvery < 25,
    `once every ${slowEvery.toFixed(1)}s`);
}

// ===========================================================================
// Scroll
// ===========================================================================
{
  const pushed = push(start(), 400);
  check("scrolling adds speed", rateOf(pushed) > idleRate(),
    `${(rateOf(pushed) / idleRate()).toFixed(2)}× idle`);

  /* And it decays back, monotonically. A boost that lingers at a plateau reads
     as the machine having changed gear rather than having been pushed. */
  let d = pushed;
  let previous = rateOf(d);
  let rose = 0;
  /* Six decay constants, which is the usual "settled" mark: e⁻⁶ leaves a
     quarter of a percent of the impulse. Anything tighter is a test of how
     long the loop ran rather than of the decay. */
  const settle = DRIVE.decay * 6;
  for (let t = 0; t < settle; t += 1 / 60) {
    d = step(d, 1 / 60);
    const now = rateOf(d);
    if (now > previous + 1e-12) rose++;
    previous = now;
  }
  check("the boost decays, monotonically",
    rose === 0 && rateOf(d) / idleRate() < 1.01,
    `${rose} rises, ${(rateOf(d) / idleRate()).toFixed(4)}× idle after ${settle.toFixed(1)}s`);

  /* Scrolling back drives it back. It is a shaft, not a ratchet. */
  const back = push(start(), -900);
  check("scrolling back can reverse it", rateOf(back) < 0,
    `${(rateOf(back) / idleRate()).toFixed(2)}× idle`);

  /* But a fling cannot blur the machine into nothing. */
  const fling = push(start(), 1e6);
  check("a fling is capped", rateOf(fling) <= idleRate() * 5 + 1e-9,
    `${(rateOf(fling) / idleRate()).toFixed(2)}× idle at the ceiling`);

  /* At the ceiling an index still has to last more than a frame or two. */
  const fastIndex = TAU / TRAIN.stage1.slots / rateOf(fling);
  check("even flung, an index spans several frames", fastIndex > 4 / 60,
    `${(fastIndex * 1000).toFixed(0)}ms, ${(fastIndex * 60).toFixed(1)} frames at 60Hz`);
}

// ===========================================================================
// Reduced motion
// ===========================================================================
{
  const calm = stepCalm(push(start(), 5000), 1);
  check("reduced motion ignores scroll", calm.spin === 0, "no boost carried");
  check("...but the machine still runs", calm.angle > 0 && calm.angle < idleRate(),
    `${(calm.angle / TAU).toFixed(4)} rev in 1s against ${DRIVE.idle} at full speed`);
}

// ===========================================================================
// It still drives the mechanism
// ===========================================================================
{
  /* The drive only produces an angle; everything downstream is the solver. So
     the one thing to confirm is that a scrolled angle is still an angle the
     train can take — unwrapped, monotonic under idle, no wrapping games. */
  let d = start();
  let last = -Infinity;
  let backwards = 0;
  for (let i = 0; i < 2000; i++) {
    d = step(d, 1 / 60);
    if (i % 200 === 0) d = push(d, 300);
    if (d.angle < last) backwards++;
    last = d.angle;
  }
  check("the angle only ever advances under forward scroll", backwards === 0,
    `${(d.angle / TAU).toFixed(1)} rev over 33s`);

  const s = solveTrain(d.angle, TRAIN);
  check("and the train solves it", Number.isFinite(s.ratio) && Number.isFinite(s.stage2.cross),
    `station ${s.stage1.station}, dφ/dθ ${s.ratio.toFixed(2)}`);
}

// ===========================================================================
// The flywheel, as the page claims it
// ===========================================================================
/*
 * The page tells the reader to scroll as hard as they like, and that the
 * machine will barely notice. That is a claim with a test built into it — the
 * reader's own scroll wheel — so it is held to numbers here, against the
 * site's spec, before anybody is invited to try it.
 */
{
  const S = SITE_DRIVE;
  const idle = idleRate(S);
  const boost = (d: Drive) => rateOf(d, S) - idle;
  const DT = 1 / 60;

  /* As hard as you like: a flick worth a whole page, every frame, for two
     seconds. Nobody scrolls harder than that. */
  let d: Drive = { angle: 0, spin: 0 };
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    d = push(d, 3000, S);
    d = step(d, DT, S);
    peak = Math.max(peak, boost(d));
  }
  check("the hardest scroll barely moves it", peak < idle * 0.25,
    `surges ${((100 * peak) / idle).toFixed(1)}% over idle, held flat out for 2s`);

  /* Against the workbench's drive, which is the version the claim was false
     for. Not a test of DRIVE — a record of why the site has its own spec. */
  let w: Drive = { angle: 0, spin: 0 };
  w = push(w, 3000, DRIVE);
  w = step(w, DT, DRIVE);
  check("...where the workbench's drive would have gone five times over",
    rateOf(w) > idleRate() * 4, `${(rateOf(w) / idleRate()).toFixed(2)}x idle one frame after the same flick`);

  /* It resists being sped up, not just being slowed down — the half of a
     flywheel the original model left out. One saturating shove: a frame
     later the shaft has taken up almost none of it. */
  let one: Drive = push({ angle: 0, spin: 0 }, 1e6, S);
  const shoved = one.kick ?? 0;
  one = step(one, DT, S);
  check("a shove is taken up gradually, not in a frame", boost(one) < shoved * 0.05,
    `${((100 * boost(one)) / shoved).toFixed(2)}% of the shove after one frame`);

  /* ...and lets go slowly. Peak, then how long until half of it is gone. */
  let t = 0;
  let top = 0;
  let topAt = 0;
  let half = NaN;
  for (let i = 0; i < 60 * 12; i++) {
    one = step(one, DT, S);
    t += DT;
    const b = boost(one);
    if (b > top) { top = b; topAt = t; }
    else if (Number.isNaN(half) && b < top / 2) half = t - topAt;
  }
  check("...rises over most of a second", topAt > 0.5 && topAt < 1.6,
    `peaks ${topAt.toFixed(2)}s after the shove`);
  check("...and takes longer again to let go", half > 0.8,
    `half gone ${half.toFixed(2)}s after the peak`);
  check("...and does, in the end", Math.abs(boost(one)) < idle * 0.01,
    `${((100 * boost(one)) / idle).toFixed(3)}% of idle left after 12s`);

  /* Exact, like the plain step: the closed form over one long step has to
     land exactly where sixty short ones do, or the feel depends on the
     display it is watched on. */
  const run = (hz: number) => {
    let x: Drive = push({ angle: 0, spin: 0 }, 2000, S);
    for (let i = 0; i < hz * 3; i++) x = step(x, 1 / hz, S);
    return x.angle;
  };
  const a60 = run(60);
  const spreadHz = Math.max(Math.abs(run(144) - a60), Math.abs(run(30) - a60), Math.abs(run(1) - a60));
  check("the flywheel is the same at any frame rate", spreadHz < 1e-9,
    `${spreadHz.toExponential(1)} rad between 1, 30, 60 and 144 Hz over 3s`);

  /* And the plain drive is untouched: nothing stored, nothing new in the
     state, exactly the behaviour every earlier check was written against. */
  const plain = push({ angle: 0, spin: 0 }, 100, DRIVE);
  check("without inertia a shove still lands directly", plain.kick === undefined && plain.spin > 0,
    "DRIVE behaves exactly as it did");
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
