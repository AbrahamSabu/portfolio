/**
 * The freewheel, checked as a clutch rather than as a drawing.
 *
 *   node lib/freewheel.test.mts
 *
 * A roller ramp is the one part of this machine that can be geometrically
 * perfect and still not work. Nothing retains the rollers — they sit in a
 * converging gap and are held by friction alone — so a cam profile that looks
 * entirely correct either grips or does not depending on a single angle, and
 * the picture is identical either way.
 *
 * So the checks are about force as much as shape: the wedge against the
 * friction cone, the roller against both surfaces through its whole travel, and
 * the hub against the one thing it exists to prove, which is that it keeps
 * going after the drive has stopped.
 */

import { anglesAt } from "./drive.ts";
import {
  camClearance,
  camOffset,
  camProfile,
  FREEWHEEL,
  frictionCone,
  gripMargin,
  HUB,
  isLocked,
  lockBearing,
  lockOffset,
  MU,
  releaseSlip,
  restHub,
  restingRadius,
  rollerAt,
  rollerCircle,
  rollerLift,
  rollRatio,
  stepHub,
  type FreewheelSpec,
} from "./freewheel.ts";
import { outputSense, reduction, TRAIN } from "./train.ts";

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

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

const S = FREEWHEEL;
const PROFILE = camProfile(S);

// ===========================================================================
// The inequality the component is
// ===========================================================================
{
  const cone = frictionCone(MU);
  check("the wedge sits inside the friction cone", S.wedge < cone,
    `${deg(S.wedge).toFixed(1)}° wedge, ${deg(cone).toFixed(1)}° cone at mu ${MU}`);

  const margin = gripMargin(S, MU);
  check("...with enough margin to survive a bad contact", margin > 1.6,
    `${margin.toFixed(2)}x`);

  /* And the counter-test, because "less than 11.4 degrees" is a check that a
     typo in the other direction passes trivially. A clutch cut at 14 must come
     out as not gripping. */
  const slack: FreewheelSpec = { ...S, wedge: (14 * Math.PI) / 180 };
  check("...and a shallower ramp would not grip", gripMargin(slack, MU) < 1,
    `14° wedge → ${gripMargin(slack, MU).toFixed(2)}x, slips under load`);

  /* Contamination is the realistic failure, not a design error: oil at the
     contact halves mu and the cone closes with it. */
  check("oiled, it would let go", gripMargin(S, 0.04) < 1,
    `mu 0.04 → ${gripMargin(S, 0.04).toFixed(2)}x — a freewheel that freewheels both ways`);
}

// ===========================================================================
// The geometry the inequality implies
// ===========================================================================
{
  const p = camOffset(S);
  const rc = rollerCircle(S);

  /* cos alpha = (p + rho)/(R - rho), inverted to build the cam. Check it
     round-trips rather than trusting the algebra in the comment. */
  const back = Math.acos((p + S.roller) / rc);
  check("the cam offset reproduces the wedge angle", Math.abs(back - S.wedge) < 1e-12,
    `${deg(back).toFixed(4)}° from p = ${p.toFixed(5)}`);

  check("the lock offset is (R - rho) sin alpha",
    Math.abs(lockOffset(S) - rc * Math.sin(S.wedge)) < 1e-12,
    `${lockOffset(S).toFixed(5)}`);

  /* The fact that surprises people, asserted so it stays true if the wedge is
     ever retuned: the roller barely moves outward at all. */
  const lift = rollerLift(S);
  check("the roller lifts almost nothing", lift < S.bore * 0.01,
    `${lift.toFixed(5)} on a ${S.bore} bore — ${((lift / S.bore) * 100).toFixed(2)}%`);
  check("...while sliding far enough to see", lockOffset(S) > lift * 15,
    `${lockOffset(S).toFixed(4)} along the flat against ${lift.toFixed(5)} out`);

  /* The star has to fit inside the race it runs in. */
  let maxR = 0;
  for (const [x, y] of PROFILE) maxR = Math.max(maxR, Math.hypot(x, y));
  check("the star clears the bore", maxR < S.bore,
    `cam peaks at ${maxR.toFixed(4)}, bore ${S.bore}`);
}

