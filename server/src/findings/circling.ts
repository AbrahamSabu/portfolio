import { headingDelta, normalizeLon } from '@watchfloor/shared';

/**
 * What the circling detector measured: how many full turns, around where,
 * and how tightly. Facts about geometry only — a news helicopter, a SAR
 * pattern, a surveillance orbit and a holding stack all look like this,
 * and the finding never says which.
 */
export interface Circling {
  /** Accumulated heading change in full turns, e.g. 3.4. */
  turns: number;
  /** Centre of the measured points. */
  lat: number;
  lon: number;
  /** How far the points stray from that centre. */
  radiusM: number;
  /** The span actually measured, whole minutes. */
  minutes: number;
}

/** How far back to measure. Longer would crown slow en-route doglegs. */
const WINDOW_MS = 15 * 60_000;
/** Two full turns: no airway, procedure turn or go-around adds up to that. */
const MIN_TURNS_DEG = 720;
/** Wide enough for a holding stack, far too tight for en-route manoeuvring. */
const MAX_RADIUS_M = 20_000;
/** Paths are thinned to their turning points, so an orbit keeps many; a straight run keeps almost none. */
const MIN_POINTS = 12;
const MIN_SPAN_MS = 3 * 60_000;

/**
 * Whether a path has been going in circles: the signed heading change along
 * its recent points adds up past two full turns, inside a tight radius.
 * Works on PathHistory's raw [lon, lat, t, ...] array so a pass over every
 * aircraft in the world allocates nothing for the straight-liners.
 */
export function circling(data: readonly number[], now: number): Circling | null {
  if (data.length < MIN_POINTS * 3) return null;
  // Points inside the window, newest known to be last.
  let start = data.length - 3;
  const cutoff = now - WINDOW_MS;
  while (start >= 3 && data[start - 1]! >= cutoff) start -= 3;
  const count = (data.length - start) / 3;
  if (count < MIN_POINTS) return null;
  const spanMs = data[data.length - 1]! - data[start + 2]!;
  if (spanMs < MIN_SPAN_MS) return null;

  // Flat-earth around the first point: fine at these radii, and cheap.
  const lat0 = data[start + 1]!;
  const lon0 = data[start]!;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  const ky = 110_540;
  const x = (lon: number) => {
    let d = lon - lon0;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d * kx;
  };

  // Signed total of heading change between successive legs. Signed, not
  // absolute: circling accumulates ±360 a lap, while jitter cancels out.
  let total = 0;
  let lastBearing: number | undefined;
  let sumX = 0;
  let sumY = 0;
  for (let i = start; i < data.length - 3; i += 3) {
    const dx = x(data[i + 3]!) - x(data[i]!);
    const dy = (data[i + 4]! - data[i + 1]!) * ky;
    sumX += x(data[i]!);
    sumY += (data[i + 1]! - lat0) * ky;
    if (dx === 0 && dy === 0) continue;
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (lastBearing !== undefined) total += headingDelta(lastBearing, bearing);
    lastBearing = bearing;
  }
  if (Math.abs(total) < MIN_TURNS_DEG) return null;

  // Centre and spread of the points (the last point joins the mean here).
  sumX += x(data[data.length - 3]!);
  sumY += (data[data.length - 2]! - lat0) * ky;
  const cx = sumX / count;
  const cy = sumY / count;
  let radiusM = 0;
  for (let i = start; i < data.length; i += 3) {
    const r = Math.hypot(x(data[i]!) - cx, (data[i + 1]! - lat0) * ky - cy);
    if (r > radiusM) radiusM = r;
  }
  if (radiusM > MAX_RADIUS_M) return null;

  return {
    turns: Math.round((Math.abs(total) / 360) * 10) / 10,
    lat: lat0 + cy / ky,
    lon: normalizeLon(lon0 + cx / kx),
    radiusM: Math.round(radiusM),
    minutes: Math.round(spanMs / 60_000),
  };
}
