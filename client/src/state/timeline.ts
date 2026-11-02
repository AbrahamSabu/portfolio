import { bearingDeg, type TrailPoint } from '@watchfloor/shared';

/**
 * The timeline's arithmetic: one bar runs from six hours ago, through NOW,
 * to thirty minutes of dead-reckoned future. Pure functions, so the maths
 * of scrubbing is tested without a map.
 */

/** How far back the bar reaches: within the server's path windows (12/24 h). */
export const REPLAY_SPAN_MS = 6 * 3_600_000;
/** How far forward projection dares: dead reckoning decays fast beyond this. */
export const PROJECT_SPAN_MS = 30 * 60_000;
/** Where NOW sits on the bar: most of the width for the past, a stub for the future. */
export const NOW_F = 0.78;

export type TimelineState =
  | { mode: 'live' }
  /** Showing the picture as it was at `t` (absolute ms). */
  | { mode: 'replay'; t: number }
  /** Showing where everything would be `offsetMs` from now, on current courses. */
  | { mode: 'project'; offsetMs: number };

/** The state a handle position means. A hair's width around NOW snaps to live. */
export function stateAt(f: number, now: number): TimelineState {
  const clamped = Math.min(1, Math.max(0, f));
  if (Math.abs(clamped - NOW_F) < 0.004) return { mode: 'live' };
  if (clamped < NOW_F) return { mode: 'replay', t: now - ((NOW_F - clamped) / NOW_F) * REPLAY_SPAN_MS };
  return { mode: 'project', offsetMs: ((clamped - NOW_F) / (1 - NOW_F)) * PROJECT_SPAN_MS };
}

/** Where a state's handle sits, the inverse of stateAt. */
export function fractionOf(state: TimelineState, now: number): number {
  switch (state.mode) {
    case 'live':
      return NOW_F;
    case 'replay':
      return Math.max(0, NOW_F - ((now - state.t) / REPLAY_SPAN_MS) * NOW_F);
    case 'project':
      return Math.min(1, NOW_F + (state.offsetMs / PROJECT_SPAN_MS) * (1 - NOW_F));
  }
}

export interface ReplayPosition {
  lon: number;
  lat: number;
  courseDeg: number;
}

/** A dropped track's dot lingers this long past its last report before winking out. */
const HOLD_AFTER_MS = 10 * 60_000;

/**
 * Where a path was at time `t`: linear interpolation between the bracketing
 * points, course along the segment. Null before the first report (it hadn't
 * been seen) and well after the last (it was gone).
 */
export function positionAt(points: readonly TrailPoint[], t: number): ReplayPosition | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (t < first[2]) return null;
  if (t >= last[2]) {
    if (t - last[2] > HOLD_AFTER_MS) return null;
    const prev = points.length > 1 ? points[points.length - 2]! : last;
    return { lon: last[0], lat: last[1], courseDeg: course(prev, last) };
  }
  // Binary search for the segment with points[lo][2] <= t < points[hi][2].
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]![2] <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const span = b[2] - a[2];
  const k = span <= 0 ? 0 : (t - a[2]) / span;
  let dLon = b[0] - a[0];
  if (dLon > 180) dLon -= 360; // across the antimeridian
  if (dLon < -180) dLon += 360;
  let lon = a[0] + dLon * k;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lon, lat: a[1] + (b[1] - a[1]) * k, courseDeg: course(a, b) };
}

function course(a: TrailPoint, b: TrailPoint): number {
  if (a[0] === b[0] && a[1] === b[1]) return 0;
  return bearingDeg({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] });
}

/** "−2 h 14 min" / "−43 s" for the replay tag; whole minutes for projection. */
export function formatBehind(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `−${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `−${minutes} min`;
  return `−${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