// ===========================================================================
// The roller against the metal, everywhere it goes
// ===========================================================================
{
  /* At the wedge it must touch both: on the bore, and on the cam. Touching one
     and not the other is a roller that rattles or a roller that is buried. */
  const locked = rollerAt(0, S, PROFILE);
  check("at lock the roller reaches the bore", locked.locked,
    `gap ${locked.gap.toExponential(1)}`);

  const cx = locked.radius * Math.cos(locked.bearing);
  const cy = locked.radius * Math.sin(locked.bearing);
  const seat = camClearance(cx, cy, S, PROFILE);
  check("...and is seated on the cam at the same instant", Math.abs(seat) < 1e-6,
    `${seat.toExponential(1)} of daylight under it`);

  check("...at the bearing the algebra puts it",
    Math.abs(locked.bearing - lockBearing(S)) < 1e-12,
    `${deg(locked.bearing).toFixed(2)}° from the cam normal`);

  /* Through the whole travel: never inside the cam, never through the race. */
  let worstCam = Infinity;
  let worstBore = Infinity;
  const N = 400;
  for (let k = 0; k <= N; k++) {
    const r = rollerAt((k / N) * releaseSlip(S), S, PROFILE);
    const x = r.radius * Math.cos(r.bearing);
    const y = r.radius * Math.sin(r.bearing);
    worstCam = Math.min(worstCam, camClearance(x, y, S, PROFILE));
    worstBore = Math.min(worstBore, r.radius + S.roller <= S.bore + 1e-9 ? 1 : -1);
  }
  check("the roller never fouls the cam", worstCam > -1e-6,
    `closest ${worstCam.toExponential(1)} over ${N} positions`);
  check("...and never leaves the race", worstBore > 0, "stays inside the bore throughout");

  /* Released, the gap has to be visible — this is the whole reason the pocket
     is cut, and a pocket that only clears by a thousandth is a seized clutch
     that happens to pass a contact check. */
  const free = rollerAt(releaseSlip(S), S, PROFILE);
  /* Judged against the bore, because "you can see it" is a fraction of the part
     you are looking at, not a fraction of the roller. Five percent of the bore
     is a few pixels at the size this figure is drawn — and the first pocket cut
     here cleared by a tenth of that, which is a seized clutch that passes every
     contact check in this file. */
  check("released, it drops clear by something you can see", free.gap > S.bore * 0.05,
    `${free.gap.toFixed(4)} — ${((free.gap / S.bore) * 100).toFixed(1)}% of the bore, ${(free.gap / rollerLift(S)).toFixed(0)}x the lift`);
  check("...and is not locked there", !free.locked, `gap ${free.gap.toFixed(4)}`);
}

// ===========================================================================
// One way, and only one
// ===========================================================================
{
  /* Rolling forward from the wedge must open the gap. If it closes it, the
     ramp is handed the wrong way and the clutch welds shut the first time the
     output gets ahead of its drive — which is the only thing it is for. */
  const step = releaseSlip(S) / 40;
  let monotone = true;
  let prev = -1;
  for (let k = 0; k <= 40; k++) {
    const g = rollerAt(k * step, S, PROFILE).gap;
    if (g < prev - 1e-9) monotone = false;
    prev = g;
  }
  check("overrun opens the wedge, never closes it", monotone,
    "gap grows monotonically from lock to pocket");

  /* Backwards is the backstop's job: behind the lock point the cam still rises,
     so a roller pushed that way jams harder instead of escaping. */
  const behind = restingRadius(lockBearing(S) - 0.01, S, PROFILE);
  check("behind the wedge it only jams harder", behind >= rollerCircle(S) - 1e-9,
    `still hard against the bore 0.57° back`);
}

