/**
 * How long an alert card stays before leaving by itself. Long enough to read
 * twice; short enough that the corner never fills up (cards used to stay
 * five minutes, and closing a pile of them one by one was a chore). Nothing
 * is lost when a card goes: the map keeps its marker, and the handover log,
 * the watch-area log and the Rare tab keep the event.
 */
export const ALERT_LIFE_MS = 10_000;

/**
 * A squawk's card stays longer, then folds into the top bar's amber chip,
 * which stays while the code is broadcast and brings the card back.
 */
export const SQUAWK_LIFE_MS = 30_000;

/** A card being read (pointer over it, focus in it) gets at least this long again once let go. */
export const LINGER_MS = 4_000;

/**
 * When each alert card is due to leave. Pure: the caller passes the time, so
 * the rules are tested without a page or timers. A card held by the reader
 * never runs out under them, and while the page is out of sight nobody's
 * clock runs (cards that arrived meanwhile are still there on return).
 */
export class AlertLives {
  private readonly ends = new Map<string, number>();
  private pausedAt: number | undefined;

  constructor(private readonly lifeMs: number) {}

  get size(): number {
    return this.ends.size;
  }

  /** A card appears (or comes back): its full life from now. */
  start(id: string, now: number): void {
    this.ends.set(id, now + this.lifeMs);
  }

  /** The reader is on it: it won't leave until `LINGER_MS` after they let go. */
  hold(id: string, now: number): void {
    const end = this.ends.get(id);
    if (end !== undefined) this.ends.set(id, Math.max(end, now + LINGER_MS));
  }

  /** The card went some other way (closed, shown, replaced). */
  forget(id: string): void {
    this.ends.delete(id);
  }

  /** The page went out of sight: every clock stops. */
  pause(now: number): void {
    this.pausedAt ??= now;
  }

  /** Back in sight: every clock resumes where it stopped. */
  resume(now: number): void {
    if (this.pausedAt === undefined) return;
    const away = now - this.pausedAt;
    for (const [id, end] of this.ends) this.ends.set(id, end + away);
    this.pausedAt = undefined;
  }

  /** The cards whose time is up, oldest first; each is forgotten as it's returned. */
  due(now: number): string[] {
    if (this.pausedAt !== undefined) return [];
    const out: string[] = [];
    for (const [id, end] of this.ends) {
      if (now < end) continue;
      out.push(id);
      this.ends.delete(id);
    }
    return out;
  }
}
