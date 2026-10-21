/**
 * How the machine is driven: momentum, not a mapping.
 *
 * ── Why not map scroll straight to an angle ──────────────────────────────────
 *
 * The obvious binding is `angle = scrollTop × k`. It is also wrong for this
 * mechanism, for three reasons:
 *
 *   The machine stops dead when you stop. A Geneva's whole character is a
 *   violent index bracketed by stillness, and you cannot see that if the input
 *   only moves while a finger is moving.
 *
 *   Scroll arrives in lumps. A wheel notch is a single large delta, a trackpad
 *   is a burst of tiny ones, and a phone fling is a decaying curve someone
 *   else already tuned. Mapped directly, the same gesture gives three different
 *   motions and all of them stutter.
 *
 *   There is a flywheel in the model. A flywheel that does not store anything
 *   is a decoration, and the one part whose entire job is to make stopping
 *   difficult should be the part that makes stopping difficult.
 *
 * So the input shaft carries angular velocity. It idles forward on its own, a
 * scroll adds an impulse to it, and the impulse decays. The machine follows the
 * page rather than being driven by it.
 *
 * ── Frame-rate independence ──────────────────────────────────────────────────
 *
 * Every decay here is `exp(-dt/τ)`, never `v *= 0.9`. The second form is a
 * different machine at 144Hz than at 60Hz, which means the feel someone tuned
 * on their own screen is not the feel anyone else gets. There is a test for it.
 */

export type Drive = {
  /** input angle, radians, unwrapped */
  angle: number;
  /** the decaying part of the velocity, radians per second */
  spin: number;
  /**
   * The shove the reader has given it, not yet taken up by the shaft.
   *
   * Only meaningful when the spec has `inertia`; without it the shove goes
   * straight into `spin`, as it always did.
   */
  kick?: number;
};

export type DriveSpec = {
  /** revolutions per second the machine turns at when left alone */
  idle: number;
  /** radians per second added per pixel of scroll */
  gain: number;
  /** seconds for an impulse to fall to 1/e */
  decay: number;
  /** ceiling on the boost, so a fling cannot blur the whole thing */
  ceiling: number;
  /**
   * Seconds for the shaft to take up a shove — the flywheel.
   *
   * Absent or zero, a scroll impulse lands on the shaft instantly and decays
   * over `decay`: the speed jumps and then eases off. That is half a flywheel.
   * A heavy wheel resists being sped up exactly as much as it resists being
   * slowed down, so with inertia the shove goes into `kick` and the shaft
   * chases it: the speed rises gradually, peaks well below the shove, and
   * falls away slowly.
   */
  inertia?: number;
};

/**
 * Tuned against the mechanism rather than by taste.
 *
 * At 0.22 rev/s a four-slot index takes about 1.1 seconds and the dwell either
 * side of it about 3.4 — long enough that the stillness registers as stillness,
 * short enough that nobody waits. The slow stage then moves once every thirteen
 * seconds, which is the rhythm the whole machine exists to produce.
 *
 * The ceiling is four times idle. Past that the index is over inside two frames
 * and the snap, which is the point of the thing, is not visible at all.
 *
 * ── Letting it stop ──────────────────────────────────────────────────────────
 *
 * The idle above is added unconditionally, which means this machine could never
 * come to rest — and the single most important thing it has to say is that its
 * last wheel keeps turning after everything driving it has stopped. That claim
 * was unwitnessable: nothing ever stopped, so there was nothing to keep turning
 * after. It was an assertion in a paragraph rather than something a reader
 * could watch happen.
 *
 * So the idle is scaleable. The caller decides how much of it applies, which
 * lets a story wind the drive down where the point of the story is that it
 * winds down. Everywhere else the scale is 1 and this behaves exactly as it
 * did — the original argument for an idle, that a mechanism which only moves
 * while a finger moves cannot show a dwell, is untouched.
 */
export const DRIVE: DriveSpec = {
  idle: 0.22,
  gain: 0.011,
  decay: 0.85,
  ceiling: 0.22 * 2 * Math.PI * 4,
};

/**
 * The site's drive: the same machine, with the flywheel doing its job.
 *
 * The page prints a claim beside the flywheel — scroll as hard as you like, it
 * will barely notice — and with `DRIVE` that claim was false: a hard scroll put
 * the whole train at five times its idle speed within a frame. A claim a
 * reader is invited to test has to survive the test, so rather than soften
 * the sentence the machine got the property the sentence describes.
 *
 * The ceiling is a quarter of idle, and the shaft only reaches part of that,
 * because it lags the shove: the most violent scroll there is makes the
 * machine surge by something under a quarter, over most of a second, and let
 * go over several. `motion.test.mts` holds it to that.
 *
 * The workbench keeps `DRIVE`. Whipping the machine up to see the Geneva snap
 * at speed is what a workbench is for.
 */