// ===========================================================================
// The hub: what all of it is for
// ===========================================================================
{
  /* Driven in the clutch's own direction. A freewheel is handed, so a test
     that drives it forward on principle is testing a different part — which is
     how this one sat motionless through thirty indexes of a cross that was
     turning the other way. */
  check("the clutch is handed to the output it is on", HUB.sense === outputSense(TRAIN),
    `sense ${HUB.sense}, link ${TRAIN.link.toFixed(3)}`);

  const DRIVE = 2.0 * HUB.sense;
  let h = restHub();
  for (let k = 0; k < 400; k++) h = stepHub(h, DRIVE, 1 / 120, HUB);
  check("driven, the hub is its star exactly", Math.abs(h.rate - DRIVE) < 1e-12,
    `${h.rate.toFixed(6)} rad/s, slip ${h.slip.toExponential(1)}`);
  check("...and the clutch reports itself locked", isLocked(h), "slip at the wedge");

  /* Let go, and it does not stop. */
  const spun = h;
  let free = spun;
  for (let k = 0; k < 120; k++) free = stepHub(free, 0, 1 / 120, HUB);
  check("released, the hub keeps turning", Math.abs(free.rate) > 0.1,
    `${free.rate.toFixed(3)} rad/s one second after the drive stopped`);
  check("...and the clutch has let go", !isLocked(free),
    `slip ${deg(free.slip).toFixed(1)}° of ${deg(releaseSlip(S)).toFixed(1)}°`);

  /* It decays, it never reverses, and it never gets a push from nothing. */
  let prev = Math.abs(spun.rate);
  let monotone = true;
  let backwards = false;
  let g = spun;
  for (let k = 0; k < 2000; k++) {
    g = stepHub(g, 0, 1 / 120, HUB);
    if (Math.abs(g.rate) > prev + 1e-12) monotone = false;
    if (g.rate * HUB.sense < 0) backwards = true;
    prev = Math.abs(g.rate);
  }
  check("free, it only ever slows", monotone, "no step of the coast speeds up");
  check("it can never be driven backwards", !backwards,
    `after 16s: ${g.rate.toExponential(2)} rad/s, still its own way`);

  /* The coast is a time, not a frame count. */
  const coastTo = (hz: number) => {
    let x = restHub();
    for (let k = 0; k < hz; k++) x = stepHub(x, DRIVE, 1 / hz, HUB);
    for (let k = 0; k < hz * 4; k++) x = stepHub(x, 0, 1 / hz, HUB);
    return Math.abs(x.rate);
  };
  const a = coastTo(60);
  const b = coastTo(144);
  check("the coast lasts the same at 60Hz and 144Hz", Math.abs(a - b) < 1e-3,
    `${a.toFixed(4)} vs ${b.toFixed(4)} rad/s after four seconds`);

  /* 1/e after exactly `coast` seconds — the number in the spec is the number
     the hub actually obeys. */
  let e = restHub();
  for (let k = 0; k < 240; k++) e = stepHub(e, DRIVE, 1 / 240, HUB);
  const from = Math.abs(e.rate);
  for (let k = 0; k < HUB.coast * 240; k++) e = stepHub(e, 0, 1 / 240, HUB);
  const left = Math.abs(e.rate) / from;
  check("and it is the coast the spec claims", Math.abs(left - Math.exp(-1)) < 5e-3,
    `${left.toFixed(4)} of its speed after ${HUB.coast}s, want ${Math.exp(-1).toFixed(4)}`);
}

