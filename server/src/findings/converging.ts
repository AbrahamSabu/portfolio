import { approach, MILITARY_AIR_PLATFORMS, type Approach, type Platform, type Track } from '@watchfloor/shared';

/** Two military aircraft whose present courses bring them close. */
export interface Convergence {
  a: Track;
  b: Track;
  approach: Approach;
}

const MILITARY_AIR: ReadonlySet<Platform> = new Set(MILITARY_AIR_PLATFORMS);

/** Reports older than this describe where the aircraft was, not where it is. */
const MAX_AGE_MS = 90_000;
/** Below this it's on the ground or hovering: no meaningful course to project. */
const MIN_SPEED_MPS = 30;
/** They must actually meet: closest point under 5 km... */
const MAX_CPA_M = 5_000;
/** ...within the next ten minutes... */
const MAX_TCPA_S = 600;
/** ...from apart enough that this isn't a formation already joined (tankers trail receivers all day). */
const MIN_RANGE_M = 15_000;
/** Flat-earth CPA degrades with range, and a pair hours apart is not a story yet. */
const MAX_RANGE_M = 400_000;
/** Stacked levels pass over each other all day; only near-coaltitude pairs count, when both are known. */
const MAX_ALTITUDE_GAP_M = 3_000;

/**
 * Every pair of military aircraft currently converging: CPA under 5 km inside
 * ten minutes, measured from present courses and speeds. The military list is
 * short (a few hundred worldwide), so the pairwise pass is cheap.
 */
/** The range cap in degrees of latitude: a cheap test before the pairwise trig. */
const MAX_RANGE_DEG = MAX_RANGE_M / 111_000;
const DEG = Math.PI / 180;

export function convergingPairs(tracks: readonly Track[], now: number): Convergence[] {
  const military = tracks.filter(
    (t) => t.domain === 'air' && MILITARY_AIR.has(t.platform) && t.speedMps >= MIN_SPEED_MPS && now - t.observedAt <= MAX_AGE_MS,
  );
  const out: Convergence[] = [];
  for (let i = 0; i < military.length; i++) {
    for (let j = i + 1; j < military.length; j++) {
      const a = military[i]!;
      const b = military[j]!;
      if (a.altitudeM !== undefined && b.altitudeM !== undefined && Math.abs(a.altitudeM - b.altitudeM) > MAX_ALTITUDE_GAP_M) continue;
      // A box test before the trig: approach() per pair cost 1.2 s a sweep
      // at 1,500 military aircraft (measured), and the aircraft database
      // flags thousands. Pairs farther apart than the range cap can't converge.
      if (Math.abs(a.lat - b.lat) > MAX_RANGE_DEG) continue;
      const dLon = Math.abs(((a.lon - b.lon + 540) % 360) - 180); // the short way round, over the antimeridian too
      if (dLon * Math.cos(((a.lat + b.lat) / 2) * DEG) > MAX_RANGE_DEG) continue;
      const ap = approach(a, b);
      if (ap.rangeM < MIN_RANGE_M || ap.rangeM > MAX_RANGE_M) continue;
      if (ap.tcpaS <= 0 || ap.tcpaS > MAX_TCPA_S || ap.cpaM > MAX_CPA_M) continue;
      out.push({ a, b, approach: ap });
    }
  }
  return out;
}
