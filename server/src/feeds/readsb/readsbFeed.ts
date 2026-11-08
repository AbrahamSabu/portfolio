import type { BBox, FeedStatus } from '@watchfloor/shared';
import { createLogger, type Logger } from '../../log';
import type { Feed, TrackSink } from '../feed';
import { Backoff } from '../backoff';
import { PollScheduler, polledFeedStatus } from '../pollScheduler';
import { circleContains, circlesCover, circlesFor, type Circle } from './circles';
import { mapAircraft, parseAircraftResponse } from './mapAircraft';
import type { ReadsbService } from './services';

/** These networks are free and run by volunteers: say who we are. */
const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Circles fetched at once within a poll. adsb.lol took 1 to 3.5 s to answer
 * each one, so one at a time made a two-circle view wait for the sum; two at
 * once waits for the slower. It stays a light load on a free service.
 */
const CONCURRENCY = 2;
const MAX_BACKOFF_MS = 5 * 60_000;

export interface ReadsbOptions {
  /** Which network: its URL, name and request budget. */
  service: ReadsbService;
  /** Interval while someone is watching. */
  pollMs: number;
  /**
   * The home area's circles, polled whether or not anyone is watching (at
   * warmPollMs when nobody is), so a page opening on it finds the picture
   * already there instead of waiting for the first poll.
   */
  home?: Circle[];
  /** Interval for the home area while nobody is watching. Defaults to pollMs. */
  warmPollMs?: number;
  /** API base, e.g. a local stub for testing. Defaults to the service's. */
  apiUrl?: string;
  // Injectable for tests, so nothing touches the network or real time.
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  /** Waits between paced requests; tests make it instant. */
  sleep?: (ms: number) => Promise<void>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: Logger;
}

/**
 * Live aircraft from a community ADS-B network (adsb.lol, adsb.fi; see
 * services.ts).
 *
 * Reports use the same `adsb:<icao24>` ids as OpenSky and each other, so the
 * store merges providers: the newest report wins, and known identity
 * (callsign, platform) is kept. These networks only answer point-and-radius
 * queries, so the feed polls a home area always and follows what browsers
 * are looking at, standing aside for views wider than a region. Circles are fetched two at a time, and each one's aircraft
 * are pushed as soon as it answers. Scheduling (pausing with no viewers, debounced early polls
 * when the view moves) is PollScheduler's, as for OpenSky.
 */
export class ReadsbFeed implements Feed {
  readonly name: string;
  private readonly service: ReadsbService;

  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private nextRequestAt = 0;
  private readonly now: () => number;
  private readonly log: Logger;
  private readonly backoff: Backoff;
  private readonly scheduler: PollScheduler;

  private sink: TrackSink | null = null;
  private stopController = new AbortController();
  private watched = true;
  private readonly home: Circle[];
  private plan: Circle[] = [];
  private tooWide = false;
  private lastPolled: Circle[] = [];

  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;
  private pausedUntil: number | null = null;
  private aircraft = 0;

