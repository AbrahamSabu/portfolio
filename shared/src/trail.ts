import { distanceM } from './geo';
import type { Domain, Track } from './track';

/**
 * Where a track has actually been reported, oldest first.
 *
 * Points are `[lon, lat, observedAt]` tuples rather than objects: they go in
 * the snapshot for every track, and tuples keep that payload small. Lon comes
 * first to match GeoJSON, so the client can draw them almost as-is.
 */
export type TrailPoint = [lon: number, lat: number, observedAt: number];

/**
 * How much history to keep per domain.
 *
 * - windowMs:    points older than this are dropped.
 * - minSpacingM: a report closer than this to the previous point adds nothing
 *                visible, so it's skipped. This keeps fast-reporting feeds
 *                from filling the buffer with near-duplicates.
 *
 * Ships are slow, so they get a longer window (otherwise their trails are a
 * few pixels long) and a finer spacing.
 */
export interface TrailRule {
  windowMs: number;
  minSpacingM: number;
}

export type TrailRules = Record<Domain, TrailRule>;

export const DEFAULT_TRAIL_RULES: TrailRules = {
  air: { windowMs: 5 * 60_000, minSpacingM: 200 },
  sea: { windowMs: 30 * 60_000, minSpacingM: 50 },
};

interface Entry {
  domain: Domain;
  points: TrailPoint[];
}

/**
 * Recent position history for every track.
 *
 * The server keeps one so a newly connected browser gets full trails in its
 * snapshot instead of starting empty. The browser keeps one too, seeded from
 * the snapshot and extended from each delta. Both use this class, so they
 * thin and expire points the same way.
 */
export class TrailHistory {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly rules: TrailRules = DEFAULT_TRAIL_RULES) {}

  get size(): number {
    return this.entries.size;
  }

  get(id: string): readonly TrailPoint[] {
    return this.entries.get(id)?.points ?? [];
  }

  /** Add a track's reported position. Returns true if a point was kept. */
  record(track: Track): boolean {
    let entry = this.entries.get(track.id);
    if (!entry) {
      entry = { domain: track.domain, points: [] };
      this.entries.set(track.id, entry);
    }
    const last = entry.points.at(-1);
    if (last) {
      // Never go backwards in time: out-of-order reports would zig-zag the line.
      if (track.observedAt <= last[2]) return false;
      const moved = distanceM({ lon: last[0], lat: last[1] }, track);
      if (moved < this.rules[track.domain].minSpacingM) return false;
    }
    entry.points.push([track.lon, track.lat, track.observedAt]);
    return true;
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  /**
   * Drop points older than each domain's window. The newest point always
   * stays, so a track that's stopped moving still has somewhere to draw from.
   */
  prune(now: number): void {
    for (const entry of this.entries.values()) {
      const cutoff = now - this.rules[entry.domain].windowMs;
      const points = entry.points;
      let drop = 0;
      while (drop < points.length - 1 && points[drop]![2] < cutoff) drop++;
      if (drop > 0) points.splice(0, drop);
    }
  }

  /** Plain-object form for the snapshot message. */
  toRecord(): Record<string, TrailPoint[]> {
    const out: Record<string, TrailPoint[]> = {};
    for (const [id, entry] of this.entries) out[id] = entry.points;
    return out;
  }

  /**
   * Replace everything with history received in a snapshot. Domains come from
   * the snapshot's tracks; trails for unknown tracks are ignored.
   */
  load(trails: Record<string, TrailPoint[]>, tracks: Iterable<Track>): void {
    this.entries.clear();
    for (const track of tracks) {
      const points = trails[track.id];
      if (points) this.entries.set(track.id, { domain: track.domain, points: [...points] });
    }
  }
}
