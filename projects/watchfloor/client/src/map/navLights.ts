import { bearingDeg, destination, normalizeDeg, type LatLon, type Platform } from '@watchfloor/shared';

/** Red, green and white as aviation uses them (deliberately not the identity colours). */
export const LIGHT_RGB = {
  red: [1, 0.22, 0.2],
  green: [0.3, 1, 0.45],
  white: [1, 1, 0.96],
} as const;

export type LightColor = keyof typeof LIGHT_RGB;

export interface Light extends LatLon {
  altM: number;
  color: LightColor;
  /** 0..1: strobes flash, position lights are steady. */
  intensity: number;
}

/** Half the wingspan (m): wingtip lights sit this far either side of the centre line. */
const HALF_SPAN: Partial<Record<Platform, number>> = {
  airliner: 18,
  'business-jet': 9,
  'light-aircraft': 5.5,
  helicopter: 1.5,
  'military-helicopter': 1.8,
  'military-aircraft': 6,
  'maritime-patrol': 15,
  uav: 7,
};
/** Wide-bodies: a 747 or an A350 is about 65 m across. */
const HEAVY_HALF_SPAN = 32;

/** How far behind the centre the tail light sits, as a share of the half-span (a long tube behind a wing). */
const TAIL_FACTOR = 1.1;

/**
 * Which lights face someone at relative bearing `rel` (degrees clockwise
 * from the other aircraft's nose to the viewer). The rules for position
 * lights: red on the left wingtip and green on the right, each shining from
 * dead ahead to 110° round its own side, white on the tail across the 140°
 * behind. So a pilot who sees red and green together is looking at the nose;
 * red alone, the aircraft is crossing from right to left.
 */
export function visibleLights(rel: number): { red: boolean; green: boolean; white: boolean } {
  const r = normalizeDeg(rel);
  // A couple of degrees of overlap dead ahead, where real lights both spill.
  return { green: r <= 110 || r >= 358, red: r >= 250 || r <= 2, white: r >= 110 && r <= 250 };
}

/**
 * Anti-collision strobes: a double flash about every 1.25 s, as Airbus
 * aircraft show. Each aircraft has its own phase (from its id), so a busy
 * sky twinkles instead of flashing in step.
 */
export function strobe(timeMs: number, phase: number): number {
  const t = (((timeMs + phase * 1250) % 1250) + 1250) % 1250;
  return (t < 60 || (t >= 150 && t < 210)) ? 1 : 0;
}

/** A stable phase in [0, 1) for an id. */
export function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export interface OtherAircraft extends LatLon {
  id: string;
  platform: Platform;
  /** True for wide-bodies (shapes.ts knows them by type code). */
  heavy: boolean;
  altM: number;
  courseDeg: number;
}

/**
 * The lights another aircraft shows to a viewer at `eye`: each at its true
 * place (wingtips either side of the course, the tail behind), each only if
 * its arc faces the viewer, plus the strobes. `steady` drops the flashing
 * (reduced motion) for a dim, constant strobe.
 */
export function lightsFor(other: OtherAircraft, eye: LatLon, timeMs: number, steady = false): Light[] {
  const half = other.heavy ? HEAVY_HALF_SPAN : (HALF_SPAN[other.platform] ?? 15);
  const rel = bearingDeg(other, eye) - other.courseDeg;
  const show = visibleLights(rel);
  const left = destination(other, other.courseDeg - 90, half);
  const right = destination(other, other.courseDeg + 90, half);
  const lights: Light[] = [];
  const at = (p: LatLon, color: LightColor, intensity: number) => lights.push({ lat: p.lat, lon: p.lon, altM: other.altM, color, intensity });
  if (show.red) at(left, 'red', 1);
  if (show.green) at(right, 'green', 1);
  if (show.white) at(destination(other, other.courseDeg + 180, half * TAIL_FACTOR), 'white', 1);
  const flash = steady ? 0.35 : strobe(timeMs, phaseOf(other.id));
  if (flash > 0) {
    at(left, 'white', flash);
    at(right, 'white', flash);
  }
  return lights;
}

/** Further than this, another aircraft's lights aren't drawn at all. */
export const LIGHT_RANGE_M = 150_000;

/**
 * Point size (CSS px) and opacity for a light at a distance: bigger and
 * brighter close by, and never smaller than a visible point (a real light
 * at night is a point you can see from tens of kilometres).
 */
export function lightLook(distM: number): { size: number; alpha: number } {
  const size = Math.max(14, Math.min(30, 250_000 / Math.max(distM, 1)));
  const alpha = Math.max(0.85, Math.min(1, 1.3 - distM / LIGHT_RANGE_M));
  return { size, alpha };
}
