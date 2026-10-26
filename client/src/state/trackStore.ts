import {
  DEFAULT_STALENESS,
  TrailHistory,
  trackStatus,
  type StalenessRules,
  type Track,
  type TrackStatus,
  type TrailPoint,
} from '@watchfloor/shared';

type Listener = () => void;

/**
 * The browser's copy of the picture. Mirrors the server: replaced wholesale
 * by a snapshot, then patched by deltas. Views subscribe to changes.
 *
 * Trails start from the server's history in the snapshot and are extended
 * from each delta's upserts, using the same TrailHistory rules as the server.
 */
export class TrackStore {
  private readonly tracks = new Map<string, Track>();
  private readonly trails = new TrailHistory();
  private readonly listeners = new Set<Listener>();
  private rules: StalenessRules = DEFAULT_STALENESS;

  get size(): number {
    return this.tracks.size;
  }

  get staleness(): StalenessRules {
    return this.rules;
  }

  setStaleness(rules: StalenessRules): void {
    this.rules = rules;
  }

  get(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  all(): IterableIterator<Track> {
    return this.tracks.values();
  }

  /** Reported positions for a track, oldest first. Empty if it has none. */
  trail(id: string): readonly TrailPoint[] {
    return this.trails.get(id);
  }

  status(track: Track, now: number): TrackStatus {
    return trackStatus(now - track.observedAt, this.rules[track.domain]);
  }

  applySnapshot(tracks: Track[], trails: Record<string, TrailPoint[]>): void {
    this.tracks.clear();
    for (const t of tracks) this.tracks.set(t.id, t);
    this.trails.load(trails, tracks);
    this.emit();
  }

  /** `serverTime` ages out old trail points, even on ticks where nothing else changed. */
  applyDelta(upserts: Track[], removals: string[], serverTime: number): void {
    this.trails.prune(serverTime);
    if (upserts.length === 0 && removals.length === 0) return;
    for (const t of upserts) {
      this.tracks.set(t.id, t);
      this.trails.record(t);
    }
    for (const id of removals) {
      this.tracks.delete(id);
      this.trails.remove(id);
    }
    this.emit();
  }

  clear(): void {
    this.trails.clear();
    if (this.tracks.size === 0) return;
    this.tracks.clear();
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