export const SITE_DRIVE: DriveSpec = {
  idle: DRIVE.idle,
  gain: 0.0016,
  decay: 0.6,
  ceiling: DRIVE.idle * 2 * Math.PI * 0.25,
  inertia: 1.1,
};

export const idleRate = (s: DriveSpec = DRIVE) => s.idle * Math.PI * 2;

/** Add a scroll impulse. Positive delta drives the machine forward. */
export function push(d: Drive, deltaPx: number, s: DriveSpec = DRIVE): Drive {
  const clamp = (v: number) => Math.max(-s.ceiling, Math.min(s.ceiling, v));
  /* With a flywheel the shove is stored, not applied: the shaft takes it up
     over `inertia` seconds in `step`. */
  if (s.inertia) return { ...d, kick: clamp((d.kick ?? 0) + deltaPx * s.gain) };
  return { angle: d.angle, spin: clamp(d.spin + deltaPx * s.gain) };
}

/**
 * Advance by `dt` seconds.
 *
 * The angle integrates the *average* velocity across the step rather than its
 * value at either end. Over a 0.85s decay sampled at 60Hz the difference is
 * small; over a dropped frame of 200ms it is not, and a machine that loses
 * ground whenever the tab stutters drifts out of step with the page.
 */
export function step(
  d: Drive,
  dt: number,
  s: DriveSpec = DRIVE,
  /** how much of the idle applies: 1 normally, 0 to let the machine stop */
  idleScale = 1,
): Drive {
  if (!(dt > 0)) return d;
  if (s.inertia) return stepInertial(d, dt, s, idleScale);
  const k = Math.exp(-dt / s.decay);
  const spinEnd = d.spin * k;
  /* ∫ spin·e^(−t/τ) dt over the step, divided by dt: the exact mean. */
  const meanSpin = dt > 1e-9 ? (d.spin - spinEnd) * (s.decay / dt) : d.spin;
  const idle = idleRate(s) * Math.min(1, Math.max(0, idleScale));
  return {
    angle: d.angle + (idle + meanSpin) * dt,
    spin: spinEnd,
  };
}

/**
 * A step with the flywheel in it, integrated exactly.
 *
 * Two first-order lags in series: the shove decays over `decay`, and the shaft
 * relaxes towards it over `inertia`. Linear, so the solution over a step is
 * closed-form and there is no frame-rate dependence to tune away — the same
 * reason the plain step integrates its mean velocity rather than sampling it.
 *
 *   kick(t) = K e^(−t/τk)
 *   spin(t) = S e^(−t/τi) + K·τk/(τk−τi)·(e^(−t/τk) − e^(−t/τi))
 */
function stepInertial(d: Drive, dt: number, s: DriveSpec, idleScale: number): Drive {
  const tk = s.decay;
  /* Nudged apart when equal: the closed form divides by their difference, and
     the limit is well behaved, so a hair's offset is indistinguishable. */
  const ti = Math.abs(s.inertia! - tk) < 1e-6 ? s.inertia! + 1e-4 : s.inertia!;
  const K = d.kick ?? 0;
  const S = d.spin;
  const ek = Math.exp(-dt / tk);
  const ei = Math.exp(-dt / ti);
  const c = tk / (tk - ti);

  const spinEnd = S * ei + K * c * (ek - ei);
  /* ∫ spin dt over the step. */
  const travelled = S * ti * (1 - ei) + K * c * (tk * (1 - ek) - ti * (1 - ei));
  const idle = idleRate(s) * Math.min(1, Math.max(0, idleScale));
  return {
    angle: d.angle + idle * dt + travelled,
    spin: spinEnd,
    kick: K * ek,
  };
}

/** Velocity right now, for a readout. */
export const rateOf = (d: Drive, s: DriveSpec = DRIVE, idleScale = 1) =>
  idleRate(s) * Math.min(1, Math.max(0, idleScale)) + d.spin;

/**
 * A step for someone who has asked for less motion.
 *
 * Not "hold still": a stopped mechanism says nothing about a mechanism. It
 * advances at a fraction of idle and ignores scroll entirely, so the machine
 * still demonstrates itself without anything moving quickly or reacting to the
 * page under the reader.
 */
export function stepCalm(d: Drive, dt: number, s: DriveSpec = DRIVE): Drive {
  if (!(dt > 0)) return d;
  return { angle: d.angle + idleRate(s) * 0.22 * dt, spin: 0 };
}
