import { distanceM, type Domain, type Track, type TrailPoint } from '@watchfloor/shared';

/**
 * How much of a track's path to keep, and how finely.
 *
 * - windowMs:    points older than this are dropped (a long-haul flight, a day at sea).
 * - toleranceM:  a point can go if the line around it passes within this distance.
 * - maxGapMs:    but never leave more than this between kept points, so the
 *                path still says when it was where.
 * - minSpacingM: reports closer than this to the last one add nothing (a moored ship).
 * - maxPoints:   a hard cap per track; the oldest go first.
 */
export interface PathRule {
  windowMs: number;
  toleranceM: number;
  maxGapMs: number;
  minSpacingM: number;
  maxPoints: number;
}

export const DEFAULT_PATH_RULES: Record<Domain, PathRule> = {
  air: { windowMs: 12 * 3_600_000, toleranceM: 300, maxGapMs: 5 * 60_000, minSpacingM: 200, maxPoints: 1500 },
  sea: { windowMs: 24 * 3_600_000, toleranceM: 30, maxGapMs: 15 * 60_000, minSpacingM: 25, maxPoints: 1500 },
};

interface Entry {
  domain: Domain;
  /** Flat [lon, lat, t, lon, lat, t, ...]: a third of the memory of tuples, for ~1M points worldwide. */
  data: number[];
  /** Altitude at the first point, if known: a path that starts low began near takeoff. */
  firstAltitudeM?: number;
  /**
   * Earlier history from elsewhere: 'opensky' once merged in, 'none' once
   * asked for and not found; unset until asked. Either way, don't ask again.
   */
  backfill?: Backfill;
}

export type Backfill = 'opensky' | 'none';

export interface SavedPathEntry {
  points: readonly TrailPoint[];
  backfill?: Backfill;
}

/**
 * Where each track has been for the last several hours, thinned as it grows.
 *
 * Unlike the five-minute trails, this isn't sent to every browser: a browser
 * asks for one track's path when it selects it. Thinning is online: the newest
 * report is always the last point, and when the next one arrives, the previous
 * last point is dropped if the straight line past it stays within tolerance.
 * A cruising jet then costs a point every few minutes; a holding pattern keeps
 * its turns.
 */