  constructor(private readonly opts: ReadsbOptions) {
    this.service = opts.service;
    this.name = opts.service.feed;
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? createLogger(opts.service.feed);
    this.home = opts.home ?? [];
    this.plan = this.home;
    this.backoff = new Backoff(opts.pollMs, Math.max(MAX_BACKOFF_MS, opts.pollMs), opts.random);
    this.scheduler = new PollScheduler(
      {
        run: () => this.pollOnce(),
        isActive: () => this.active,
        // Early when the view moved off what was polled, or when a viewer
        // arrives to warm data older than a watched poll would be.
        wantsEarlyPoll: () => !circlesCover(this.lastPolled, this.plan) || this.warmDataIsOld(),
        isWaiting: () => this.backoff.attempts > 0 || this.pausedUntil !== null,
        describe: () => describeCircles(this.plan),
      },
      {
        now: this.now,
        setTimer: opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
        clearTimer: opts.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout)),
        log: this.log,
        // These networks are free, so a moved view is fetched sooner than OpenSky's
        // (2 s settle, 10 s gap), whose every poll costs credits.
        settleMs: 1_000,
        minEarlyGapMs: 3_000,
      },
    );
  }

  /** There's something to poll: a home area always, views only while someone watches. */
  private get active(): boolean {
    return this.plan.length > 0 && (this.watched || this.home.length > 0);
  }

  /**
   * A viewer is looking at data older than the plan's own cadence allows.
   * Judged against `intervalFor(plan)`, not the bare poll interval: every
   * browser view refresh (300 ms after each pan) reaches the scheduler, and
   * judging by pollMs alone let a six-circle plan be polled every ~12 s
   * instead of every 48 s, ~30 requests a minute against a 7.5 ceiling —
   * the regime that got this address refused for hours.
   */
  private warmDataIsOld(): boolean {
    return this.watched && this.lastSuccessAt !== null && this.now() - this.lastSuccessAt > this.intervalFor(this.plan);
  }

  /** How often this plan may be polled: the poll interval, or longer when the per-circle budget says so. */
  private intervalFor(plan: readonly Circle[]): number {
    const interval = this.watched ? this.opts.pollMs : (this.opts.warmPollMs ?? this.opts.pollMs);
    return Math.max(interval, plan.length * this.service.minMsPerCircle);
  }

  start(sink: TrackSink): void {
    this.sink = sink;
    this.stopController = new AbortController();
    this.log.info('configured', {
      every: `${this.opts.pollMs / 1000}s`,
      area: 'views up to region size',
      home: describeCircles(this.home),
      ...(this.home.length ? { unwatchedEvery: `${(this.opts.warmPollMs ?? this.opts.pollMs) / 1000}s` } : {}),
    });
    this.scheduler.start();
  }

  setDemand(watched: boolean): void {
    this.watched = watched;
    this.scheduler.refresh();
  }

  setAreas(views: BBox[]): void {
    const circles = circlesFor(views);
    this.tooWide = circles === null;
    // Home first, then any view circle the home area doesn't already cover.
    const extra = (circles ?? []).filter((c) => !this.home.some((h) => circleContains(h, c)));
    this.plan = [...this.home, ...extra];
    this.scheduler.refresh();
  }

  stop(): void {
    this.sink = null;
    this.stopController.abort();
    this.scheduler.stop();
  }

  status(): FeedStatus {
    // Standing aside for a wide view isn't a fault; the UI mentions it only if nothing else is delivering.
    const { feed, label } = this.service;
    if (this.tooWide) return { feed, label, state: 'standing-aside' };
    if (this.plan.length === 0) return { feed, label, state: 'ok' };
    return polledFeedStatus(feed, label, {
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
      home: describeCircles(this.home),
      warm: !this.watched && this.home.length > 0,
      standingAside: this.tooWide ? 'every view wider than a region' : false,
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
    const base = this.opts.apiUrl ?? this.service.defaultUrl;
    const results: CircleResult[] = [];
    let next = 0;
    // A small worker pool: each worker takes the next circle until none are
    // left, or until a circle was refused: a 429 means stop asking (adsb.fi
    // counts 4xx answers towards a temporary ban; adsb.lol refused this
    // address for hours after bursts), so at most the companion request
    // already in flight follows one.
    let refused = false;
    const worker = async () => {
      while (next < plan.length && !refused) {
        const circle = plan[next++]!;
        await this.pace();
        if (refused) return;
        const result = await this.fetchCircle(base, circle);
        results.push(result);
        if (result.kind === 'throttled') refused = true;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, plan.length) }, worker));

    // Whatever arrived is already in the picture; a failed circle still fails the poll.
    const throttled = results.find((r) => r.kind === 'throttled');
    if (throttled?.kind === 'throttled') return this.throttled(throttled.res);
    const failed = results.find((r) => r.kind === 'failed');
    if (failed?.kind === 'failed') return this.fail(failed.reason);

    const aircraft = results.reduce((sum, r) => sum + (r.kind === 'ok' ? r.aircraft : 0), 0);
    this.aircraft = aircraft;
    this.lastPolled = plan;
    if (this.backoff.attempts > 0 || this.pausedUntil !== null) {
      this.log.info('recovered', { afterFailures: this.backoff.attempts, aircraft });
    }
    this.backoff.reset();
    this.pausedUntil = null;
    this.lastError = null;
    this.lastSuccessAt = this.now();
    return this.intervalFor(plan);
  }

  /** Wait for this request's slot. The slot is taken before waiting, so concurrent workers queue in turn. */
  private async pace(): Promise<void> {
    const now = this.now();
    const wait = this.nextRequestAt - now;
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + this.service.requestGapMs;
    if (wait > 0) await this.sleep(wait);
  }

  /** Fetch one circle and push its aircraft straight away. Network errors become a failed result. */
  private async fetchCircle(base: string, c: Circle): Promise<CircleResult> {
    let res: Response;
    try {
      res = await this.fetch(`${base}${this.service.pointPath(c)}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.any([this.stopController.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
    } catch (err) {
      if (this.stopController.signal.aborted) throw err;
      return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
    if (res.status === 429) return { kind: 'throttled', res };
    if (!res.ok) return { kind: 'failed', reason: `HTTP ${res.status}` };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'failed', reason: 'response was not JSON' };
    }
    const parsed = parseAircraftResponse(body);
    if (!parsed) return { kind: 'failed', reason: 'response had no aircraft list' };
    return { kind: 'ok', aircraft: this.ingest(parsed.ac, parsed.now) };
  }

  private ingest(list: unknown[], nowMs: number): number {
    const sink = this.sink;
    if (!sink) return 0;
    let airborne = 0;
    for (const ac of list) {
      const outcome = mapAircraft(ac, nowMs, this.service.provider);
      if (outcome.kind === 'airborne') {
        sink.upsert(outcome.report);
        airborne++;
      } else if (outcome.kind === 'on-ground') {
        sink.remove(outcome.id);
      }
    }
    return airborne;
  }

  /**
   * 429: wait as long as Retry-After says (in seconds), or back off if it
   * doesn't say. Either way it's a rate limit, not an outage, and the viewer
   * is told when the next try is (adsb.lol sends no Retry-After when it
   * refuses an address for hours).
   */
  private throttled(res: Response): number {
    const seconds = Number(res.headers.get('Retry-After'));
    if (!res.headers.has('Retry-After') || !Number.isFinite(seconds) || seconds < 0) {
      const delay = this.fail('429 rate limited');
      this.pausedUntil = this.now() + delay;
      return delay;
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

type CircleResult =
  | { kind: 'ok'; aircraft: number }
  | { kind: 'throttled'; res: Response }
  | { kind: 'failed'; reason: string };

function describeCircles(circles: Circle[]): string {
  if (circles.length === 0) return 'none';
  return circles.map((c) => `${c.lat},${c.lon} r${c.radiusNm}nm`).join(' + ');
}
