import { sanitizeTrack, type StalenessRules, type Track } from '@watchfloor/shared';

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
 */
export class TrackStore {
  private readonly tracks = new Map<string, Track>();
  private readonly dirty = new Set<string>();
  private readonly removed = new Set<string>();
  private rejectedCount = 0;

  constructor(private readonly staleness: StalenessRules) {}

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
    if (now - track.observedAt > this.staleness[track.domain].dropAfterMs) return false;

    // Reports can arrive out of order (network, feed batching). Never go backwards.
    const existing = this.tracks.get(track.id);
    if (existing && existing.observedAt >= track.observedAt) return false;

    this.tracks.set(track.id, track);
    this.dirty.add(track.id);
    this.removed.delete(track.id);
    return true;
  }

  remove(id: string): boolean {
    if (!this.tracks.delete(id)) return false;
    this.dirty.delete(id);
    this.removed.add(id);
    return true;
  }

  /** Drop tracks that haven't reported within their domain's window. Returns how many went. */
  prune(now = Date.now()): number {
    let count = 0;
    for (const [id, track] of this.tracks) {
      if (now - track.observedAt > this.staleness[track.domain].dropAfterMs) {
        this.remove(id);
        count++;
      }
    }
    return count;
  }

  snapshot(): Track[] {
    return Array.from(this.tracks.values());
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
