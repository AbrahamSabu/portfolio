import { DEFAULT_STALENESS, trackStatus, type StalenessRules, type Track, type TrackStatus } from '@watchfloor/shared';

type Listener = () => void;

/**
 * The browser's copy of the picture. Mirrors the server: replaced wholesale
 * by a snapshot, then patched by deltas. Views subscribe to changes.
 */
export class TrackStore {
  private readonly tracks = new Map<string, Track>();
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

  status(track: Track, now: number): TrackStatus {
    return trackStatus(now - track.observedAt, this.rules[track.domain]);
  }

  applySnapshot(tracks: Track[]): void {
    this.tracks.clear();
    for (const t of tracks) this.tracks.set(t.id, t);
    this.emit();
  }

  applyDelta(upserts: Track[], removals: string[]): void {
    if (upserts.length === 0 && removals.length === 0) return;
    for (const t of upserts) this.tracks.set(t.id, t);
    for (const id of removals) this.tracks.delete(id);
    this.emit();
  }

  clear(): void {
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
