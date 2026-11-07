import { DEFAULT_TRAIL_RULES, type Track } from '@watchfloor/shared';

/** Closer together than this, a new sample replaces the newest instead of adding one. */
const MIN_GAP_MS = 10_000;
/** Steps smaller than this count as level flight (altitude is reported in 25 ft steps, about 8 m). */
const LEVEL_M = 8;

/**
 * How high each aircraft has been over the last few minutes, so the Stack can
 * draw its trail at the height it was flown. Trails keep only [lon, lat, t]
 * (that's all the wire carries), so each trail point is lifted to the altitude
 * recorded here for that moment.
 *
 * Recording starts with the page, from each new report. It stays small: one
 * sample per 10 s at most, and a level stretch is two samples however long it
 * lasts. Times are report times (`observedAt`), the clock the trail points use.
 * Before an aircraft's first sample its altitude is unknown, and `at()` says so
 * rather than guessing, so the Stack never invents a climb or a descent.
 */
export class AltitudeHistory {
  /** Per aircraft: [t0, alt0, t1, alt1, …], oldest first. */
  private readonly samples = new Map<string, number[]>();

  constructor(private readonly windowMs = DEFAULT_TRAIL_RULES.air.windowMs) {}

  get size(): number {
    return this.samples.size;
  }

  record(id: string, t: number, altM: number): void {
    if (!Number.isFinite(t) || !Number.isFinite(altM)) return;
    const s = this.samples.get(id);
    if (!s) {
      this.samples.set(id, [t, altM]);
      return;
    }
    const n = s.length;
    if (t <= s[n - 2]!) return; // already have this report (or an older one)
    if (n >= 4) {
      const prevT = s[n - 4]!;
      const prevAlt = s[n - 3]!;
      const lastAlt = s[n - 1]!;
      // Moving the newest sample forward keeps the line from the previous one:
      // exact for level flight and for a steady climb, and it bounds the count.
      const level = Math.abs(lastAlt - prevAlt) < LEVEL_M && Math.abs(altM - lastAlt) < LEVEL_M;
      if (level || t - prevT < MIN_GAP_MS) {
        s[n - 2] = t;
        s[n - 1] = altM;
        return;
      }
    }
    s.push(t, altM);
  }

  /** Each aircraft's newest report. Cheap to call on every store change: reports already seen add nothing. */
  recordAll(tracks: Iterable<Track>): void {
    for (const track of tracks) {
      if (track.domain === 'air' && track.altitudeM !== undefined) this.record(track.id, track.observedAt, track.altitudeM);
    }
  }

  /**
   * Forget what's older than the window, keeping one sample before it so the
   * oldest trail points still interpolate. Aircraft no longer `alive`, or not
   * heard from for a whole window, are dropped.
   */
  prune(now: number, alive: (id: string) => boolean = () => true): void {
    const cutoff = now - this.windowMs;
    for (const [id, s] of this.samples) {
      if (!alive(id) || s[s.length - 2]! < cutoff) {
        this.samples.delete(id);
        continue;
      }
      let drop = 0;
      while (drop + 2 < s.length && s[drop + 2]! <= cutoff) drop += 2;
      if (drop > 0) s.splice(0, drop);
    }
  }

  /** Altitude at time `t` (m): interpolated, the newest after the last sample, undefined before the first. */
  at(id: string, t: number): number | undefined {
    const s = this.samples.get(id);
    if (!s || t < s[0]!) return undefined;
    for (let i = s.length - 2; i >= 0; i -= 2) {
      const ti = s[i]!;
      if (t < ti) continue;
      if (i === s.length - 2) return s[i + 1]!;
      const tj = s[i + 2]!;
      const ai = s[i + 1]!;
      return ai + ((s[i + 3]! - ai) * (t - ti)) / (tj - ti);
    }
    return undefined;
  }

  /** When this aircraft's altitude was first known (its oldest sample), if it is. */
  since(id: string): number | undefined {
    return this.samples.get(id)?.[0];
  }

  /** How many samples one aircraft has (for tests and measuring). */
  sampleCount(id: string): number {
    return (this.samples.get(id)?.length ?? 0) / 2;
  }
}
