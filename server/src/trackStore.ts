import {
  sanitizeTrack,
  TrailHistory,
  ruleFor,
  type Platform,
  type StalenessRules,
  type Track,
  type TrailPoint,
  type TrailRules,
} from '@watchfloor/shared';

export interface StoreChanges {
  upserts: Track[];
  removals: string[];
}

/** Reports stamped further ahead than this are treated as clock errors and rejected. */
const MAX_FUTURE_MS = 30_000;

/**
 * The server's single source of truth for the current picture.
 *
 * Feeds can report hundreds of times a second, but browsers only need a
 * consolidated update once per tick. So the store records *which* tracks
 * changed (dirty / removed sets) and `flush()` hands back just those,
 * coalescing many reports for one track into its latest state.
 *
 * It also keeps each track's recent trail. Deltas only carry the latest
 * state, but the trail records every accepted report, so a browser that
 * connects later still gets the full history in its snapshot.
 */
export class TrackStore {
  private readonly tracks = new Map<string, Track>();
  private readonly dirty = new Set<string>();
  private readonly removed = new Set<string>();
  private readonly trails: TrailHistory;
  private rejectedCount = 0;

  constructor(
    private readonly staleness: StalenessRules,
    trailRules?: TrailRules,
  ) {
    this.trails = new TrailHistory(trailRules);
  }

  get size(): number {
    return this.tracks.size;
  }

  get rejected(): number {
    return this.rejectedCount;
  }

  get(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  /** Validate and store a report. Returns true if it changed the picture. */
  ingest(report: unknown, now = Date.now()): boolean {
    const track = sanitizeTrack(report);
    if (!track) {
      this.rejectedCount++;
      return false;
    }
    if (track.observedAt > now + MAX_FUTURE_MS) {
      this.rejectedCount++;
      return false;
    }
    // Too old to be worth showing at all.
    if (now - track.observedAt > ruleFor(track, this.staleness).dropAfterMs) return false;

    // Reports can arrive out of order (network, feed batching). Never go backwards.
    const existing = this.tracks.get(track.id);
    if (existing && existing.observedAt >= track.observedAt) return false;
    if (existing) keepKnownIdentity(track, existing);

    this.tracks.set(track.id, track);
    this.trails.record(track);
    this.dirty.add(track.id);
    this.removed.delete(track.id);
    return true;
  }

  /**
   * Seed the store with a picture saved before a restart. Every track goes
   * through ingest(), so anything invalid or past its drop window stays out,
   * and trails are kept only for tracks that made it in.
   */
  restore(tracks: unknown[], trails: Record<string, TrailPoint[]>, now = Date.now()): number {
    let restored = 0;
    for (const track of tracks) if (this.ingest(track, now)) restored++;
    // A saved trail replaces the single point ingest() just recorded; without one, that point stays.
    this.trails.load({ ...this.trails.toRecord(), ...trails }, this.tracks.values());
    this.trails.prune(now);
    return restored;
  }

  remove(id: string): boolean {
    if (!this.tracks.delete(id)) return false;
    this.trails.remove(id);
    this.dirty.delete(id);
    this.removed.add(id);
    return true;
  }

  /**
   * Drop tracks that haven't reported within their domain's window, and trail
   * points older than the trail window. Returns how many tracks went.
   */
  prune(now = Date.now()): number {
    let count = 0;
    for (const [id, track] of this.tracks) {
      if (now - track.observedAt > ruleFor(track, this.staleness).dropAfterMs) {
        this.remove(id);
        count++;
      }
    }
    this.trails.prune(now);
    return count;
  }

  snapshot(): Track[] {
    return Array.from(this.tracks.values());
  }

  /** Recent history for every current track, keyed by id. */
  trailSnapshot(): Record<string, TrailPoint[]> {
    return this.trails.toRecord();
  }

  /** Everything that changed since the previous flush, then reset. */
  flush(): StoreChanges {
    const upserts: Track[] = [];
    for (const id of this.dirty) {
      const track = this.tracks.get(id);
      if (track) upserts.push(track);
    }
    const removals = Array.from(this.removed);
    this.dirty.clear();
    this.removed.clear();
    return { upserts, removals };
  }
}

/** Platforms that only say "it flies" or "it floats". */
const GENERIC_PLATFORMS: ReadonlySet<Platform> = new Set(['aircraft', 'vessel']);

/**
 * Several feeds can report the same track (two ADS-B providers, say), and they
 * don't all send the same fields. A newer report brings the newest position,
 * but it shouldn't erase who the track is: keep a known callsign the new
 * report lacks, and don't let a generic platform replace a specific one, or
 * symbols and labels would flicker between providers. Kinematics (position,
 * altitude, speed) always come from the newest report: an old value is worse
 * than none.
 */
function keepKnownIdentity(track: Track, existing: Track): void {
  if (track.callsign === undefined && existing.callsign !== undefined) track.callsign = existing.callsign;
  if (GENERIC_PLATFORMS.has(track.platform) && !GENERIC_PLATFORMS.has(existing.platform)) {
    track.platform = existing.platform;
  }
}

