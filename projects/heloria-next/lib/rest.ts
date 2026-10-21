/**
 * Bringing the machine to rest, and starting it again.
 *
 * ── What this is for ─────────────────────────────────────────────────────────
 *
 * The last part to go in is a freewheel, and the one thing it can show that no
 * other part can is a wheel that keeps turning after everything driving it has
 * stopped. A machine that idles forever can never show that — nothing ever
 * stops, so there is nothing to keep going after. So when the reader stops at
 * the freewheel's note, the drive winds down, and when they move on, it starts
 * again: the last three sections are read against a machine that is running.
 *
 * An event, not a position. The first version wound the idle down as a
 * function of how far down the page the reader was, which gets the payoff
 * right and then leaves the machine dead for everything below it.
 *
 * ── It stops in a dwell ──────────────────────────────────────────────────────
 *
 * Section three invites the reader to catch the first Geneva resting mid-step
 * and promises they cannot. A drive that stopped wherever it happened to be
 * would break that promise one time in four. So a stop is planned: it finds
 * the first input angle, far enough ahead to stop gently, at which both
 * slotted wheels are locked with margin either side, and decelerates onto it
 * exactly — constant deceleration, so the motion slows smoothly, never
 * reverses, and lands on the angle rather than near it.
 *
 * ── It starts smoothly ───────────────────────────────────────────────────────
 *
 * Starting again ramps the idle back up from wherever the drive is — rest, or
 * part way through a stop the reader interrupted by scrolling on — so the
 * speed is continuous through every change of mind.
 */

import { idleRate, rateOf, step, type Drive, type DriveSpec } from "./motion.ts";
import { TRAIN, solveTrain, type TrainSpec } from "./train.ts";

/** Seconds of stopping, at least. Anything shorter reads as braking. */
export const STOP_MIN = 1.3;
/** Seconds for the idle to come back. */
export const RESUME = 1.6;
/**
 * How far either side of the resting angle both wheels must be locked, in
 * degrees of the first stage's driver.
 *
 * Margin, not just "not engaged at this exact angle": a pin resting a hair
 * short of the slot mouth is locked in the arithmetic and looks, to anyone
 * watching, like a mechanism frozen on the point of moving.
 */
export const MARGIN_DEG = 8;

export type Governor =
  | { mode: "run" }
  | { mode: "stop"; from: number; rate: number; to: number; T: number; t: number }
  | { mode: "rest"; at: number }
  | { mode: "resume"; t: number; s0: number };

export const RUNNING: Governor = { mode: "run" };

/** Input radians per radian of the first stage's driver. */
function inputPerDriver(spec: TrainSpec) {
  const a = solveTrain(0, spec).stage1.theta;
  const b = solveTrain(1, spec).stage1.theta;
  return 1 / Math.abs(b - a);
}

/** Is the machine at rest-worthy at this input angle: both wheels locked, with margin? */
export function inDwell(angle: number, spec: TrainSpec = TRAIN) {
  const m = ((MARGIN_DEG * Math.PI) / 180) * inputPerDriver(spec);
  const here = solveTrain(angle, spec);
  if (here.stage1.engaged || here.stage2.engaged) return false;
  for (const k of [-1, -0.5, 0.5, 1]) {
    const s = solveTrain(angle + k * m, spec);
    if (s.stage1.engaged || s.stage2.engaged) return false;
    /* Belt and braces: the wheels have not moved across the margin either. */
    if (Math.abs(s.stage1.cross - here.stage1.cross) > 1e-9) return false;
    if (Math.abs(s.stage2.cross - here.stage2.cross) > 1e-9) return false;
  }
  return true;
}

/**
 * The first input angle at or after `angle` where the machine can rest.
 *
 * A scan, because the dwell pattern of two Genevas in series has no tidy
 * closed form, and at a microsecond a solve a scan fine enough to land within
 * a hair of the true edge costs less than a frame.
 */
export function dwellAfter(angle: number, spec: TrainSpec = TRAIN) {
  const stepSize = 0.004;
  /* Two full revolutions of the first driver is always enough: the first
     wheel dwells for three quarters of every one of them. */
  const limit = angle + 2 * Math.PI * 2 * inputPerDriver(spec);
  for (let a = angle; a <= limit; a += stepSize) if (inDwell(a, spec)) return a;
  return angle;
}

const smooth = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

/** Plan a stop from where the drive is and how fast it is going. */
function plan(d: Drive, spec: DriveSpec): Governor {
  /* Never plan from a crawl: a near-zero rate would ask for an enormous
     stopping time. Below a quarter of idle the stop is planned as if from a
     quarter of idle, which only makes it a little brisker. */
  const rate = Math.max(rateOf(d, spec), idleRate(spec) * 0.25);
  const to = dwellAfter(d.angle + (rate * STOP_MIN) / 2);
  const T = (2 * (to - d.angle)) / rate;
  return { mode: "stop", from: d.angle, rate, to, T, t: 0 };
}

/**
 * One step of the drive, with the governor in charge.
 *
 * `wantRest` is the page's opinion, read fresh each frame: the reader is at
 * the freewheel's note and has stopped scrolling. Everything else — when the
 * stop starts, where it lands, how it recovers — is decided here.
 */
export function govern(
  g: Governor,
  d: Drive,
  dt: number,
  wantRest: boolean,
  spec: DriveSpec,
): { g: Governor; d: Drive } {
  switch (g.mode) {
    case "run": {
      if (wantRest) return govern(plan(d, spec), { angle: d.angle, spin: 0, kick: 0 }, dt, true, spec);
      return { g, d: step(d, dt, spec, 1) };
    }

    case "stop": {
      const t = g.t + dt;
      const v = g.rate * Math.max(0, 1 - g.t / g.T);
      if (!wantRest) {
        /* Scrolled on part way through: pick the idle up from exactly the
           speed the stop had got down to. */
        return govern({ mode: "resume", t: 0, s0: v / idleRate(spec) }, { angle: d.angle, spin: 0, kick: 0 }, dt, false, spec);
      }
      if (t >= g.T) return { g: { mode: "rest", at: g.to }, d: { angle: g.to, spin: 0, kick: 0 } };
      const angle = g.from + g.rate * t - (g.rate * t * t) / (2 * g.T);
      return { g: { ...g, t }, d: { angle, spin: 0, kick: 0 } };
    }

    case "rest": {
      if (!wantRest) return govern({ mode: "resume", t: 0, s0: 0 }, { angle: g.at, spin: 0, kick: 0 }, dt, false, spec);
      return { g, d: { angle: g.at, spin: 0, kick: 0 } };
    }

    case "resume": {
      if (wantRest) return govern(RUNNING, d, dt, true, spec);
      const t = g.t + dt;
      /* The scale at the middle of the step, so a long frame does not jump
         the speed — the same reason every other step here integrates rather
         than samples. */
      const scale = g.s0 + (1 - g.s0) * smooth((g.t + dt / 2) / RESUME);
      const next = step(d, dt, spec, scale);
      return { g: t >= RESUME ? RUNNING : { ...g, t }, d: next };
    }
  }
}
