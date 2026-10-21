/**
 * External Geneva drive — kinematics.
 *
 * No geometry, no rendering, no three.js. Just the angle relationship, so it
 * can be tested on its own. If this is wrong, nothing downstream can rescue it.
 *
 * ── The mechanism ────────────────────────────────────────────────────────────
 *
 * A driver wheel carries a single crank pin. A driven wheel (the "Maltese
 * cross") has n radial slots. Once per driver revolution the pin enters a slot,
 * sweeps the cross through exactly one station, and leaves. For the rest of the
 * revolution a locking disc on the driver sits in a matching crescent on the
 * cross and holds it rigid — the cross *cannot* move, by geometry, not by
 * friction.
 *
 * ── The layout ───────────────────────────────────────────────────────────────
 *
 * Put the driver centre at the origin and the cross centre at (c, 0). For the
 * pin to enter the slot cleanly it must cross the slot's centreline at the
 * moment the crank arm and the slot are perpendicular — the triangle
 * driver-pin-cross has its right angle at the pin. That single requirement
 * fixes every dimension:
 *
 *     crank radius      a = c · sin(π/n)
 *     cross slot radius b = c · cos(π/n)
 *
 * For n = 4 both come out at c·0.7071 — on a four-slot Geneva the crank radius
 * and the slot radius are the same length, which is a pleasing accident and a
 * useful sanity check when drawing it.
 *
 * ── The motion ───────────────────────────────────────────────────────────────
 *
 * With the driver at angle θ measured from the line of centres, the pin sits at
 * (a·cosθ, a·sinθ). The slot must point at the pin, so the cross angle is the
 * bearing of the pin as seen from the cross centre:
 *
 *     φ(θ) = atan2( a·sinθ , c − a·cosθ )
 *
 * Engagement runs over θ ∈ [−θ₀, +θ₀] where θ₀ = π/2 − π/n. For n = 4 that is
 * ±45°: the driver spends 90° of its revolution indexing and 270° locked.
 *
 * ── Sense of rotation ────────────────────────────────────────────────────────
 *
 * An external Geneva's cross turns *against* its driver. That falls out of the
 * formula above and is easy to lose: φ is written with (c − a·cosθ) rather than
 * (a·cosθ − c), so it is a bearing in a mirrored frame, and taking it as the
 * cross's rotation directly makes the cross co-rotate. Using it unnegated, the
 * pin still lands exactly on a slot at entry, mid-index and exit — the three
 * instants anyone checks — while drifting up to 14° off the slot centreline in
 * between. The cross angle returned here is therefore the negated bearing, and
 * decreases as the driver advances.
 *
 * ── Why it snaps ─────────────────────────────────────────────────────────────
 *
 * Differentiating,
 *
 *     dφ/dθ = (a·c·cosθ − a²) / (c² − 2·a·c·cosθ + a²)
 *
 * At entry and exit, cosθ₀ = a/c, so the numerator is a·c·(a/c) − a² = 0. The
 * cross starts and finishes each index at *zero angular velocity*, and peaks in
 * the middle. That is the whole character of the mechanism: it is not a jerk,
 * it is a violent, perfectly smooth S-curve bracketed by absolute stillness.
 * Nothing eased by hand looks like this, which is exactly why it is worth
 * deriving rather than approximating.
 */

export type GenevaSpec = {
  /** number of slots in the cross */
  slots: number;
  /** distance between the two centres */
  centres: number;
};

export type GenevaState = {
  /** driver angle, radians, unwrapped — what the caller set */
  driver: number;
  /**
   * Crank angle measured from the line of centres, −π..π, 0 = mid-index.
   *
   * This is the angle the geometry is actually expressed in, and it is offset
   * from `driver` by π because of the phasing above. A renderer must draw the
   * crank at `theta`, not at `driver`: using `driver` puts the pin 180° out,
   * parked inside the cross during the dwell instead of clear of it.
   */
  theta: number;
  /**
   * Cross angle, radians, unwrapped. Negative-going: an external Geneva's
   * driven wheel turns against its driver, so this decreases as `driver` rises.
   */
  cross: number;
  /** true while the pin is in a slot */
  engaged: boolean;
  /** 0 at the start of an index, 1 at the end; NaN while locked */
  progress: number;
  /** completed indexes since driver = 0 */
  station: number;
  /** dφ/dθ — 0 at entry and exit, peak mid-index */
  ratio: number;
  /**
   * Distance from the pin to the cross's centre — how far down the slot it is.
   *
   * Runs b → (c − a) → b across an index: the pin dives to the slot root at
   * mid-index and comes back out. A roller on the pin rolls along the slot wall
   * by exactly this much, which is what `roll` is.
   */
  reach: number;
  /**
   * Roller angle, radians, for a follower of radius 1. Multiply by 1/r.
   *
   * Zero at entry and exit — the roller rolls in and back out over the same
   * arc — and reversing at mid-index, which is not a cheat: that is the instant
   * the pin stops pushing the slot's trailing wall and starts holding back its
   * leading one, so a real roller reverses there too.
   */
  roll: number;
};

