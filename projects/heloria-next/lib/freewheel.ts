/**
 * The freewheel: the output can outrun its own drive.
 *
 * Everything upstream of here is about control — a Geneva exists to make a
 * shaft stop exactly when told and sit still until told again. This is the one
 * joint in the machine that gives that up on purpose. The slow cross snaps the
 * hub forward and lets go of it; the hub keeps turning on its own, slower and
 * slower, and the drive has no way to pull it back. It does not coast because
 * the drive is being kind to it. It coasts because it no longer needs it.
 *
 * ── Not a ratchet ────────────────────────────────────────────────────────────
 *
 * A pawl lived here once and read as a pinball flipper — a big sprung arm
 * slapping a cog, all gesture and no mechanism. A roller ramp does the same job
 * by wedging: each roller sits between a flat cam on the inner star and the
 * bore of the outer race, and the gap between them narrows in one direction
 * only. Drive it one way and the rollers are carried into the narrow end and
 * jam solid. Overrun it and they roll down into a relief pocket and spin free.
 * No clicking, no arm, nothing that moves except six cylinders shuttling a few
 * degrees back and forth.
 *
 * ── Why it grips at all ──────────────────────────────────────────────────────
 *
 * Nothing holds the rollers in. They are round, they sit in a converging gap,
 * and the only thing stopping them squirting back out is friction at the two
 * contacts. The wedge angle between the cam flat and the bore has to fall
 * inside the friction cone of both:
 *
 *     alpha <= phi1 + phi2,   phi = arctan(mu)
 *
 * Steel on hardened steel, dry, is mu around 0.1 — a cone of 5.7 degrees at
 * each contact, so 11.4 degrees of wedge before it lets go. This one is built
 * at 6, a margin of about 1.9. Wider and it slips under load, which for a clutch
 * is not degraded performance but no clutch at all. Narrower and it never
 * releases. The whole component is that one inequality, and `freewheel.test.mts`
 * checks it rather than trusting the number written here.
 *
 * The wedge angle falls out of the geometry exactly. A roller of radius `rho`
 * touching the bore internally has its centre at `R - rho`; touching the flat
 * puts that centre `rho` clear of it, at `p + rho` along the flat's normal. So
 *
 *     cos alpha = (p + rho) / (R - rho)
 *
 * and the roller's offset along the flat at lock is `(R - rho) sin alpha`.
 *
 * ── The part nobody expects ──────────────────────────────────────────────────
 *
 * The radial travel is nothing. At 6 degrees the roller lifts
 * `(R - rho)(1 - cos alpha)` — about a thousandth of the bore — between free
 * and locked. A freewheel does not release by dropping away from anything. It
 * releases by *sliding*: the roller rolls a few degrees around the bore into
 * the wide part, and that tangential movement is the whole of it. Which is why
 * the cam has a proper relief pocket cut into it. Without one the roller has
 * nowhere to go and the clutch is simply seized, and with one you can actually
 * watch it happen.
 *
 * ── Spoked, like the flywheel ────────────────────────────────────────────────
 *
 * The output hub is the only other wheel in the machine with holes cut through
 * it. That is deliberate: those are the two parts whose subject is stored
 * motion, one at each end. The flywheel is why the input can never quite stop;
 * the hub is why the output does not have to.
 */

import * as THREE from "three";

import { outputSense } from "./train.ts";

const TAU = Math.PI * 2;

export type FreewheelSpec = {
  /** rollers, and cam sectors — one each */
  rollers: number;
  /** bore of the outer race: the surface the rollers wedge against */
  bore: number;
  /** roller radius */
  roller: number;
  /** wedge angle at lock, radians — the number the whole thing lives or dies on */
  wedge: number;
  /** floor of the relief pocket, as a radius */
  pocket: number;
  /** how far past the lock point the cam flat runs, as a fraction of the roller */
  overrunFlat: number;
  /** where the roller comes to rest in the pocket, radians ahead of the cam normal */
  pocketRest: number;
};

/**
 * As built.
 *
 * Six rollers rather than eight: the cam flats are short — a roller clutch is
 * mostly relief — so fewer sectors means bigger scallops and bigger rollers,
 * and at the size this is looked at, legibility beats torque capacity for a
 * mechanism that transmits nothing.
 */