export class PathHistory {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly rules: Record<Domain, PathRule> = DEFAULT_PATH_RULES) {}

  get size(): number {
    return this.entries.size;
  }

  /** Total points held, for /healthz. */
  get points(): number {
    let n = 0;
    for (const e of this.entries.values()) n += e.data.length / 3;
    return n;
  }

  get(id: string): TrailPoint[] {
    const data = this.entries.get(id)?.data;
    if (!data) return [];
    const out: TrailPoint[] = [];
    for (let i = 0; i < data.length; i += 3) out.push([data[i]!, data[i + 1]!, data[i + 2]!]);
    return out;
  }

  info(id: string): { firstAltitudeM?: number; backfill?: Backfill } | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    return {
      ...(e.firstAltitudeM === undefined ? {} : { firstAltitudeM: e.firstAltitudeM }),
      ...(e.backfill === undefined ? {} : { backfill: e.backfill }),
    };
  }

  record(track: Track): void {
    let entry = this.entries.get(track.id);
    if (!entry) {
      entry = { domain: track.domain, data: [] };
      if (track.altitudeM !== undefined) entry.firstAltitudeM = track.altitudeM;
      this.entries.set(track.id, entry);
    }
    const rule = this.rules[entry.domain];
    const d = entry.data;
    const n = d.length / 3;
    const next: TrailPoint = [round(track.lon), round(track.lat), track.observedAt];
    if (n > 0) {
      const tail: TrailPoint = [d[d.length - 3]!, d[d.length - 2]!, d[d.length - 1]!];
      if (next[2] <= tail[2]) return; // never backwards in time
      if (distanceM(lonLat(tail), lonLat(next)) < rule.minSpacingM) return;
      if (n > 1) {
        const kept: TrailPoint = [d[d.length - 6]!, d[d.length - 5]!, d[d.length - 4]!];
        if (next[2] - kept[2] <= rule.maxGapMs && redundant(kept, tail, next, rule.toleranceM)) {
          d.length -= 3; // the old tail adds nothing the new line doesn't show
        }
      }
    }
    d.push(next[0], next[1], next[2]);
    if (d.length / 3 > rule.maxPoints) d.splice(0, 3);
  }

  /**
   * Put earlier history (from another source) in front of what we have. Only
   * points older than our first are used, so ours win where both exist.
   */
  prepend(id: string, earlier: readonly TrailPoint[], source: Exclude<Backfill, 'none'>): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const first = entry.data[2] ?? Infinity;
    const before = earlier.filter((p) => p[2] < first).sort((a, b) => a[2] - b[2]);
    // Nothing older than ours: we've been watching since takeoff.
    entry.backfill = before.length > 0 ? source : 'none';
    if (before.length === 0) return;
    const room = Math.max(0, this.rules[entry.domain].maxPoints - entry.data.length / 3);
    const flat = before.slice(-room).flatMap((p) => [round(p[0]), round(p[1]), p[2]]);
    entry.data.unshift(...flat);
  }

  /** Remember that earlier history was asked for and there wasn't any. */
  markNoBackfill(id: string): void {
    const entry = this.entries.get(id);
    if (entry) entry.backfill = 'none';
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  /** Drop points older than each domain's window; the newest always stays. */
  prune(now: number): void {
    for (const entry of this.entries.values()) {
      const cutoff = now - this.rules[entry.domain].windowMs;
      const d = entry.data;
      let drop = 0;
      while (drop < d.length - 3 && d[drop + 2]! < cutoff) drop += 3;
      if (drop > 0) d.splice(0, drop);
    }
  }

  /** For saving: points per id, and where any earlier part came from. */
  toRecord(ids: Iterable<string>): Record<string, SavedPathEntry> {
    const out: Record<string, SavedPathEntry> = {};
    for (const id of ids) {
      const e = this.entries.get(id);
      if (e && e.data.length > 0) out[id] = { points: this.get(id), ...(e.backfill ? { backfill: e.backfill } : {}) };
    }
    return out;
  }

  /** Restore saved paths for tracks that exist; replaces whatever ingest recorded for them. */
  load(saved: Record<string, SavedPathEntry>, tracks: Iterable<Track>): void {
    for (const track of tracks) {
      const s = saved[track.id];
      if (!s || s.points.length === 0) continue;
      const points = [...s.points].sort((a, b) => a[2] - b[2]).slice(-this.rules[track.domain].maxPoints);
      const entry: Entry = { domain: track.domain, data: points.flatMap((p) => [round(p[0]), round(p[1]), p[2]]) };
      if (s.backfill) entry.backfill = s.backfill;
      this.entries.set(track.id, entry);
    }
  }
}

function round(deg: number): number {
  return Math.round(deg * 1e5) / 1e5;
}

function lonLat(p: TrailPoint): { lon: number; lat: number } {
  return { lon: p[0], lat: p[1] };
}

/**
 * Whether `mid` lies on the line from `a` to `b`, within tolerance, and between
 * them (a track that doubled back must keep its turning point). A local flat
 * projection is plenty for segments of a few minutes' travel.
 */
export function redundant(a: TrailPoint, mid: TrailPoint, b: TrailPoint, toleranceM: number): boolean {
  const k = Math.cos((a[1] * Math.PI) / 180) * 111_320;
  const dx = (lon: number) => {
    let d = lon - a[0];
    if (d > 180) d -= 360; // across the antimeridian
    if (d < -180) d += 360;
    return d * k;
  };
  const bx = dx(b[0]);
  const by = (b[1] - a[1]) * 110_540;
  const mx = dx(mid[0]);
  const my = (mid[1] - a[1]) * 110_540;
  const len = Math.hypot(bx, by);
  if (len === 0) return Math.hypot(mx, my) <= toleranceM;
  const along = (mx * bx + my * by) / len;
  const across = Math.abs(mx * by - my * bx) / len;
  return across <= toleranceM && along >= -toleranceM && along <= len + toleranceM;
}