export const crankRadius = (s: GenevaSpec) =>
  s.centres * Math.sin(Math.PI / s.slots);

export const slotRadius = (s: GenevaSpec) =>
  s.centres * Math.cos(Math.PI / s.slots);

/** Half the driver sweep during one index: θ₀ = π/2 − π/n. */
export const engageHalfAngle = (s: GenevaSpec) =>
  Math.PI / 2 - Math.PI / s.slots;

/**
 * Cross bearing of the pin, for a driver angle measured from the centres.
 *
 * Exported because anything driven *by* the cross has to be able to invert it.
 * The cross does not sweep its station linearly — it crawls at the ends and
 * bolts through the middle — so "two thirds of the way through the window" and
 * "two thirds of the way through the time" are different numbers, and assuming
 * otherwise is good for a factor of two.
 */
export function crossBearing(theta: number, s: GenevaSpec) {
  return crossAngle(theta, s);
}

function crossAngle(theta: number, s: GenevaSpec) {
  const a = crankRadius(s);
  return Math.atan2(a * Math.sin(theta), s.centres - a * Math.cos(theta));
}

/** dφ/dθ at a driver angle. Zero at the ends of engagement. */
function crossRatio(theta: number, s: GenevaSpec) {
  const a = crankRadius(s);
  const c = s.centres;
  const num = a * c * Math.cos(theta) - a * a;
  const den = c * c - 2 * a * c * Math.cos(theta) + a * a;
  return num / den;
}

const TAU = Math.PI * 2;

/**
 * Solve the mechanism for an absolute driver angle.
 *
 * `driver` is unwrapped and may be any real number, negative included — the
 * caller drives it from scroll or from a clock and should never have to think
 * about winding. The cross angle returned is likewise unwrapped and monotonic,
 * so a renderer can assign it straight to a rotation without unwrap artefacts.
 */
export function solve(driver: number, spec: GenevaSpec): GenevaState {
  const step = TAU / spec.slots; // cross advance per index
  const theta0 = engageHalfAngle(spec);

  /* Phase the cycle so that engagements are centred on driver = π + k·2π, and
     the mechanism therefore *rests* at driver = 0.

     The obvious alternative — centring engagement on driver = 0 and taking
     `Math.floor(driver / 2π)` for the revolution count — is wrong at the seam,
     and wrong by a whole station. The engagement window straddles the wrap
     point, so the half of it lying just below k·2π belongs to index k while
     `floor` attributes it to k−1: the cross jumped 90° backwards every
     revolution. Phasing by π puts the whole window inside one revolution and
     the seam in the middle of the dwell, where nothing is moving. */
  const k = Math.round((driver - Math.PI) / TAU);
  const theta = driver - Math.PI - k * TAU; // −π .. π, 0 = mid-index

  const engaged = Math.abs(theta) <= theta0;

  let station: number;
  let cross: number;
  let progress: number;
  let ratio: number;

  if (engaged) {
    /* Negated: the cross counter-rotates. crossAngle runs −step/2 .. +step/2
       across the window, so with the half-step offset the ends land exactly on
       station k and station k+1, and `cross` sweeps one step *negative*. */
    cross = -(k * step + step / 2 + crossAngle(theta, spec));
    station = k;
    progress = (theta + theta0) / (2 * theta0);
    ratio = crossRatio(theta, spec);
  } else {
    station = theta > theta0 ? k + 1 : k;
    cross = -station * step;
    progress = Number.NaN;
    ratio = 0;
  }

  /* How far down the slot the pin is, by the cosine rule on the triangle
     driver-pin-cross. b at the mouth, (c − a) at the root. */
  const a = crankRadius(spec);
  const c = spec.centres;
  const reach = Math.sqrt(c * c + a * a - 2 * a * c * Math.cos(theta));
  const roll = engaged ? -(reach - slotRadius(spec)) : 0;

  return { driver, theta, cross, engaged, progress, station, ratio, reach, roll };
}

/** Fraction of a driver revolution spent indexing. 0.25 for a four-slot. */
export const dutyCycle = (s: GenevaSpec) => (2 * engageHalfAngle(s)) / TAU;
