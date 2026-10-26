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
export const MPS_PER_KNOT = 0.514444;
export const M_PER_FT = 0.3048;
export const mpsToKnots = (mps: number) => mps / MPS_PER_KNOT;
export const knotsToMps = (kt: number) => kt * MPS_PER_KNOT;
export const metresToFeet = (m: number) => m / M_PER_FT;
export const feetToMetres = (ft: number) => ft * M_PER_FT;
