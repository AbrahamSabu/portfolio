import type { PathBackfill, PathMessage, Track, TrailPoint } from '@watchfloor/shared';

/**
 * The selected track's longer path: hours of history the server sends when a
 * track is selected (and again if OpenSky fills in the start of the flight),
 * extended here from each delta so it reaches the track as it moves.
 */
export class SelectedPath {
  private trackId: string | null = null;
  private pts: TrailPoint[] = [];
  private source: PathBackfill = 'none';
  /** True once the server has answered for the current track. */
  private answered = false;
  private readonly listeners = new Set<() => void>();

  get id(): string | null {
    return this.trackId;
  }

  get points(): readonly TrailPoint[] {
    return this.pts;
  }

  get backfill(): PathBackfill {
    return this.source;
  }

  get loaded(): boolean {
    return this.answered;
  }

  /** Start over for a new selection (or none); the caller asks the server. */
  select(id: string | null): void {
    if (id === this.trackId) return;
    this.trackId = id;
    this.pts = [];
    this.source = 'none';
    this.answered = false;
    this.notify();
  }

  /** Take the server's answer, keeping any newer points that arrived in deltas meanwhile. */
  load(message: PathMessage): void {
    if (message.id !== this.trackId) return; // an answer for a track no longer selected
    const last = message.points.at(-1)?.[2] ?? -Infinity;
    this.pts = [...message.points, ...this.pts.filter((p) => p[2] > last)];
    this.source = message.backfill;
    this.answered = true;
    this.notify();
  }

  /** Extend from a delta's upserts. */
  extend(upserts: readonly Track[]): void {
    if (!this.trackId) return;
    const track = upserts.find((t) => t.id === this.trackId);
    if (!track || track.observedAt <= (this.pts.at(-1)?.[2] ?? -Infinity)) return;
    this.pts.push([track.lon, track.lat, track.observedAt]);
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Split a path into stretches with reports and the gaps between them, where
 * the line is only a guess. A gap is a pause longer than `gapMs` between
 * points (no coverage over an ocean, say). Each piece is a list of [lon, lat].
 */
export function splitAtGaps(
  points: readonly TrailPoint[],
  gapMs: number,
): { solid: [number, number][][]; gaps: [number, number][][] } {
  const solid: [number, number][][] = [];
  const gaps: [number, number][][] = [];
  let run: [number, number][] = [];
  let previous: [number, number] | null = null;
  points.forEach((p, i) => {
    // Keep the line continuous across the antimeridian: shift by 360° when
    // that's the shorter way, as MapLibre draws longitudes past ±180.
    let lon = p[0];
    if (previous) {
      while (lon - previous[0] > 180) lon -= 360;
      while (lon - previous[0] < -180) lon += 360;
    }
    const here: [number, number] = [lon, p[1]];
    if (previous && p[2] - points[i - 1]![2] > gapMs) {
      if (run.length > 1) solid.push(run);
      gaps.push([previous, here]);
      run = [];
    }
    run.push(here);
    previous = here;
  });
  if (run.length > 1) solid.push(run);
  return { solid, gaps };
}
