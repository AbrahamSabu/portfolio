/**
 * The wind-down, asserted.
 *
 *   node lib/rest.test.mts
 *
 * The freewheel's note tells the reader: stop scrolling, everything else
 * comes to rest, this one keeps turning. The Geneva's note, a section
 * earlier, promises they will never catch it resting mid-step. Both are
 * invitations to try, so both are held here against the real drive, the real
 * solver and the real clutch — at forty different moments to stop, spread
 * across two full cycles of the slowest wheel, because a claim that holds at
 * the moment somebody happened to test it is not a claim.
 */

import { HUB, restHub, stepHub, type HubState } from "./freewheel.ts";
import { SITE_DRIVE, idleRate, rateOf, type Drive } from "./motion.ts";
import { RESUME, RUNNING, dwellAfter, govern, inDwell, type Governor } from "./rest.ts";
import { TRAIN, solveTrain } from "./train.ts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(56)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(56)} ${detail}`);
  }
}

const S = SITE_DRIVE;
const TAU = Math.PI * 2;
const DT = 1 / 60;
const idle = idleRate(S);

/** A running machine, its governor and its output, stepped together. */
class Rig {
  d: Drive = { angle: 0, spin: 0 };
  g: Governor = RUNNING;
  hub: HubState = restHub();
  last = solveTrain(0, TRAIN).stage2.cross;
  step(wantRest: boolean) {
    const before = this.d.angle;
    const r = govern(this.g, this.d, DT, wantRest, S);
    this.g = r.g;
    this.d = r.d;
    const cross = solveTrain(this.d.angle, TRAIN).stage2.cross;
    this.hub = stepHub(this.hub, (cross - this.last) / DT, DT, HUB);
    this.last = cross;
    return (this.d.angle - before) / DT;
  }
}

// ===========================================================================
// Where it can rest
// ===========================================================================
{
  let bad = 0;
  let checked = 0;
  for (let a = 0; a < 40; a += 0.37) {
    const r = dwellAfter(a);
    checked++;
    if (r < a || !inDwell(r)) bad++;
  }
  check("every planned resting angle is a dwell, and ahead", bad === 0,
    `${checked - bad} of ${checked} starting angles`);

  /* And the dwell test means it: an angle mid-index is refused. */
  let mid = NaN;
  for (let a = 0; a < 40; a += 0.01) {
    if (solveTrain(a, TRAIN).stage1.engaged) { mid = a; break; }
  }
  check("...and an angle mid-step is not one", !Number.isNaN(mid) && !inDwell(mid),
    `first wheel engaged at input ${mid.toFixed(2)} rad`);
}

