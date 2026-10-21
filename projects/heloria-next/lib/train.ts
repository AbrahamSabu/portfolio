/**
 * The train: two Geneva drives in series, and the things hung off them.
 *
 * Stage 1 is the mechanism from `geneva.ts`. Stage 2's driver is bolted to
 * stage 1's cross, so it does not turn continuously — it advances in 90° jumps,
 * once per revolution of the input, and sits dead in between.
 *
 * ── Why the second stage has three slots ─────────────────────────────────────
 *
 * A Geneva's driver has to sweep its *entire* engagement window in one go.
 * Enter it and stop halfway and you have parked a pin inside a slot: the
 * mechanism is neither locked nor indexing, and nothing can move it out.
 *
 * Stage 2's driver only gets one jump of 360/n₁ degrees at a time — 90° here —
 * so its window has to be narrower than that, with room at both ends for the
 * jump to start and finish outside it. The window is 2(π/2 − π/n), which gives:
 *
 *     n₂ = 5   108°   wider than the jump; an index can never finish
 *     n₂ = 4    90°   exactly the jump; the rests land ON the boundary
 *     n₂ = 3    60°   15° of clearance at each end
 *
 * Four was the obvious choice and it is the wrong one. It does not fail — it
 * has *no margin*, which is a different and worse thing: every rest position
 * sits precisely on the entry or exit angle, where the locking disc's gate is
 * still open and the cross is held by nothing but a pin touching the mouth of a
 * slot. It looks fine and it is one rounding error from parked.
 *
 * Three slots costs a smaller second cross and buys 15° at each end. It also
 * happens to look better, because two identical crosses read as a mirror and
 * two different ones read as a machine.
 *
 * ── The phase offset ─────────────────────────────────────────────────────────
 *
 * Half a station, π/4. Stage 1's cross rests at multiples of 90°, so its jumps
 * run 225° → 135° (and 45° → 315°, and so on, measured at stage 2's driver).
 * The 225° → 135° jump brackets stage 2's [150°, 210°] window with margin at
 * both ends; the other three sit entirely inside the dwell, where stage 2's
 * locking disc holds its cross rigid and the jump does nothing at all.
 *
 * ── What comes out ───────────────────────────────────────────────────────────
 *
 * Stage 2 advances one station per four revolutions of the input, so its cross
 * turns once per twelve. And because the two stages compose — and peak at the
 * same instant, which is what the offset also guarantees — the output does not
 * merely move rarely, it moves *hard*: dφ/dθ peaks at (1+√2)(√3/(2−√3)) ≈ 15.6
 * against stage 1's 2.41.
 *
 * It waits four times as long and arrives six times faster. That is the entire
 * argument for building it.
 */

import { solve, type GenevaSpec, type GenevaState } from "./geneva.ts";

const TAU = Math.PI * 2;

export type TrainSpec = {
  /** driven continuously */
  stage1: GenevaSpec;
  /** driven by stage 1's cross, in jumps */
  stage2: GenevaSpec;
  /**
   * Ratio between stage 1's cross and stage 2's driver — SIGNED.
   *
   * Not free. Stage 1's cross advances 360/n₁ per index, so stage 2's driver
   * jumps that much times the link — and stage 2 needs a whole number of jumps
   * to make one revolution, or it indexes at irregular intervals. That forces
   * |link| = n₁/k for integer k, which for four slots leaves 1, 4/3, 2 and 4.
   *
   * The sign is the coupling's, not a convention. This link is a physical crown
   * pair, and which way the pinion comes out depends on which way the crown's
   * teeth face: bolted teeth-down it drives the pinion backwards. Carrying that
   * in the number is the whole point — stage 2's driver angle and the pinion's
   * own angle are then the same quantity by construction, and cannot disagree.
   *
   * They did disagree. The crown was drawn teeth-down and driven as though it
   * were teeth-up; fixing the pinion left the Geneva on that same shaft still
   * turning the old way, so a crank and the gear bolted to it counter-rotated on
   * one piece of steel. An unsigned ratio made that state representable.
   */
  link: number;
  /** offset applied to stage 2's driver, after the link */
  phase: number;
};

/**
 * The train as built.
 *
 * Stage 2 is smaller as well as slower. Its three slots put the crank *outside*
 * the cross (a = c·sin60° = 0.866c against a rim of 0.5c), so at equal centre
 * distances the second stage would swing wider than the first and read as the
 * main event. At 0.78 it sits under stage 1's reach and the eye goes to the
 * fast wheel first, which is the right order: the slow one is a payoff, and a
 * payoff has to be waited for.
 */
