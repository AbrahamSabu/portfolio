import type { TrailPoint } from '@watchfloor/shared';

export const BLIP_COUNT = 10;

/**
 * The scope look: a trail as the last few reported positions, one per tenth
 * of the history window, like the sweep-by-sweep history of a radar scope.
 * Returns [lon, lat, fade], newest first, with fade 1 fresh and smaller as a
 * blip ages. Points are TrailHistory's, oldest first.
 */
export function blipsFor(points: readonly TrailPoint[], now: number, windowMs: number, count = BLIP_COUNT): [number, number, number][] {
  const step = windowMs / count;
  const blips: [number, number, number][] = [];
  let i = points.length - 1;
  let picked = -1;
  for (let slot = 0; slot < count; slot++) {
    const target = now - slot * step;
    while (i >= 0 && points[i]![2] > target) i--;
    if (i < 0) break;
    if (i !== picked) {
      const [lon, lat, t] = points[i]!;
      blips.push([lon, lat, Math.max(0.15, 1 - (now - t) / windowMs)]);
      picked = i;
    }
  }
  return blips;
}
