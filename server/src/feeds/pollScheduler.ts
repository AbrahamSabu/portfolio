import type { FeedStatus } from '@watchfloor/shared';
import type { Logger } from '../log';

/** What a polled feed tells the scheduler. */
export interface PollHooks {
  /** Poll once and push the results. Returns ms until the next poll. Must not throw. */
  run(): Promise<number>;
  /** Someone is watching and there is something to poll. */
  isActive(): boolean;
  /** The last successful poll doesn't cover what's wanted now, so the next one should come early. */
  wantsEarlyPoll(): boolean;
  /** In a backoff or a provider-imposed wait, which an early poll must never cut short. */
  isWaiting(): boolean;
  /** What's about to be polled, for the log. */
  describe(): string;
}

export interface PollSchedulerOptions {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  log: Logger;
  /** Wait until views stop changing for this long, so a multi-step pan or zoom costs one poll. */
  settleMs?: number;
  /** Early polls never come sooner than this after the last attempt. */
  minEarlyGapMs?: number;
}

/**
 * When to poll, for feeds that poll a paid or rate-limited API. Shared so the
 * subtle parts are written and tested once:
 *
 * - Nobody watching: skip the next due poll and stop rescheduling. The pending
 *   timer doubles as a grace period, so a page reload never pauses polling.
 * - Resuming polls at the time already scheduled (nextDueAt), never sooner, so
 *   reconnect storms can't spend credits, and backoff and 429 waits survive.
 * - When the wanted area moves off what was polled, the next poll comes early.
 *   It's a debounce: a pending early poll moves later while things keep
 *   changing, but never past the regular poll it replaced, never into a wait,
 *   and never within minEarlyGapMs of the last attempt. If the wanted area
 *   goes back to what was polled, the regular schedule returns.
 */
export class PollScheduler {
  private readonly settleMs: number;
  private readonly minEarlyGapMs: number;
  private running = false;
  private timer: unknown = null;
  /** True when a due poll was skipped for lack of viewers and no timer is pending. */
  private isPaused = false;
  /** When the next poll is (or was) due; resuming never polls before this. */
  private nextDueAt = 0;
  /** When an early poll is pending: when the regular poll it replaced was due. */
  private regularDueAt: number | null = null;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly hooks: PollHooks,
    private readonly opts: PollSchedulerOptions,
  ) {
    this.settleMs = opts.settleMs ?? 2_000;
    this.minEarlyGapMs = opts.minEarlyGapMs ?? 10_000;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** When the pending poll will run, or null if none is pending. */
  get nextPollAt(): number | null {
    return this.timer === null ? null : this.nextDueAt;
  }

  start(): void {
    this.running = true;
    if (this.hooks.isActive()) {
      this.schedule(0);
    } else {
      this.nextDueAt = this.opts.now();
      this.isPaused = true;
      this.opts.log.info('no viewers yet; polling starts when a browser connects');
    }
  }

  stop(): void {
    this.running = false;
    this.isPaused = false;
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = null;
  }

  /** Call when demand or the wanted area changed. */
  refresh(): void {
    if (!this.running) return;
    if (this.isPaused) this.resume();
    else this.maybePollEarly();
  }

  private resume(): void {
    if (!this.hooks.isActive()) return;
    this.isPaused = false;
    const delay = Math.max(0, this.nextDueAt - this.opts.now());
    this.opts.log.info('polling resumed', { nextPollInS: Math.round(delay / 1000) });
    this.schedule(delay);
  }

  private maybePollEarly(): void {
    if (this.timer === null || !this.hooks.isActive() || this.hooks.isWaiting()) return;
    const now = this.opts.now();
    const regular = this.regularDueAt ?? this.nextDueAt;

    if (!this.hooks.wantsEarlyPoll()) {
      if (this.regularDueAt === null) return;
      this.opts.clearTimer(this.timer);
      this.regularDueAt = null;
      this.schedule(Math.max(0, regular - now)); // back to the regular poll
      return;
    }

    const due = Math.max(now + this.settleMs, this.lastAttemptAt + this.minEarlyGapMs);
    if (due >= regular) return;
    this.opts.clearTimer(this.timer);
    if (this.regularDueAt === null) {
      this.opts.log.info('view moved off the polled area; polling early', { area: this.hooks.describe() });
    }
    this.regularDueAt = regular;
    this.schedule(due - now);
  }

  private schedule(ms: number): void {
    this.nextDueAt = this.opts.now() + ms;
    this.timer = this.opts.setTimer(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    this.regularDueAt = null;
    if (!this.running) return; // stopped while the timer was pending
    if (!this.hooks.isActive()) {
      // Leave nextDueAt as it is: the poll is overdue, so a returning viewer gets one at once.
      this.isPaused = true;
      // Inactive means no viewers, or (for feeds that follow views) nothing in view to cover.
      this.opts.log.info('nothing to poll (no viewers, or no view this feed covers); paused');
      return;
    }
    this.lastAttemptAt = this.opts.now();
    const delay = await this.hooks.run();
    if (!this.running) return;
    this.schedule(delay);
    // What's wanted may have moved while the request was in flight.
    this.maybePollEarly();
  }
}

/** What a polled feed knows about itself, for polledFeedStatus(). */
export interface PolledStatusInput {
  now: number;
  lastSuccessAt: number | null;
  /** Until when the provider asked us to wait (429), if it did. */
  pausedUntil: number | null;
  failures: number;
  lastError: string | null;
  nextPollAt: number | null;
}

/**
 * The viewer-facing state of a polled feed. A rate limit outranks a failure,
 * because it says exactly when things resume.
 */
export function polledFeedStatus(feed: string, label: string, s: PolledStatusInput): FeedStatus {
  const base = { feed, label };
  if (s.pausedUntil !== null && s.pausedUntil > s.now) {
    return { ...base, state: 'rate-limited', until: s.pausedUntil };
  }
  if (s.failures > 0) {
    return {
      ...base,
      state: 'failing',
      ...(s.lastError ? { detail: s.lastError } : {}),
      ...(s.nextPollAt !== null ? { until: s.nextPollAt } : {}),
    };
  }
  if (s.lastSuccessAt === null) return { ...base, state: 'starting' };
  return { ...base, state: 'ok' };
}

