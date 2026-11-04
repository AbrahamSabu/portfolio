import { bearingDeg, distanceM, EARTH_RADIUS_M, normalizeDeg, type LatLon } from '@watchfloor/shared';

/** A direction in the observer's frame: east, north, up (a unit vector). */
export interface Vec3 {
  e: number;
  n: number;
  u: number;
}

export interface SkyAngles {
  /** Degrees true, clockwise from north. */
  azimuthDeg: number;
  /** Degrees above the horizon (negative: below it). */
  elevationDeg: number;
}

const rad = Math.PI / 180;
const deg = 180 / Math.PI;

/**
 * Where the back of the phone points (the way its camera looks), from the
 * W3C DeviceOrientation angles: alpha around the screen's normal, beta
 * around its left-right axis, gamma around its long axis, applied Z-X'-Y''.
 * The device's -Z axis in the earth frame is minus the third column of the
 * rotation matrix. Held upright facing north (alpha 0, beta 90, gamma 0)
 * that is due north, level; tilting the top back (beta past 90) looks up.
 * Alpha must be absolute (0 = north) for the azimuth to mean anything.
 */
export function deviceDirection(alphaDeg: number, betaDeg: number, gammaDeg: number): Vec3 {
  const a = alphaDeg * rad;
  const b = betaDeg * rad;
  const g = gammaDeg * rad;
  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);
  return normalize({
    e: -(cG * sA * sB + cA * sG),
    n: cA * cG * sB - sA * sG,
    u: -cB * cG,
  });
}

export function anglesOf(v: Vec3): SkyAngles {
  return {
    azimuthDeg: normalizeDeg(Math.atan2(v.e, v.n) * deg),
    elevationDeg: Math.asin(Math.max(-1, Math.min(1, v.u))) * deg,
  };
}

export function directionOf(angles: SkyAngles): Vec3 {
  const az = angles.azimuthDeg * rad;
  const el = angles.elevationDeg * rad;
  return { e: Math.sin(az) * Math.cos(el), n: Math.cos(az) * Math.cos(el), u: Math.sin(el) };
}

/** Radio-horizon convention: light bends, so the earth looks a third bigger. */
const EFFECTIVE_RADIUS_M = (4 / 3) * EARTH_RADIUS_M;

export interface SkyPosition extends SkyAngles {
  /** Along the ground to the point beneath it. */
  groundM: number;
}

/**
 * Where an aircraft appears in the observer's sky. At tens of kilometres the
 * earth's curve matters (an airliner 60 km away at 11 km sits a few tenths
 * of a degree lower than flat geometry says), so the target's height is
 * reduced by the curve's drop before taking the angle.
 */
export function skyPosition(observer: LatLon, target: LatLon & { altitudeM: number }, observerAltM = 0): SkyPosition {
  const groundM = distanceM(observer, target);
  const drop = (groundM * groundM) / (2 * EFFECTIVE_RADIUS_M);
  const rise = target.altitudeM - observerAltM - drop;
  const elevationDeg = groundM < 1 ? (rise >= 0 ? 90 : -90) : Math.atan2(rise, groundM) * deg;
  return { azimuthDeg: groundM < 1 ? 0 : bearingDeg(observer, target), elevationDeg, groundM };
}

/** The angle between two directions, degrees. */
export function separationDeg(a: Vec3, b: Vec3): number {
  const dot = a.e * b.e + a.n * b.n + a.u * b.u;
  return Math.acos(Math.max(-1, Math.min(1, dot))) * deg;
}

/** The candidate nearest to where the phone points, and how far off it is. */
export function nearestTo<T extends { dir: Vec3 }>(pointing: Vec3, candidates: readonly T[]): { item: T; offDeg: number } | null {
  let best: { item: T; offDeg: number } | null = null;
  for (const item of candidates) {
    const offDeg = separationDeg(pointing, item.dir);
    if (!best || offDeg < best.offDeg) best = { item, offDeg };
  }
  return best;
}

/** How to move the phone onto a target: turn right (+) or left (-), tilt up (+) or down (-). */
export function guidance(pointing: SkyAngles, target: SkyAngles): { turnDeg: number; tiltDeg: number } {
  let turn = target.azimuthDeg - pointing.azimuthDeg;
  if (turn > 180) turn -= 360;
  if (turn < -180) turn += 360;
  return { turnDeg: turn, tiltDeg: target.elevationDeg - pointing.elevationDeg };
}

/**
 * Smooth a jittery compass: move part of the way from the old direction to
 * the new. Done on the vector, not on angles, so north (359° to 1°) and the
 * zenith don't make it spin.
 */
export function blend(previous: Vec3 | null, next: Vec3, k: number): Vec3 {
  if (!previous) return next;
  return normalize({
    e: previous.e + (next.e - previous.e) * k,
    n: previous.n + (next.n - previous.n) * k,
    u: previous.u + (next.u - previous.u) * k,
  });
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function compassPoint(azimuthDeg: number): (typeof POINTS)[number] {
  return POINTS[Math.round(normalizeDeg(azimuthDeg) / 45) % 8]!;
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.e, v.n, v.u) || 1;
  return { e: v.e / len, n: v.n / len, u: v.u / len };
}
