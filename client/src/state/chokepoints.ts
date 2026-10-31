import { inBBox, type BBox, type Track } from '@watchfloor/shared';

export interface Chokepoint {
  id: string;
  name: string;
  /** For the tag when zoomed out. */
  short: string;
  /** The narrows themselves, roughly: a box a ship must be in to be "in" it. */
  box: BBox;
}

/**
 * The narrow seaways most of the world's shipping passes through. Boxes
 * drawn by hand over each narrows from the chart, generous enough to hold
 * the traffic lanes, small enough not to take in neighbouring ports.
 */
export const CHOKEPOINTS: readonly Chokepoint[] = [
  { id: 'hormuz', name: 'Strait of Hormuz', short: 'Hormuz', box: { south: 25.8, west: 55.8, north: 27.0, east: 57.2 } },
  { id: 'bab-el-mandeb', name: 'Bab-el-Mandeb', short: 'Bab-el-Mandeb', box: { south: 12.2, west: 43.0, north: 13.0, east: 43.7 } },
  { id: 'suez', name: 'Suez Canal', short: 'Suez', box: { south: 29.9, west: 32.2, north: 31.3, east: 32.65 } },
  { id: 'singapore', name: 'Singapore Strait', short: 'Singapore', box: { south: 1.1, west: 103.5, north: 1.5, east: 104.5 } },
  { id: 'bosphorus', name: 'Bosphorus', short: 'Bosphorus', box: { south: 40.97, west: 28.95, north: 41.25, east: 29.17 } },
  { id: 'gibraltar', name: 'Strait of Gibraltar', short: 'Gibraltar', box: { south: 35.8, west: -6.0, north: 36.2, east: -5.3 } },
  { id: 'dover', name: 'Dover Strait', short: 'Dover', box: { south: 50.8, west: 1.1, north: 51.2, east: 1.9 } },
  { id: 'panama', name: 'Panama Canal', short: 'Panama', box: { south: 8.85, west: -79.95, north: 9.4, east: -79.5 } },
];

export interface ChokepointCount {
  ships: number;
  /** Under way: faster than about 2 knots. Ships at anchor waiting to transit count, but not as moving. */
  moving: number;
}

const MOVING_MPS = 1;

/**
 * Ships in each chokepoint now, from live (not stale) tracks. Only as good
 * as AIS coverage there: AISStream's receivers are mostly in Europe, so a
 * low count far away may mean few receivers, not few ships.
 */
export function chokepointCounts(tracks: Iterable<Track>, isLive: (t: Track) => boolean): Map<string, ChokepointCount> {
  const counts = new Map<string, ChokepointCount>(CHOKEPOINTS.map((c) => [c.id, { ships: 0, moving: 0 }]));
  for (const t of tracks) {
    if (t.domain !== 'sea') continue;
    const point = CHOKEPOINTS.find((c) => inBBox(t, c.box));
    if (!point || !isLive(t)) continue;
    const count = counts.get(point.id)!;
    count.ships++;
    if (t.speedMps > MOVING_MPS) count.moving++;
  }
  return counts;
}

export function centreOf(box: BBox): [number, number] {
  return [(box.west + box.east) / 2, (box.south + box.north) / 2];
}