// ===========================================================================
// On the real output, not a made-up one
// ===========================================================================
{
  /* The star is stage 2's cross, which moves for about a fiftieth of the cycle.
     Everything above could be true and the hub still be dead on the page if the
     drive it is actually given never spins it up. */
  const dt = 1 / 120;
  const rate = 0.22 * TAU; // the machine's idle, from motion.ts
  let hub = restHub();
  let angle = 0;
  let last = anglesAt(0).cross2;

  let drivenFrames = 0;
  let coastingFrames = 0;
  let stillTurning = 0;
  let peakStar = 0;
  let peakHub = 0;

  const frames = Math.ceil((TAU * reduction(TRAIN)) / rate / dt);
  for (let k = 0; k < frames; k++) {
    angle += rate * dt;
    const cross = anglesAt(angle).cross2;
    const starRate = (cross - last) / dt;
    last = cross;
    hub = stepHub(hub, starRate, dt, HUB);
    peakStar = Math.max(peakStar, Math.abs(starRate));
    peakHub = Math.max(peakHub, Math.abs(hub.rate));
    /* Locked is not the same as carrying drive. With both the star and the hub
       at rest the rollers are sitting at their wedges and the clutch is fully
       engaged — correctly so — which counted the machine's opening seconds as
       "driven" and put the figure at 16.8%. Transmitting means engaged AND the
       star actually turning. */
    if (isLocked(hub) && Math.abs(starRate) > 1e-9) drivenFrames++;
    else if (!isLocked(hub)) {
      coastingFrames++;
      if (Math.abs(hub.rate) > 0.05) stillTurning++;
    }
  }

  check("the real drive actually spins the hub up", peakHub > 1,
    `peak ${peakHub.toFixed(2)} rad/s against the cross's ${peakStar.toFixed(2)}`);

  const drivenPct = (drivenFrames / frames) * 100;
  check("the hub is driven for a sliver and free for the rest", drivenPct < 4,
    `carrying drive ${drivenPct.toFixed(2)}% of a nine-turn cycle`);

  const alive = (stillTurning / coastingFrames) * 100;
  check("and it is still turning for most of the time it is alone", alive > 60,
    `moving for ${alive.toFixed(0)}% of the free time — the dwell is not a dead stop`);

  /* What the spring buys.
  
     Measured against the frames where the star is actually trying to drive —
     turning faster than the hub — and not against the whole index. Most of an
     index is not the clutch being slow: the hub is still running from the *last*
     kick, faster than the new one is starting up, and a Geneva starts from a
     dead stop. It stays free because it is ahead, which is the component
     working. Counting those frames as engagement lag put the figure at 77% and
     blamed the spring for the coast. */
  hub = restHub();
  angle = 0;
  last = anglesAt(0).cross2;
  let lagFrames = 0;
  let indexFrames = 0;
  let longestLag = 0;
  for (let k = 0; k < frames; k++) {
    angle += rate * dt;
    const cross = anglesAt(angle).cross2;
    const starRate = (cross - last) / dt;
    last = cross;
    const before = hub;
    hub = stepHub(hub, starRate, dt, HUB);
    if (Math.abs(starRate) > Math.abs(before.rate)) {
      indexFrames++;
      if (!isLocked(before)) lagFrames++;
      else if (lagFrames) {
        longestLag = Math.max(longestLag, lagFrames * dt);
        lagFrames = 0;
      }
    }
  }
  /* Seconds, not a share of the frames. The star only drives for about thirty
     frames in an entire nine-turn cycle, so a percentage of those is a number
     that moves when the sample does — and 37% of thirty frames is a twentieth
     of a second, which is the thing actually worth having a bound on. */
  check("the spring closes the clutch inside its own engage time",
    longestLag <= HUB.engage,
    `${(longestLag * 1000).toFixed(0)}ms to take up ${deg(releaseSlip(S)).toFixed(0)}°, budget ${(HUB.engage * 1000).toFixed(0)}ms`);
  check("...over an index that is itself barely longer", indexFrames * dt < 1,
    `${indexFrames} driving frames in the whole cycle, ${(indexFrames * dt).toFixed(2)}s of drive in ${(frames * dt).toFixed(0)}s`);

  /* The claim the section makes, stated as an assertion: the output moves
     while its own drive is stationary. */
  let both = 0;
  hub = restHub();
  angle = 0;
  last = anglesAt(0).cross2;
  for (let k = 0; k < frames; k++) {
    angle += rate * dt;
    const cross = anglesAt(angle).cross2;
    const starRate = (cross - last) / dt;
    last = cross;
    hub = stepHub(hub, starRate, dt, HUB);
    if (Math.abs(starRate) < 1e-9 && Math.abs(hub.rate) > 0.05) both++;
  }
  check("the output runs while its drive is dead still", both > frames * 0.4,
    `${((both / frames) * 100).toFixed(0)}% of the cycle: star stopped, hub turning`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