export const FREEWHEEL: FreewheelSpec = {
  rollers: 6,
  bore: 0.3,
  roller: 0.03,
  wedge: (6 * Math.PI) / 180,
  pocket: 0.205,
  overrunFlat: 0.6,
  pocketRest: (9 * Math.PI) / 180,
};

/** Coefficient of friction the grip margin is judged against: dry steel on steel. */
export const MU = 0.1;

/* ------------------------------------------------------------------ the wedge */

/** Half-angle of the friction cone at one contact. */
export const frictionAngle = (mu = MU) => Math.atan(mu);

/** The widest wedge two such contacts can hold. */
export const frictionCone = (mu = MU) => 2 * frictionAngle(mu);

/**
 * How much room the wedge has inside the friction cone.
 *
 * Above 1 it grips. The number matters as much as the sign: a clutch at 1.05 is
 * one contaminated contact away from being a bearing.
 */
export const gripMargin = (s: FreewheelSpec = FREEWHEEL, mu = MU) =>
  frictionCone(mu) / s.wedge;

/** Centre-circle radius of a roller touching the bore. */
export const rollerCircle = (s: FreewheelSpec = FREEWHEEL) => s.bore - s.roller;

/**
 * Perpendicular distance from the axis to a cam flat.
 *
 * Inverted from the wedge angle rather than chosen, because the wedge angle is
 * the thing with a constraint on it and this is merely how you build it.
 */
export const camOffset = (s: FreewheelSpec = FREEWHEEL) =>
  rollerCircle(s) * Math.cos(s.wedge) - s.roller;

/** Offset along the flat, from its closest point to the axis, at lock. */
export const lockOffset = (s: FreewheelSpec = FREEWHEEL) =>
  rollerCircle(s) * Math.sin(s.wedge);

/** How far the roller lifts between free and locked. Famously, almost nothing. */
export const rollerLift = (s: FreewheelSpec = FREEWHEEL) =>
  rollerCircle(s) * (1 - Math.cos(s.wedge));

/**
 * Bearing of the roller's centre at lock, measured from its cam's normal.
 *
 * Negative: the lock point sits *behind* the flat's high spot, so that rolling
 * forward — which is what an overrunning race does to a roller — carries it
 * toward the wide end and lets go. Put the lock in front instead and overrun
 * drives the roller harder into the wedge, which is a clutch that welds itself
 * shut the first time the output gets ahead.
 */
export const lockBearing = (s: FreewheelSpec = FREEWHEEL) => -s.wedge;

/* ------------------------------------------------------------------- the cam */

export type Pt = readonly [number, number];

/**
 * One sector of the inner star, in a frame where the cam's normal is +X.
 *
 * Runs from the backstop through the flat, over the crest, down into the relief
 * and back up to the next sector's backstop. Angles increase in the direction
 * the race overruns.
 */
function sector(s: FreewheelSpec, steps = 18): Pt[] {
  const p = camOffset(s);
  const lock = lockOffset(s);
  const pitch = TAU / s.rollers;

  /* The flat runs from behind the lock point — far enough back to give the
     roller a stop it cannot climb over — forward to the crest, where the flat
     is closest to the axis and the gap is widest. */
  const back = -lock - s.roller * s.overrunFlat;
  const pts: Pt[] = [
    [p, back],
    [p, 0],
  ];

  /* Relief: away from the crest the flat would start closing again and wedge
     the roller a second time, backwards. So it is cut away instead — starting
     *at* the crest, not somewhere past it. Starting past it leaves a chord
     between two points at the same radius, which bulges inward, and the gap
     then widens and narrows again on the way out. A clutch whose release is
     not monotonic can re-grip halfway through letting go. */
  const relief = 0;
  /* Down to the floor by the time the roller gets there, or "released" is a
     roller still sitting on the flat with three thousandths under it. */
  const pocketEnd = s.pocketRest * 1.3;
  const pocketFar = s.pocketRest + pitch * 0.4;
  const backBearing = Math.atan2(back, p);
  const rise = pitch + backBearing; // where the next sector's flat begins

  const polar = (bearing: number, radius: number): Pt => [
    radius * Math.cos(bearing),
    radius * Math.sin(bearing),
  ];

  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const bearing = relief + (pocketEnd - relief) * u;
    /* Smoothstep: leaves the crest tangentially so the roller rolls off rather
       than falls off an edge, and arrives at the floor the same way. Monotonic,
       which is the part that matters — see above. */
    const ease = u * u * (3 - 2 * u);
    pts.push(polar(bearing, p + (s.pocket - p) * ease));
  }
  pts.push(polar(pocketFar, s.pocket));
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const bearing = pocketFar + (rise - pocketFar) * u;
    pts.push(polar(bearing, s.pocket + (p - s.pocket) * u));
  }
  return pts;
}

