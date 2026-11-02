import type { BBox } from '@watchfloor/shared';
import { contains, normalizeView, snap } from '../opensky/coverage';

export const WORLD: BBox = { south: -90, west: -180, north: 90, east: 180 };

/**
 * Past this many boxes, subscribe to one box around them all. AISStream
 * documents no limit, but a subscription message is one frame it must parse,
 * and a crowd of viewers looking everywhere is a world subscription anyway.
 */
const MAX_BOXES = 16;

/**
 * The boxes to subscribe to for what browsers are looking at.
 *
 * Unlike OpenSky, AISStream charges nothing per box: the cost is message
 * volume, which grows with area. So separate views stay separate boxes, and
 * one around them is only the fallback for a crowd. Views are split at the
 * antimeridian and snapped outward to whole degrees, so small pans give the
 * same subscription and don't resend it. Sorted, so equal plans compare equal.
 */
export function planAisBoxes(views: BBox[]): BBox[] {
  const pieces: BBox[] = [];
  for (const view of views) {
    const normalized = normalizeView(view);
    if (normalized === null) return [WORLD];
    pieces.push(...normalized.map(snap));
  }
  // Drop boxes another already covers (two viewers on the same area).
  const boxes = pieces.filter((b, i) => !pieces.some((o, j) => j !== i && contains(o, b) && (!contains(b, o) || j < i)));
  if (boxes.length > MAX_BOXES) {
    return [
      {
        south: Math.min(...boxes.map((b) => b.south)),
        west: Math.min(...boxes.map((b) => b.west)),
        north: Math.max(...boxes.map((b) => b.north)),
        east: Math.max(...boxes.map((b) => b.east)),
      },
    ];
  }
  return boxes.sort((a, b) => a.south - b.south || a.west - b.west || a.north - b.north || a.east - b.east);
}

/** Compact text for logs, /healthz and comparing plans, e.g. "49,-5,52,3" or "none". */
export function describeBoxes(boxes: BBox[]): string {
  if (boxes.length === 0) return 'none';
  return boxes.map((b) => `${b.south},${b.west},${b.north},${b.east}`).join(' + ');
}