// ===========================================================================
// Stopping, at forty different moments
// ===========================================================================
{
  const PHASES = 40;
  const results = {
    slowest: 0,
    backwards: 0,
    worstJump: 0,
    notDwell: 0,
    moved: 0,
    engagedAtRest: 0,
    weakestHub: Infinity,
    resumeWorst: 0,
    resumeFinal: Infinity,
    resumeJump: 0,
    interruptJump: 0,
  };

  for (let k = 0; k < PHASES; k++) {
    const rig = new Rig();
    /* Long enough for the hub to reach its steady pattern, then a different
       extra slice each time — together they cover two whole cycles of the
       slowest wheel, which kicks the hub about every fourteen seconds. */
    const warm = 45 + (k / PHASES) * 28;
    let v = 0;
    for (let t = 0; t < warm; t += DT) v = rig.step(false);

    /* The reader stops. */
    let t = 0;
    let prevV = v;
    while (rig.g.mode !== "rest" && t < 10) {
      const nv = rig.step(true);
      results.worstJump = Math.max(results.worstJump, Math.abs(nv - prevV));
      if (nv < -1e-12) results.backwards++;
      prevV = nv;
      t += DT;
    }
    results.slowest = Math.max(results.slowest, t);

    /* At rest: in a dwell, and nothing moves but the hub. */
    const at = rig.d.angle;
    if (!inDwell(at)) results.notDwell++;
    const c1 = solveTrain(at, TRAIN).stage1.cross;
    const c2 = solveTrain(at, TRAIN).stage2.cross;
    for (let s = 0; s < 20; s += DT) {
      rig.step(true);
      const sol = solveTrain(rig.d.angle, TRAIN);
      if (rig.d.angle !== at || sol.stage1.cross !== c1 || sol.stage2.cross !== c2) results.moved++;
      if (sol.stage1.engaged || sol.stage2.engaged) results.engagedAtRest++;
    }
    results.weakestHub = Math.min(results.weakestHub, Math.abs(rig.hub.rate) / TAU);

    /* The reader moves on: back to idle, smoothly, without reversing. */
    let pv = 0;
    let rt = 0;
    while (rt < RESUME + 0.5) {
      const nv = rig.step(false);
      results.resumeJump = Math.max(results.resumeJump, Math.abs(nv - pv));
      if (nv < pv - 1e-9 && rt < RESUME) results.resumeWorst++;
      pv = nv;
      rt += DT;
    }
    results.resumeFinal = Math.min(results.resumeFinal, pv / idle);

    /* A second reader changes their mind half way through stopping. */
    const r2 = new Rig();
    for (let s = 0; s < warm; s += DT) r2.step(false);
    let v2 = 0;
    let steps = 0;
    while (r2.g.mode === "run" || (r2.g.mode === "stop" && r2.g.t < r2.g.T / 2)) {
      v2 = r2.step(true);
      if (++steps > 600) break;
    }
    const after = r2.step(false);
    results.interruptJump = Math.max(results.interruptJump, Math.abs(after - v2));
  }

  check("the machine comes to rest within a few seconds", results.slowest < 4.5,
    `slowest of ${PHASES} stops took ${results.slowest.toFixed(2)}s`);
  check("...never turning backwards on the way", results.backwards === 0,
    `${results.backwards} backward frames`);
  check("...without a jump in speed", results.worstJump < idle * 0.03,
    `worst change in one frame ${((100 * results.worstJump) / idle).toFixed(2)}% of idle`);
  check("...and always in a dwell", results.notDwell === 0,
    `${PHASES - results.notDwell} of ${PHASES} rests with both wheels locked`);
  check("you cannot catch a wheel resting mid-step", results.engagedAtRest === 0,
    `${results.engagedAtRest} frames of rest with a pin in a slot`);
  check("everything else stays at rest", results.moved === 0,
    `${results.moved} frames of movement in 20s x ${PHASES}`);
  check("...and the last wheel keeps turning", results.weakestHub > 0.05,
    `slowest hub 20s into the rest: ${results.weakestHub.toFixed(3)} rev/s (${(results.weakestHub * 360).toFixed(0)} deg/s)`);
  check("it starts again when the reader moves on", results.resumeFinal > 0.999,
    `back to ${(100 * results.resumeFinal).toFixed(1)}% of idle ${RESUME + 0.5}s later`);
  check("...picking up smoothly, never faltering", results.resumeWorst === 0 && results.resumeJump < idle * 0.03,
    `worst change in one frame ${((100 * results.resumeJump) / idle).toFixed(2)}% of idle`);
  check("a stop interrupted half way picks up where it was", results.interruptJump < idle * 0.03,
    `speed changes ${((100 * results.interruptJump) / idle).toFixed(2)}% of idle at the handover`);
}

// ===========================================================================
// Running is untouched
// ===========================================================================
{
  /* The governor only acts when asked. A reader who never stops at the
     freewheel sees exactly the drive every other check was written against. */
  let a: Drive = { angle: 0, spin: 0 };
  let g: Governor = RUNNING;
  for (let t = 0; t < 10; t += DT) ({ g, d: a } = govern(g, a, DT, false, S));
  check("without a rest the drive just runs", g.mode === "run" && Math.abs(rateOf(a, S) - idle) < 1e-9,
    `${(a.angle / TAU).toFixed(2)} rev in 10s at ${S.idle} rev/s`);
}

// ===========================================================================
// ...and the page actually asks for it
// ===========================================================================
{
  /* Every check above is on the governor. None of them can see whether the
     site hands it the signal — and a refactor that dropped the argument would
     leave a page whose freewheel note promises a rest that never comes, with
     every test still passing. */
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  const canvas = read("../components/site/MachineCanvas.tsx");
  const hook = read("../components/site/useDocumentProgress.ts");
  const drive = read("../components/geneva/useDrive.ts");
  /* Through `resting`: the page's rest, held back until the build shown has
     caught up, so the drive never stops with the freewheel still sliding in. */
  check("the site's drive is governed",
    canvas.includes("SITE_DRIVE, resting)") &&
      canvas.includes("resting.current = (rest.current") &&
      drive.includes("govern("),
    "MachineCanvas passes the rest signal once the build has caught up; useDrive runs the governor");
  check("...by the reader stopping at the payoff",
    hook.includes("reading.current.payoff") && hook.includes("STILL_MS"),
    "rest = at the freewheel's note and still");
}

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