/** The whole inner star, closed, in its own frame. */
export function camProfile(s: FreewheelSpec = FREEWHEEL, steps = 18): Pt[] {
  const pitch = TAU / s.rollers;
  const out: Pt[] = [];
  for (let i = 0; i < s.rollers; i++) {
    const a = i * pitch;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    for (const [x, y] of sector(s, steps)) out.push([x * c - y * sn, x * sn + y * c]);
  }
  return out;
}

/* --------------------------------------------------------------- the contact */

/** Distance from a point to a segment. */
function distToSeg(px: number, py: number, a: Pt, b: Pt) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const len = vx * vx + vy * vy;
  const t = len > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len)) : 0;
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return Math.hypot(dx, dy);
}

/** Unsigned closest approach from a point to the cam outline. */
export function distanceToCam(
  px: number,
  py: number,
  profile: readonly Pt[],
): number {
  let best = Infinity;
  for (let i = 0, j = profile.length - 1; i < profile.length; j = i++) {
    best = Math.min(best, distToSeg(px, py, profile[j], profile[i]));
  }
  return best;
}

/** Is the point in the metal? */
export function insideCam(px: number, py: number, profile: readonly Pt[]) {
  let hit = false;
  for (let i = 0, j = profile.length - 1; i < profile.length; j = i++) {
    const [xi, yi] = profile[i];
    const [xj, yj] = profile[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Clearance between a roller centred here and the cam: negative means fouling.
 *
 * Signed, and the sign is the whole point. Distance to the outline alone is
 * positive on both sides of the metal, so a roller centre buried under a cam
 * flat reads as comfortably clear — and the search below, which walks outward
 * until it finds clearance, would stop at the first place it never left.
 */
export function camClearance(
  px: number,
  py: number,
  s: FreewheelSpec,
  profile: readonly Pt[],
) {
  const d = distanceToCam(px, py, profile);
  return (insideCam(px, py, profile) ? -d : d) - s.roller;
}

/**
 * Where a roller comes to rest when it is pushed out at a given bearing.
 *
 * Solved against the profile rather than written down. The cam is a shape with
 * a flat, a crest and a pocket in it, and the roller's centre traces that
 * shape's offset curve at one roller radius — which has no closed form worth
 * having and, more to the point, would go quietly wrong the moment the pocket
 * is reshaped. Bisection on "how far out before it is exactly `roller` clear of
 * the metal" cannot.
 *
 * Clamped at the bore: past `R - rho` the race is in the way, and that clamp is
 * the lock.
 */
export function restingRadius(
  bearing: number,
  s: FreewheelSpec = FREEWHEEL,
  profile: readonly Pt[] = camProfile(s),
): number {
  const ceiling = rollerCircle(s);
  const clear = (r: number) =>
    camClearance(r * Math.cos(bearing), r * Math.sin(bearing), s, profile);
  if (clear(ceiling) < 0) return ceiling; // metal reaches the bore: hard locked

  let lo = 0; // the axis is inside the cam for every bearing
  let hi = ceiling;
  for (let k = 0; k < 44; k++) {
    const mid = (lo + hi) / 2;
    if (clear(mid) < 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

export type RollerState = {
  /** bearing of the roller's centre from its own cam normal */
  bearing: number;
  /** radius of that centre */
  radius: number;
  /** touching the bore, and therefore carrying the drive */
  locked: boolean;
  /** clearance between roller and bore; zero when locked */
  gap: number;
};

/**
 * How much the roller's bearing changes per unit of slip.
 *
 * A roller between a turning race and a stationary cam rolls on both, so its
 * centre travels at half the race's surface speed — the same reason a planet
 * in an epicyclic goes round at half the annulus. `R/2` of arc, at the centre's
 * own radius.
 */
export const rollRatio = (s: FreewheelSpec = FREEWHEEL) =>
  s.bore / (2 * rollerCircle(s));

/**
 * Relative rotation from locked to fully released.
 *
 * The roller's own travel is `pocketRest - lockBearing`, and the race has to
 * move about twice that to produce it. This is also, read backwards, the
 * engagement angle if nothing helped — which is what the spring is for.
 */
export const releaseSlip = (s: FreewheelSpec = FREEWHEEL) =>
  (s.pocketRest - lockBearing(s)) / rollRatio(s);

/**
 * The roller, given how far the race has run ahead of the star.
 *
 * `slip` is bounded, not an angle difference that grows forever. The rollers
 * are caged: once one has run down to the bottom of its pocket the race simply
 * passes over it, and no amount of further overrun moves it. Treat slip as
 * unbounded and the clutch has to unwind an entire coast before it can grip
 * again — the output would be visibly dragged for most of the next index.
 */
export function rollerAt(
  slip: number,
  s: FreewheelSpec = FREEWHEEL,
  profile: readonly Pt[] = camProfile(s),
): RollerState {
  const travel = Math.min(Math.max(0, slip), releaseSlip(s)) * rollRatio(s);
  const bearing = lockBearing(s) + travel;
  const radius = restingRadius(bearing, s, profile);
  const gap = rollerCircle(s) - radius;
  return { bearing, radius, locked: gap <= 1e-9, gap };
}

/* ------------------------------------------------------------- what it drives */

export type HubSpec = {
  /** seconds for the free hub's speed to fall to 1/e */
  coast: number;
  /** seconds for the spring to carry a fully released roller back to its wedge */
  engage: number;
  /**
   * The direction the clutch drives in: +1 or −1.
   *
   * A freewheel is a handed part. Built the wrong way round it does not run
   * backwards — it does nothing at all, because the drive that should wedge it
   * is the drive it releases on, and the hub simply never moves. Which is what
   * happened: the output crown is mounted teeth-down, so this machine's slow
   * cross runs negative, and a clutch that assumed forward sat there while the
   * cross snapped past it thirty times.
   */
  sense: 1 | -1;
};

/**
 * Slow, and quick to bite.
 *
 * The coast is the only thing on the page allowed to take its time, and one
 * that ends before the next index is a coast nobody sees finish. At 9 seconds
 * the hub is still visibly turning when the slow cross comes round again, which
 * is the entire point being made.
 *
 * Engagement is the opposite problem. Each roller is sprung toward its wedge,
 * and without that spring the clutch would have to close the whole release
 * angle on rolling contact alone — about 27 degrees of the star's index spent
 * taking up slack before the hub moved at all. The spring is why a freewheel
 * bites at once instead of after a quarter of a turn.
 */
export const HUB: HubSpec = { coast: 9, engage: 0.12, sense: outputSense() };

export type HubState = {
  /** hub angle, radians, unwrapped */
  angle: number;
  /** hub speed, radians per second */
  rate: number;
  /** roller position, 0 at the wedge out to `releaseSlip` at the pocket */
  slip: number;
};

export const restHub = (angle = 0): HubState => ({ angle, rate: 0, slip: 0 });

/** Is the clutch carrying drive? */
export const isLocked = (hub: HubState) => hub.slip <= 0;

/**
 * One step of the output.
 *
 * The clutch is the sign of `hub.slip`. While the star is turning faster it
 * closes that gap, wedges, and the hub simply *is* the star. The instant the
 * star falls behind — which for a Geneva is the instant its index ends, not
 * gradually — the rollers run down their ramps and nothing downstream can
 * reach the hub at all.
 *
 * Decay is `exp(-dt/tau)` rather than a per-frame multiplier, so the coast
 * lasts the same nine seconds at 144Hz as at 60.
 */
export function stepHub(
  hub: HubState,
  starRate: number,
  dt: number,
  spec: HubSpec = HUB,
  fw: FreewheelSpec = FREEWHEEL,
): HubState {
  /* Worked in the clutch's own hand, so everything below reads as "forward",
     then handed back at the end. Sprinkling the sense through the comparisons
     instead is how a clutch ends up driving on the wrong edge. */
  const s = spec.sense;
  const star = s * starRate;
  const coasted = s * hub.rate * Math.exp(-dt / spec.coast);
  const full = releaseSlip(fw);

  /* Rolling opens the gap; the spring closes it. Whichever is happening, the
     roller cannot go past its wedge or off the end of its pocket. */
  const rolled = (coasted - star) * dt;
  const sprung = star > coasted ? -(full / spec.engage) * dt : 0;
  const slip = Math.min(full, Math.max(0, hub.slip + rolled + sprung));

  if (slip <= 0) {
    return { angle: hub.angle + starRate * dt, rate: starRate, slip: 0 };
  }
  const rate = s * coasted;
  return { angle: hub.angle + rate * dt, rate, slip };
}

/* ------------------------------------------------------------- the solid parts */

/** Outer radius of the race ring the rollers run in. */
export const raceOuter = (s: FreewheelSpec = FREEWHEEL) => s.bore * 1.15;

/**
 * Outer radius of the hub carried on that race.
 *
 * Deliberately the largest wheel in the machine. It is where the whole train
 * arrives and the only part that keeps going once the rest has stopped — and
 * it was a modest ring at the far end, smaller than the cross driving it, so
 * the eye finished on the mechanism rather than on its point.
 */
export const hubOuter = (s: FreewheelSpec = FREEWHEEL) => s.bore * 2.45;

/**
 * Where the six rollers sit, in the star's own frame.
 *
 * In the star's frame, because that is where they live: the cage is on the
 * star side, so a roller stays with its own cam sector and shuttles a few
 * degrees inside it. Put the rollers in a frame of their own and they drift
 * out of their pockets over a cycle — the cam would rotate away and leave them
 * behind, which is a bearing coming apart rather than a clutch releasing.
 */
export function rollerPlacements(
  slip: number,
  s: FreewheelSpec = FREEWHEEL,
  profile: readonly Pt[] = camProfile(s),
): { x: number; y: number; bearing: number }[] {
  const r = rollerAt(slip, s, profile);
  const pitch = TAU / s.rollers;
  return Array.from({ length: s.rollers }, (_, i) => {
    const a = i * pitch + r.bearing;
    return { x: r.radius * Math.cos(a), y: r.radius * Math.sin(a), bearing: a };
  });
}

/**
 * The inner star, as a profile with a bore through it.
 *
 * `camProfile` is already the outline; this is only it closed around a shaft
 * hole. The hole matters more than it looks: the star is keyed to stage 2's
 * cross, and a star drawn solid reads as a cam on nothing.
 */
export function starShape(s: FreewheelSpec = FREEWHEEL, bore = 0.055): THREE.Shape {
  const shape = new THREE.Shape();
  const pts = camProfile(s);
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore, 0, TAU, true);
  shape.holes.push(hole);
  return shape;
}

/**
 * The outer member: the part that leaves.
 *
 * A ring on the rollers' bore, lightened with arc slots so that it reads as
 * turning. That is not decoration — this wheel spends most of its life coasting
 * with nothing driving it, and a plain annulus at constant speed is invisible.
 * It is the same argument as the flywheel's spokes, at the other end of the
 * machine and for the opposite reason: one of them can never stop and the other
 * does not have to.
 */
export function hubShape(
  s: FreewheelSpec = FREEWHEEL,
  slots = 6,
): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, hubOuter(s), 0, TAU, false);

  const bore = new THREE.Path();
  bore.absarc(0, 0, s.bore, 0, TAU, true);
  shape.holes.push(bore);

  const inner = s.bore * 1.08;
  const outer = hubOuter(s) * 0.86;
  if (inner >= outer) {
    throw new Error(
      `freewheel hub has no web to lighten: ${inner.toFixed(3)} >= ${outer.toFixed(3)}`,
    );
  }
  const half = ((TAU / slots) * 0.52) / 2;
  for (let i = 0; i < slots; i++) {
    const c = (i / slots) * TAU + TAU / (slots * 2);
    const slot = new THREE.Path();
    slot.absarc(0, 0, inner, c - half, c + half, false);
    slot.absarc(0, 0, outer, c + half, c - half, true);
    slot.closePath();
    shape.holes.push(slot);
  }
  return shape;
}
