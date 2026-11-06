/** What an aircraft's height is doing, judged from its reports. */
export type Climb = 'climbing' | 'descending' | 'level';

/** Vertical speed that counts as climbing or descending: 2.5 m/s, about 500 ft a minute. */
export const CLIMB_MPS = 2.5;

/**
 * Reports closer together than this aren't compared. Altitude arrives in
 * 25 ft steps, so over a second or two a level aircraft would look as if it
 * were climbing or descending at several metres a second.
 */
const MIN_GAP_MS = 8_000;
/** Reports further apart than this start over: too much can happen in between. */
const MAX_GAP_MS = 180_000;
/** A feed switching between barometric and geometric altitude can jump hundreds of metres at once. */
const MAX_RATE_MPS = 40;

interface Anchor {
  altitudeM: number;
  observedAt: number;
  rateMps?: number;
  seenAt: number;
}

/**
 * Vertical speed per aircraft, worked out in the browser from successive
 * altitude reports. Tracks don't carry one: the feeds' rates aren't on the
 * wire, and adding them would change the protocol for every client, when
 * two reports of the same aircraft already say it.
 */
export class ClimbRates {
  private readonly anchors = new Map<string, Anchor>();

  /** The latest report of one aircraft; `now` is when it was looked at, for pruning. */
  observe(id: string, altitudeM: number | undefined, observedAt: number, now: number): void {
    if (altitudeM === undefined) return;
    const anchor = this.anchors.get(id);
    if (!anchor) {
      this.anchors.set(id, { altitudeM, observedAt, seenAt: now });
      return;
    }
    anchor.seenAt = now;
    const gapMs = observedAt - anchor.observedAt;
    if (gapMs < MIN_GAP_MS) return;
    if (gapMs > MAX_GAP_MS) {
      this.anchors.set(id, { altitudeM, observedAt, seenAt: now });
      return;
    }
    const raw = Math.max(-MAX_RATE_MPS, Math.min(MAX_RATE_MPS, (altitudeM - anchor.altitudeM) / (gapMs / 1000)));
    // Half the old estimate and half the new: one odd report can't flip it.
    const rateMps = anchor.rateMps === undefined ? raw : (anchor.rateMps + raw) / 2;
    this.anchors.set(id, { altitudeM, observedAt, rateMps, seenAt: now });
  }

  /** Metres a second, up positive; undefined until two reports far enough apart. */
  rateOf(id: string): number | undefined {
    return this.anchors.get(id)?.rateMps;
  }

  climbOf(id: string): Climb {
    const rate = this.rateOf(id) ?? 0;
    return rate > CLIMB_MPS ? 'climbing' : rate < -CLIMB_MPS ? 'descending' : 'level';
  }

  /** Forget aircraft not looked at for a while: they left the view, or the picture. */
  prune(now: number, maxAgeMs = 300_000): void {
    for (const [id, anchor] of this.anchors) if (now - anchor.seenAt > maxAgeMs) this.anchors.delete(id);
  }

  get size(): number {
    return this.anchors.size;
  }
}
