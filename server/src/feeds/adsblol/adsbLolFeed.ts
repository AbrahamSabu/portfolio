import type { BBox, FeedStatus } from '@watchfloor/shared';
import { createLogger, type Logger } from '../../log';
import type { Feed, TrackSink } from '../feed';
import { Backoff } from '../opensky/backoff';
import { PollScheduler, polledFeedStatus } from '../pollScheduler';
import { circlesCover, circlesFor, type Circle } from './circles';
import { mapAircraft, parseAircraftResponse } from './mapAircraft';

export const DEFAULT_ADSBLOL_URL = 'https://api.adsb.lol';
/** adsb.lol is free and run by volunteers: say who we are. */
const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';
const REQUEST_TIMEOUT_MS = 15_000;
/** Between requests within one poll, so a multi-circle view isn't a burst. */
const DEFAULT_GAP_MS = 1_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export interface AdsbLolOptions {
  pollMs: number;
  /** API base, e.g. a local stub for testing. Defaults to adsb.lol's. */
  apiUrl?: string;
  gapMs?: number;
  // Injectable for tests, so nothing touches the network or real time.
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
  log?: Logger;
}

/**
 * Live aircraft from adsb.lol, a second ADS-B network, to fill in what
 * OpenSky's receivers miss where the user is zoomed in.
 *
 * Reports use the same `adsb:<icao24>` ids as OpenSky, so the store merges
 * the two providers: the newest report wins, and known identity (callsign,
 * platform) is kept. adsb.lol only answers point-and-radius queries, so it
 * follows what browsers are looking at, and stands aside for views wider
 * than a region. Scheduling (pausing with no viewers, debounced early polls
 * when the view moves) is PollScheduler's, as for OpenSky.
 */
export class AdsbLolFeed implements Feed {
  readonly name = 'adsblol';

  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: Logger;
  private readonly backoff: Backoff;
  private readonly scheduler: PollScheduler;

  private sink: TrackSink | null = null;
  private stopController = new AbortController();
  private watched = true;
  private plan: Circle[] = [];
  private tooWide = false;
  private lastPolled: Circle[] = [];

  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;
  private pausedUntil: number | null = null;
  private aircraft = 0;

