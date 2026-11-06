import type { Affiliation, TrailPoint } from '@watchfloor/shared';
import { AFFILIATION_COLOR } from './colors';
import { LOOK, VertexWriter, type Batch, type Rgba } from './layer3d';
import { mercatorX, mercatorY, projectPoint, type MercatorRef, type ProjectionSnapshot } from './project3d';

/**
 * Heights in the Stack are drawn this many times taller than life. At true
 * scale a 300 m (1,000 ft) step between holding levels is three pixels at
 * regional zoom; at ×5 it reads, and cruise traffic still fits on screen.
 * One fixed factor, never changed with zoom, so heights always compare.
 */
export const STACK_EXAGGERATION = 5;

/** A trail longer than this is thinned (evenly, keeping its newest point): plenty for a corkscrew. */
const MAX_TRAIL_POINTS = 48;

export type LiftedPoint = readonly [lon: number, lat: number, altM: number];

export interface StackAircraft {
  id: string;
  affiliation: Affiliation;
  /** Where it's drawn now (dead-reckoned, as on the flat map). */
  lon: number;
  lat: number;
  /** Metres; undefined when it doesn't report one: drawn on the surface, with no drop line. */
  altM: number | undefined;
  stale: boolean;
  selected: boolean;
  /** The trail's newest lifted point, for the short line joining it to where the aircraft is now. */
  trailEnd?: LiftedPoint;
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const AFFILIATION_RGB = Object.fromEntries(Object.entries(AFFILIATION_COLOR).map(([k, v]) => [k, rgb(v)])) as Record<Affiliation, [number, number, number]>;

export const colorOf = (affiliation: Affiliation, alpha: number): Rgba => [...AFFILIATION_RGB[affiliation], alpha];

/**
 * Lift a trail to the heights it was flown: each point gets the altitude
 * recorded for its moment, and points from before any altitude was known
 * (before `since`) are left out rather than guessed. Long trails are thinned
 * evenly to `max` points first, so only those few are looked up.
 */
export function liftTrail(
  points: readonly TrailPoint[],
  altitudeAt: (t: number) => number | undefined,
  max = MAX_TRAIL_POINTS,
  since = -Infinity,
): LiftedPoint[] {
  // The first point at or after `since` (trails are oldest first).
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]![2] < since) lo = mid + 1;
    else hi = mid;
  }
  const n = points.length - lo;
  const count = Math.min(n, max);
  const lifted: LiftedPoint[] = [];
  for (let i = 0; i < count; i++) {
    const [lon, lat, t] = points[lo + (count === 1 ? n - 1 : Math.round((i * (n - 1)) / (count - 1)))]!;
    const alt = altitudeAt(t);
    if (alt !== undefined) lifted.push([lon, lat, alt]);
  }
  return lifted;
}

export interface AircraftBatches {
  /** Drop lines, and the joins from each trail's end to the aircraft. */
  lines: Batch;
  /** Ground dots first, then the aircraft on top. */
  points: Batch;
}

/** The aircraft themselves: rebuilt as often as the flat map moves them. */
export function buildAircraft(aircraft: readonly StackAircraft[], ref: MercatorRef): AircraftBatches {
  const lines = new VertexWriter(ref);
  const points = new VertexWriter(ref);
  for (const a of aircraft) {
    const x = mercatorX(a.lon);
    const y = mercatorY(a.lat);
    const fade = a.stale ? 0.4 : 1;
    const alt = a.altM ?? 0;
    if (a.altM !== undefined) {
      // Brighter at the aircraft, fading towards the ground.
      lines.push(x, y, alt, colorOf(a.affiliation, 0.5 * fade));
      lines.push(x, y, 0, colorOf(a.affiliation, 0.08 * fade));
      points.push(x, y, 0, colorOf(a.affiliation, 0.45 * fade), 4);
    }
    if (a.trailEnd) {
      const [lon, lat, endAlt] = a.trailEnd;
      lines.push(mercatorX(lon), mercatorY(lat), endAlt, colorOf(a.affiliation, 0.7 * fade));
      lines.push(x, y, alt, colorOf(a.affiliation, 0.7 * fade));
    }
  }
  // A second pass, so every aircraft is drawn over every ground dot.
  for (const a of aircraft) {
    const look = a.selected ? LOOK.selected : LOOK.dot;
    points.push(mercatorX(a.lon), mercatorY(a.lat), a.altM ?? 0, colorOf(a.affiliation, a.stale ? 0.4 : 1), a.selected ? 20 : 9, look);
  }
  return { lines: lines.batch('lines'), points: points.batch('points') };
}

export interface TrailInput {
  affiliation: Affiliation;
  stale: boolean;
  selected: boolean;
  points: readonly LiftedPoint[];
}

/** Trails at altitude, fading with age: rebuilt only when reports arrive, not every frame. */
export function buildTrails(trails: Iterable<TrailInput>, ref: MercatorRef): Batch {
  const w = new VertexWriter(ref);
  for (const trail of trails) {
    const n = trail.points.length;
    if (n < 2) continue;
    const top = (trail.selected ? 0.95 : 0.7) * (trail.stale ? 0.5 : 1);
    for (let i = 1; i < n; i++) {
      const [lon0, lat0, alt0] = trail.points[i - 1]!;
      const [lon1, lat1, alt1] = trail.points[i]!;
      w.push(mercatorX(lon0), mercatorY(lat0), alt0, colorOf(trail.affiliation, top * (0.08 + (0.92 * (i - 1)) / (n - 1))));
      w.push(mercatorX(lon1), mercatorY(lat1), alt1, colorOf(trail.affiliation, top * (0.08 + (0.92 * i) / (n - 1))));
    }
  }
  return w.batch('lines');
}

/**
 * The aircraft nearest a screen point, if one is drawn within `pad` pixels
 * of it: projected exactly as the GPU drew it. Nearest wins, and the
 * selected aircraft (drawn larger) is easier to hit.
 */
export function pickAircraft(
  projection: ProjectionSnapshot,
  aircraft: Iterable<StackAircraft>,
  point: { x: number; y: number },
  pad: number,
  width: number,
  height: number,
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const a of aircraft) {
    const at = projectPoint(projection, mercatorX(a.lon), mercatorY(a.lat), a.altM ?? 0, width, height);
    if (!at) continue;
    const reach = pad + (a.selected ? 10 : 4);
    const d = Math.hypot(at.x - point.x, at.y - point.y);
    if (d <= reach && d < bestDistance) {
      best = a.id;
      bestDistance = d;
    }
  }
  return best;
}
