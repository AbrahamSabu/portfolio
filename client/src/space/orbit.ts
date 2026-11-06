import type { SatelliteElements } from '@watchfloor/shared';
import { metresPerPixel, MIN_RENDER_INTERVAL_MS } from '../map/renderRate';

/**
 * Orbit facts worked out from the elements alone: no propagation needed.
 * Pure, so the details card, the layer and the tests share them.
 */

/** Earth's gravitational parameter, km³/s² (WGS-84). */
const MU = 398_600.4418;
/** Equatorial radius, km (WGS-84). */
export const EARTH_RADIUS_KM = 6378.137;
/** Earth's oblateness term: what makes orbits' planes turn. */
const J2 = 1.08262668e-3;
/** One sidereal day in minutes: a geosynchronous orbit's period. */
const SIDEREAL_DAY_MIN = 1436.07;
/** The sun's apparent motion, degrees per day: what a sun-synchronous plane keeps pace with. */
const SUN_DEG_PER_DAY = 360 / 365.2422;

/** Minutes per orbit. */
export function periodMinutes(meanMotion: number): number {
  return 1440 / meanMotion;
}

/** The orbit's size from its period (Kepler's third law), km from Earth's centre. */
export function semiMajorAxisKm(meanMotion: number): number {
  const n = (meanMotion * 2 * Math.PI) / 86_400; // rad/s
  return Math.cbrt(MU / (n * n));
}

/** Highest and lowest points above the equatorial radius, km. */
export function apsidesKm(e: SatelliteElements): { apogee: number; perigee: number } {
  const a = semiMajorAxisKm(e.meanMotion);
  return { apogee: a * (1 + e.eccentricity) - EARTH_RADIUS_KM, perigee: a * (1 - e.eccentricity) - EARTH_RADIUS_KM };
}

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export const ORBIT_LABEL: Record<OrbitClass, string> = {
  LEO: 'Low Earth orbit',
  MEO: 'Medium Earth orbit',
  GEO: 'Geosynchronous orbit',
  HEO: 'Highly elliptical orbit',
};

/**
 * The usual families: low orbits stay under 2,000 km, geosynchronous ones
 * go round once a sidereal day, highly elliptical ones swing far out and
 * back (Molniya-type weather and relay satellites), and the rest are medium.
 */
export function orbitClass(e: SatelliteElements): OrbitClass {
  const { apogee } = apsidesKm(e);
  if (e.eccentricity > 0.25) return 'HEO';
  if (Math.abs(periodMinutes(e.meanMotion) - SIDEREAL_DAY_MIN) < 30 && e.eccentricity < 0.05) return 'GEO';
  if (apogee < 2000) return 'LEO';
  return 'MEO';
}

/** Geostationary: geosynchronous over the equator, so it hangs over one spot. */
export function isGeostationary(e: SatelliteElements): boolean {
  return orbitClass(e) === 'GEO' && e.inclination < 3;
}

/**
 * How fast the orbit's plane turns, degrees a day (positive = eastward). The
 * equatorial bulge makes every inclined plane precess; at about 98° the turn
 * matches the sun's, and the satellite crosses each latitude at the same
 * local time every day: what weather and imaging satellites are put there for.
 */
export function nodalPrecessionDegPerDay(e: SatelliteElements): number {
  const a = semiMajorAxisKm(e.meanMotion);
  const p = a * (1 - e.eccentricity ** 2);
  const n = e.meanMotion * 360; // degrees per day
  return -1.5 * J2 * (EARTH_RADIUS_KM / p) ** 2 * n * Math.cos((e.inclination * Math.PI) / 180);
}

export function isSunSynchronous(e: SatelliteElements): boolean {
  return orbitClass(e) === 'LEO' && Math.abs(nodalPrecessionDegPerDay(e) - SUN_DEG_PER_DAY) < 0.05;
}

/**
 * The shell: zoomed out, low orbits are drawn at their true height, to scale,
 * which puts a thin halo of satellites round the globe's edge. Zooming in, the
 * camera would soon sit below them (at zoom 6 it is under 2,000 km up), so
 * between zoom 3 and 5 they settle onto the ground point they are over.
 * Returns the share of the true height to draw.
 */
export function shellScale(zoom: number): number {
  const t = Math.min(1, Math.max(0, (5 - zoom) / 2));
  return t * t * (3 - 2 * t);
}

/** Above this height a satellite is drawn on the ground point it's over: at true height it would leave the screen. */
export const SHELL_MAX_ALTITUDE_KM = 2000;

/** About the fastest a satellite crosses the ground (low orbit, m/s). */
const SATELLITE_MPS = 7_800;
const MAX_PIXEL_STEP = 0.5;
const MAX_INTERVAL_MS = 1000;

/**
 * How often the satellites need a fresh frame, the same rule as the tracks'
 * (map/renderRate.ts): when the fastest could have moved half a pixel. About
 * once a second at world view, ten times a second from zoom 5.
 */
export function satelliteIntervalMs(zoom: number, latDeg: number): number {
  const ms = ((metresPerPixel(zoom, latDeg) * MAX_PIXEL_STEP) / SATELLITE_MPS) * 1000;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_RENDER_INTERVAL_MS, ms));
}