  constructor(private readonly opts: AdsbLolOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = opts.log ?? createLogger('adsblol');
    this.backoff = new Backoff(opts.pollMs, Math.max(MAX_BACKOFF_MS, opts.pollMs), opts.random);
    this.scheduler = new PollScheduler(
      {
        run: () => this.pollOnce(),
        isActive: () => this.active,
        wantsEarlyPoll: () => !circlesCover(this.lastPolled, this.plan),
        isWaiting: () => this.backoff.attempts > 0 || this.pausedUntil !== null,
        describe: () => describeCircles(this.plan),
      },
      {
        now: this.now,
        setTimer: opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
        clearTimer: opts.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout)),
        log: this.log,
        // adsb.lol is free, so a moved view is fetched sooner than OpenSky's
        // (2 s settle, 10 s gap), whose every poll costs credits.
        settleMs: 1_000,
        minEarlyGapMs: 3_000,
      },
    );
  }

  /** Someone is watching a view narrow enough to cover. */
  private get active(): boolean {
    return this.watched && this.plan.length > 0;
  }

  start(sink: TrackSink): void {
    this.sink = sink;
    this.stopController = new AbortController();
    this.log.info('configured', { every: `${this.opts.pollMs / 1000}s`, area: 'views up to region size' });
    this.scheduler.start();
  }

  setDemand(watched: boolean): void {
    this.watched = watched;
    this.scheduler.refresh();
  }

  setAreas(views: BBox[]): void {
    const circles = circlesFor(views);
    this.tooWide = circles === null;
    this.plan = circles ?? [];
    this.scheduler.refresh();
  }

  stop(): void {
    this.sink = null;
    this.stopController.abort();
    this.scheduler.stop();
  }

  status(): FeedStatus {
    // Standing aside for a wide view isn't a fault; the UI mentions it only if nothing else is delivering.
    if (this.tooWide) return { feed: 'adsblol', label: 'adsb.lol', state: 'standing-aside' };
    if (this.plan.length === 0) return { feed: 'adsblol', label: 'adsb.lol', state: 'ok' };
    return polledFeedStatus('adsblol', 'adsb.lol', {
      now: this.now(),
      lastSuccessAt: this.lastSuccessAt,
      pausedUntil: this.pausedUntil,
      failures: this.backoff.attempts,
      lastError: this.lastError,
      nextPollAt: this.scheduler.nextPollAt,
    });
  }

  health(): Record<string, unknown> {
    return {
      paused: this.scheduler.paused,
      standingAside: this.tooWide ? 'view wider than a region' : false,
      polled: describeCircles(this.lastPolled),
      aircraft: this.aircraft,
      lastSuccessAt: this.lastSuccessAt && new Date(this.lastSuccessAt).toISOString(),
      pausedUntil: this.pausedUntil && new Date(this.pausedUntil).toISOString(),
      consecutiveFailures: this.backoff.attempts,
      lastError: this.lastError,
    };
  }

  /** Poll every planned circle and push the results. Returns ms until the next poll. Never throws. */
  async pollOnce(): Promise<number> {
    try {
      return await this.poll();
    } catch (err) {
      if (this.stopController.signal.aborted) return this.opts.pollMs;
      return this.fail(err instanceof Error ? err.message : String(err));
    }
  }

  private async poll(): Promise<number> {
    const plan = this.plan;
    const base = this.opts.apiUrl ?? DEFAULT_ADSBLOL_URL;
    let aircraft = 0;
    for (const [i, c] of plan.entries()) {
      if (i > 0) await this.sleep(this.opts.gapMs ?? DEFAULT_GAP_MS);
      const res = await this.fetch(`${base}/v2/point/${c.lat}/${c.lon}/${c.radiusNm}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.any([this.stopController.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      if (res.status === 429) return this.throttled(res);
      if (!res.ok) return this.fail(`HTTP ${res.status}`);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return this.fail('response was not JSON');
      }
      const parsed = parseAircraftResponse(body);
      if (!parsed) return this.fail('response had no aircraft list');
      aircraft += this.ingest(parsed.ac, parsed.now);
    }

    this.aircraft = aircraft;
    this.lastPolled = plan;
    if (this.backoff.attempts > 0 || this.pausedUntil !== null) {
      this.log.info('recovered', { afterFailures: this.backoff.attempts, aircraft });
    }
    this.backoff.reset();
    this.pausedUntil = null;
    this.lastError = null;
    this.lastSuccessAt = this.now();
    return this.opts.pollMs;
  }

  private ingest(list: unknown[], nowMs: number): number {
    const sink = this.sink;
    if (!sink) return 0;
    let airborne = 0;
    for (const ac of list) {
      const outcome = mapAircraft(ac, nowMs);
      if (outcome.kind === 'airborne') {
        sink.upsert(outcome.report);
        airborne++;
      } else if (outcome.kind === 'on-ground') {
        sink.remove(outcome.id);
      }
    }
    return airborne;
  }

  /** 429: wait as long as Retry-After says (in seconds), or back off if it doesn't say. */
  private throttled(res: Response): number {
    const seconds = Number(res.headers.get('Retry-After'));
    if (!res.headers.has('Retry-After') || !Number.isFinite(seconds) || seconds < 0) {
      return this.fail('429 rate limited (no retry-after)');
    }
    const delay = Math.max(this.opts.pollMs, seconds * 1000);
    this.pausedUntil = this.now() + delay;
    this.lastError = '429 rate limited';
    this.log.warn('rate limited; waiting as asked', { resumesAt: new Date(this.pausedUntil).toISOString() });
    return delay;
  }

  private fail(reason: string): number {
    const delay = Math.max(this.opts.pollMs, this.backoff.next());
    this.lastError = reason;
    this.log.warn('poll failed', { reason, attempt: this.backoff.attempts, retryInS: Math.round(delay / 1000) });
    return delay;
  }
}

function describeCircles(circles: Circle[]): string {
  if (circles.length === 0) return 'none';
  return circles.map((c) => `${c.lat},${c.lon} r${c.radiusNm}nm`).join(' + ');
}
