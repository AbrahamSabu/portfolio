/**
 * Small spherical-earth helpers. Accurate to well under 0.5% over the distances
 * a COP deals with, which is plenty for display and simulation.
 */

export const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Wrap any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Wrap longitude into [-180, 180). */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Signed smallest difference from one heading to another, in (-180, 180]. */
/**
 * A line's longitudes made continuous: each step takes the short way round,
 * so a line over the antimeridian runs 179 → 181 (which the map draws across
 * the seam) rather than 179 → −179, a line nearly round the world.
 */
export function unwrapLine(points: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let shift = 0;
  let prev: number | undefined;
  for (const [lon0, lat] of points) {
    let lon = lon0 + shift;
    if (prev !== undefined && lon - prev > 180) {
      shift -= 360;
      lon -= 360;
    } else if (prev !== undefined && prev - lon > 180) {
      shift += 360;
      lon += 360;
    }
    out.push([lon, lat]);
    prev = lon;
  }
  return out;
}

export function headingDelta(fromDeg: number, toDeg: number): number {
  const d = normalizeDeg(toDeg - fromDeg);
  return d > 180 ? d - 360 : d;
}

/** Great-circle distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = φ2 - φ1;
  const dλ = toRad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees true. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dλ = toRad(b.lon - a.lon);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** The point reached by travelling `distM` metres from `from` on initial bearing `bearing`. */
export function destination(from: LatLon, bearing: number, distM: number): LatLon {
  const δ = distM / EARTH_RADIUS_M;
  const θ = toRad(bearing);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lon);
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2);
  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}

/**
 * Dead reckoning: where a track would be after `elapsedMs` if it held course
 * and speed. Used by the client to keep symbols moving between reports.
 */
export function deadReckon(
  from: LatLon,
  courseDeg: number,
  speedMps: number,
  elapsedMs: number,
): LatLon {
  if (elapsedMs <= 0 || speedMps <= 0) return { lat: from.lat, lon: from.lon };
  return destination(from, courseDeg, (speedMps * elapsedMs) / 1000);
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function inBBox(p: LatLon, b: BBox): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;
}

// Unit conversions used across the UI and feeds.
export const MPS_PER_KNOT = 1852 / 3600; // a knot is exactly 1,852 m an hour
export const M_PER_FT = 0.3048;
export const mpsToKnots = (mps: number) => mps / MPS_PER_KNOT;
export const knotsToMps = (kt: number) => kt * MPS_PER_KNOT;
export const metresToFeet = (m: number) => m / M_PER_FT;
export const feetToMetres = (ft: number) => ft * M_PER_FT;

export interface MovingPoint extends LatLon {
  /** Course over ground, degrees true. */
  courseDeg: number;
  /** Speed over ground, m/s. */
  speedMps: number;
}

export interface Approach {
  rangeM: number;
  /** From a to b, degrees true. */
  bearingDeg: number;
  /** Positive while the two are getting closer (m/s); negative means opening. */
  closingMps: number;
  /** Seconds until the closest point; 0 when they are already past it (or hold steady). */
  tcpaS: number;
  /** How close they will get (m), on present courses and speeds. */
  cpaM: number;
}

/**
 * Closest point of approach between two tracks: the CIC console's answer to
 * "are these two going to meet?". The patch of earth between them is treated
 * as flat and both courses and speeds as constant — good to a few percent at
 * the ranges a hook is used over, and honest about being a projection.
 */
export function approach(a: MovingPoint, b: MovingPoint): Approach {
  const rangeM = distanceM(a, b);
  const brg = bearingDeg(a, b);
  const rad = Math.PI / 180;
  // East/north metres of b relative to a, and the relative velocity.
  const rx = rangeM * Math.sin(brg * rad);
  const ry = rangeM * Math.cos(brg * rad);
  const vx = b.speedMps * Math.sin(b.courseDeg * rad) - a.speedMps * Math.sin(a.courseDeg * rad);
  const vy = b.speedMps * Math.cos(b.courseDeg * rad) - a.speedMps * Math.cos(a.courseDeg * rad);
  const vv = vx * vx + vy * vy;
  const rv = rx * vx + ry * vy;
  const closingMps = rangeM === 0 ? 0 : -rv / rangeM;
  const tcpaS = vv === 0 ? 0 : Math.max(0, -rv / vv);
  const cpaM = Math.hypot(rx + vx * tcpaS, ry + vy * tcpaS);
  return { rangeM, bearingDeg: brg, closingMps, tcpaS, cpaM };
}