/** Web Mercator, 0..1 across and down the world, as MapLibre's shaders take positions. */
export function mercatorX(lonDeg: number): number {
  return (lonDeg + 180) / 360;
}

export function mercatorY(latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
}

/**
 * A line of positions (longitudes in -180..180) cut where it crosses the
 * antimeridian, each piece ending exactly on it, as GeoJSON asks (RFC 7946).
 * A ground track goes round the world more than once, so "unwrapping" it to
 * longitudes past 180 would run beyond the one copy of the world either
 * side that the map's tiler keeps, and pieces would vanish.
 */
export function splitAtAntimeridian(lons: readonly number[], lats: readonly number[]): [number, number][][] {
  const pieces: [number, number][][] = [];
  let piece: [number, number][] = [];
  for (let i = 0; i < lons.length; i++) {
    const lon = lons[i]!;
    const lat = lats[i]!;
    if (i > 0) {
      const prevLon = lons[i - 1]!;
      const prevLat = lats[i - 1]!;
      const d = lon - prevLon;
      if (d > 180 || d < -180) {
        // Westward over -180 (d > 180) or eastward over +180: where on the line it crosses.
        const edge = d > 180 ? -180 : 180;
        const unwrapped = d > 180 ? lon - 360 : lon + 360;
        const lat0 = prevLat + ((lat - prevLat) * (edge - prevLon)) / (unwrapped - prevLon);
        piece.push([edge, lat0]);
        pieces.push(piece);
        piece = [[-edge, lat0]];
      }
    }
    piece.push([lon, lat]);
  }
  pieces.push(piece);
  return pieces.filter((p) => p.length >= 2);
}

export interface Pass {
  /** When it rises above the minimum elevation; null when it was already up at the start. */
  rise: number | null;
  /** Highest point and when. */
  peak: number;
  peakElevation: number;
  /** When it sinks below the minimum elevation again. */
  set: number;
}

export type PassResult = { kind: 'pass'; pass: Pass } | { kind: 'always'; elevation: number } | { kind: 'none' };

/**
 * The next time a satellite is above `minElevation` from a place, given its
 * elevation as a function of time. Steps forward (fine enough not to miss a
 * low-orbit pass, which lasts minutes), then narrows rise and set by
 * bisection to a second. "Always": up for the whole search (a geostationary
 * satellite in view); "none": never up within it.
 */
export function findNextPass(
  elevationAt: (t: number) => number,
  from: number,
  opts: { horizonMs: number; stepMs: number; minElevation: number },
): PassResult {
  const { horizonMs, stepMs, minElevation } = opts;
  const up = (t: number) => elevationAt(t) >= minElevation;
  const end = from + horizonMs;
  let rise: number | null = null;
  let t = from;
  if (!up(from)) {
    let prev = from;
    for (t = from + stepMs; t <= end; t += stepMs) {
      if (up(t)) break;
      prev = t;
    }
    if (t > end) return { kind: 'none' };
    rise = edge(up, prev, t);
  }
  let after = t;
  for (; after <= end; after += stepMs) if (!up(after)) break;
  if (after > end && rise === null) return { kind: 'always', elevation: elevationAt(from) };
  const set = after > end ? end : edge((x) => !up(x), after - stepMs, after);
  // The peak: a pass is a single hump, so a coarse look then a fine one finds it.
  let peak = rise ?? from;
  let peakElevation = -90;
  const scan = (a: number, b: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const el = elevationAt(x);
      if (el > peakElevation) {
        peakElevation = el;
        peak = x;
      }
    }
  };
  const start = rise ?? from;
  scan(start, set, 40);
  const span = (set - start) / 40;
  scan(Math.max(start, peak - span), Math.min(set, peak + span), 40);
  return { kind: 'pass', pass: { rise, peak, peakElevation, set } };
}

/** The moment `test` first holds between a (false) and b (true), to a second. */
function edge(test: (t: number) => boolean, a: number, b: number): number {
  let lo = a;
  let hi = b;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (test(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Objects docked together (a station and the craft at its ports) share one
 * position, and CelesTrak lists each. They are drawn as one, under the oldest
 * catalogue number: the station's first module (ISS: Zarya, 1998; Tiangong:
 * Tianhe, 2021). Positions are any metric frame, km. Returns, by the index of
 * each stack's representative, the indexes of the objects docked to it.
 */
export function dockedStacks(ids: readonly number[], positionOf: (i: number) => [number, number, number] | null, withinKm = 25): Map<number, number[]> {
  const stacks = new Map<number, number[]>();
  const taken = new Set<number>();
  const order = ids.map((_, i) => i).sort((a, b) => ids[a]! - ids[b]!);
  for (const i of order) {
    if (taken.has(i)) continue;
    const p = positionOf(i);
    if (!p) continue;
    const members: number[] = [];
    for (const j of order) {
      if (j === i || taken.has(j)) continue;
      const q = positionOf(j);
      if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= withinKm) {
        members.push(j);
        taken.add(j);
      }
    }
    if (members.length > 0) stacks.set(i, members);
  }
  return stacks;
}