export const TRAIN: TrainSpec = {
  stage1: { slots: 4, centres: 1 },
  stage2: { slots: 3, centres: 0.78 },
  /* Positive again: 24 teeth to 18, through a crown mounted teeth-UP.
  
     This was negative for as long as that crown hung under stage 1's cross.
     Turning it over so stage 2 could stack on top of stage 1 turned the sign
     with it — which is the point of carrying the sign here rather than in the
     renderers. The output's direction, and the handedness of the freewheel it
     drives, both follow from this one number. */
  link: 4 / 3,
  /* Zero, and checked rather than assumed. The rest positions fall 120° apart
     either way — reversing the link mirrors them about zero, it does not move
     them off their lattice — so the jump either side of the window still
     brackets it with 30° to spare. Checked in train.test.mts, both signs. */
  phase: 0,
};

export type TrainState = {
  /** input angle, unwrapped */
  driver: number;
  /** the fast stage, driven continuously */
  stage1: GenevaState;
  /** the slow stage, driven by stage 1's cross */
  stage2: GenevaState;
  /**
   * d(cross2)/d(driver) — the composed ratio.
   *
   * Positive, because two counter-rotations make a co-rotation: stage 2's cross
   * turns the same way as the input and the opposite way to stage 1's. Zero for
   * fifteen sixteenths of the cycle, and (1+√2)² at its peak.
   */
  ratio: number;
};

/** Solve both stages for an input angle. */
export function solveTrain(driver: number, train: TrainSpec = TRAIN): TrainState {
  const stage1 = solve(driver, train.stage1);
  const stage2 = solve(stage1.cross * train.link + train.phase, train.stage2);
  return {
    driver,
    stage1,
    stage2,
    /* Chain rule, all three links of it:
    
         d(cross2)/d(driver) = d(cross2)/d(driver2) · d(driver2)/d(cross1) · d(cross1)/d(driver)
                             =      −ratio₂        ·        link        ·      −ratio₁

       Three negatives now the link carries the crown's reversal, so the output
       runs *against* the input and *with* stage 1's cross. Signed on purpose:
       this number says which way the slow wheel goes, not just how fast, and
       the `link` in it is easy to leave out and worth 25% here. */
    ratio: stage1.ratio * stage2.ratio * train.link,
  };
}

/**
 * Input revolutions per full turn of the output.
 *
 * Magnitude — `Math.abs` on the link here and in the three below, because these
 * answer "how much" and the link's sign answers "which way". A signed link
 * without it turns the reduction negative and every sweep that loops to
 * `TAU * reduction()` runs backwards.
 *
 * n₁ stage-1 indexes to carry stage 2's driver through one revolution, and n₂
 * of those to bring its cross back round. 12 as built.
 */
export const reduction = (t: TrainSpec = TRAIN) =>
  (t.stage1.slots / Math.abs(t.link)) * t.stage2.slots;

/**
 * Which way the output turns, as a sign.
 *
 * d(cross2)/d(driver) is ratio₁ · ratio₂ · link, and both ratios are positive
 * through an index, so the output's direction is the link's and nothing else's.
 * Derived rather than written down because it has already changed once: the
 * output crown turned out to be mounted teeth-down, the link went negative, and
 * anything holding a remembered "+1" would have gone on believing it.
 */
export const outputSense = (t: TrainSpec = TRAIN) => (t.link < 0 ? -1 : 1);

/** Jumps of stage 2's driver per index of stage 1 — must be a whole number. */
export const jumpsPerTurn = (t: TrainSpec = TRAIN) => t.stage1.slots / Math.abs(t.link);

/* ----------------------------------------------------------------- readouts */

/**
 * Peak dφ/dθ for one stage. At mid-index cos θ = 1, so
 *
 *     a·c − a²       a(c − a)        a
 *     ────────── = ──────────── = ───────
 *     c² − 2ac + a²   (c − a)²      c − a
 *
 * which is 1 + √2 for four slots, and the reason a Geneva reads as a snap.
 */
export function peakStageRatio(spec: GenevaSpec) {
  const a = Math.sin(Math.PI / spec.slots); // a/c, so this is dimensionless
  return a / (1 - a);
}

/** Half the engagement window at stage 2's driver, in the jump's own terms. */
export const stage2Slack = (t: TrainSpec = TRAIN) =>
  (Math.PI / t.stage1.slots) * Math.abs(t.link) -
  (Math.PI / 2 - Math.PI / t.stage2.slots);

/**
 * Peak composed ratio — the product of the two stages'.
 *
 * A product and not a compromise, because the two stages peak at the *same
 * instant*: the phase offset centres stage 2's window on stage 1's jump, so the
 * middle of the jump is the middle of both indexes at once. The slow wheel
 * waits four times as long and then arrives six times faster.
 */
export const peakRatio = (t: TrainSpec = TRAIN) =>
  peakStageRatio(t.stage1) * peakStageRatio(t.stage2) * Math.abs(t.link);
