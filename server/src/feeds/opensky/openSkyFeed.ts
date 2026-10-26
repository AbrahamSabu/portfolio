import type { BBox } from '@watchfloor/shared';
import { createLogger, type Logger } from '../../log';
import type { Feed, TrackSink } from '../feed';
import { Backoff } from './backoff';
import { covers, describePlan, planCost, planCoverage, type Plan } from './coverage';
import { mapState, parseStatesResponse } from './mapState';

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** Give up on a request that hangs; the next poll will try again. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Refresh tokens a minute early so one never expires mid-request. */
const TOKEN_MARGIN_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** Early polls (a view moved off the polled area) never come sooner than this after the last attempt: OpenSky's data only changes every 10 s anonymously. */
const MIN_EARLY_GAP_MS = 10_000;
/** And wait this long for a view to settle, so a pan across the map costs one poll, not several. */
const VIEW_SETTLE_MS = 1_000;

/** Daily /states credits per tier, from the OpenSky REST docs (checked October 2026). */
export const DAILY_CREDITS = { anonymous: 400, standard: 4000 } as const;

export interface OpenSkyCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OpenSkyOptions {
  /** The area to poll, or null for the whole world. Ignored with `viewport`. */
  bounds: BBox | null;
  /** Poll only what browsers are looking at, as reported through setAreas(). */
  viewport?: boolean;
  pollMs: number;
  /** OAuth2 client credentials. Without them the feed polls anonymously. */
  credentials?: OpenSkyCredentials;
  // Injectable for tests, so nothing touches the network or real time.
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: Logger;
}

/**
 * Live aircraft from the OpenSky Network REST API.
 *
 * Polls /states/all for the scenario's bounding box. Successful polls upsert
 * airborne aircraft and remove those reported on the ground. Failed polls push
 * nothing, so tracks fade and drop through the normal staleness rules: the
 * picture degrades visibly instead of freezing.
 *
 * Failure handling, in order of how often it happens:
 * - 429 (daily credits used up): wait exactly as long as OpenSky's
 *   X-Rate-Limit-Retry-After-Seconds says, which can be hours.
 * - Network errors, timeouts, 5xx, junk bodies: exponential backoff, but
 *   never faster than the poll interval, because every request spends credits.
 * - 401 with credentials: the token expired; fetch a new one next poll.
 * - Credentials rejected outright: log it and carry on anonymously.
 *
 * While nobody is watching (setDemand(false)) the feed stops at its next
 * scheduled poll instead of spending credits on an empty room. The pending
 * timer doubles as a grace period, so a page reload never pauses it. On
 * resume it polls at the time already scheduled (nextDueAt), never sooner, so
 * reconnect storms can't burn credits and 429 waits and backoff survive.
 *
 * In viewport mode the area comes from browsers (setAreas) and is planned by
 * coverage.ts: zoomed in costs 1 credit a poll instead of the world's 4. When
 * a view moves off the polled area, the next poll is brought forward, but
 * never into a backoff or 429 wait, and never within 10 s of the last one.
 */
export class OpenSkyFeed implements Feed {
  readonly name = 'opensky';

  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly log: Logger;
  private readonly backoff: Backoff;

  private sink: TrackSink | null = null;
  private timer: unknown = null;
  private stopController = new AbortController();
  private credentials: OpenSkyCredentials | undefined;
  private token: { value: string; expiresAt: number } | null = null;
  private watched = true;
  /** True when we skipped a due poll for lack of viewers and have no timer pending. */
  private paused = false;
  /** When the next poll is (or was) due; resuming never polls before this. */
  private nextDueAt = 0;
  /** What to poll next: fixed in scenario and world modes, from views in viewport mode. */
  private plan: Plan;
  /** What the last fully successful poll covered. */
  private lastPolled: Plan = [];
  private lastAttemptAt = Number.NEGATIVE_INFINITY;

  // Exposed through health() for /healthz.
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;
  private creditsRemaining: number | null = null;
  private pausedUntil: number | null = null;
  private aircraft = 0;

  constructor(private readonly opts: OpenSkyOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout));
    this.log = opts.log ?? createLogger('opensky');
    this.backoff = new Backoff(opts.pollMs, Math.max(MAX_BACKOFF_MS, opts.pollMs), opts.random);
    this.credentials = opts.credentials;
    this.plan = opts.viewport ? [] : opts.bounds === null ? null : [opts.bounds];
  }

  /** Someone is watching and, in viewport mode, has said where. */
  private get active(): boolean {
    return this.watched && !(this.plan !== null && this.plan.length === 0);
  }

  get authenticated(): boolean {
    return this.credentials !== undefined;
  }

  start(sink: TrackSink): void {
    this.sink = sink;
    this.stopController = new AbortController();
    const daily = this.authenticated ? DAILY_CREDITS.standard : DAILY_CREDITS.anonymous;
    const budget = (cost: number) => Math.round((daily / cost) * (this.opts.pollMs / 3_600_000) * 10) / 10;
    this.log.info('configured', {
      area: this.opts.viewport ? 'viewport' : this.opts.bounds ? 'scenario' : 'world',
      every: `${this.opts.pollMs / 1000}s`,
      auth: this.authenticated ? 'client credentials' : 'anonymous',
      // At the standard tier's allowance; feeders and licensed users get more.
      ...(this.opts.viewport
        ? { creditsPerPoll: '1 zoomed in to 4 zoomed out', budgetLastsHours: `${budget(4)} to ${budget(1)}` }
        : { creditsPerPoll: planCost(this.plan), budgetLastsHours: budget(planCost(this.plan)) }),
    });
    if (this.active) {
      this.schedule(0);
    } else {
      this.nextDueAt = this.now();
      this.paused = true;
      this.log.info('no viewers yet; polling starts when a browser connects');
    }
  }

  setDemand(watched: boolean): void {
    this.watched = watched;
    this.resumeIfPaused();
  }

  /** Viewport mode: re-plan from what browsers are looking at, and poll early if that's now off the polled area. */
  setAreas(views: BBox[]): void {
    if (!this.opts.viewport) return;
    this.plan = planCoverage(views);
    if (this.paused) this.resumeIfPaused();
    else this.maybePollEarly();
  }

  private resumeIfPaused(): void {
    if (!this.active || !this.paused || !this.sink) return;
    this.paused = false;
    const delay = Math.max(0, this.nextDueAt - this.now());
    this.log.info('viewer connected, polling resumed', { nextPollInS: Math.round(delay / 1000) });
    this.schedule(delay);
  }

  /**
   * Bring the next poll forward when the plan isn't covered by the last one,
   * so panning somewhere new doesn't wait a whole interval for aircraft. It
   * only ever moves a poll earlier, never into a backoff or 429 wait, and
   * never within MIN_EARLY_GAP_MS of the last attempt.
   */
  private maybePollEarly(): void {
    if (!this.opts.viewport || this.timer === null || !this.active) return;
    if (covers(this.lastPolled, this.plan)) return;
    if (this.backoff.attempts > 0 || this.pausedUntil !== null) return;
    const now = this.now();
    const due = Math.max(now + VIEW_SETTLE_MS, this.lastAttemptAt + MIN_EARLY_GAP_MS);
    if (due >= this.nextDueAt) return;
    this.clearTimer(this.timer);
    this.log.info('view moved off the polled area; polling early', {
      area: describePlan(this.plan),
      inS: Math.round((due - now) / 1000),
    });
    this.schedule(due - now);
  }

  stop(): void {
    this.sink = null;
    this.paused = false;
    this.stopController.abort();
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  health(): Record<string, unknown> {
    return {
      auth: this.authenticated ? 'client credentials' : 'anonymous',
      paused: this.paused,
      polled: describePlan(this.lastPolled),
      creditsPerPoll: planCost(this.lastPolled),
      aircraft: this.aircraft,
      lastSuccessAt: this.lastSuccessAt && new Date(this.lastSuccessAt).toISOString(),
      creditsRemaining: this.creditsRemaining,
      pausedUntil: this.pausedUntil && new Date(this.pausedUntil).toISOString(),
      consecutiveFailures: this.backoff.attempts,
      lastError: this.lastError,
    };
  }

  private schedule(ms: number): void {
    this.nextDueAt = this.now() + ms;
    this.timer = this.setTimer(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (!this.sink) return; // stopped while the timer was pending
    if (!this.active) {
      // Leave nextDueAt as it is: the poll is overdue, so a returning viewer gets one at once.
      this.paused = true;
      this.log.info('no viewers, polling paused');
      return;
    }
    const delay = await this.pollOnce();
    if (!this.sink) return;
    this.schedule(delay);
    // The view may have moved while the request was in flight.
    this.maybePollEarly();
  }

  /** Poll once and push the results into the sink. Returns ms until the next poll. Never throws. */
  async pollOnce(): Promise<number> {
    try {
      return await this.poll();
    } catch (err) {
      if (this.stopController.signal.aborted) return this.opts.pollMs;
      return this.fail(err instanceof Error ? err.message : String(err));
    }
  }

  private async poll(): Promise<number> {
    this.lastAttemptAt = this.now();
    const plan = this.plan;
    const headers: Record<string, string> = {};
    const token = await this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    // One request per box (null is the whole world). If one fails, what the
    // earlier ones returned stays in the picture; the poll still counts as failed.
    let aircraft = 0;
    for (const box of plan === null ? [null] : plan) {
      const query = new URLSearchParams({ extended: '1' }); // adds the aircraft category at index 17
      // Leaving the box out asks for the whole world.
      if (box) {
        query.set('lamin', String(box.south));
        query.set('lomin', String(box.west));
        query.set('lamax', String(box.north));
        query.set('lomax', String(box.east));
      }
      const res = await this.fetch(`${STATES_URL}?${query}`, { headers, signal: this.signal() });

      const remaining = Number(res.headers.get('X-Rate-Limit-Remaining'));
      if (res.headers.has('X-Rate-Limit-Remaining') && Number.isFinite(remaining)) {
        this.creditsRemaining = remaining;
      }

      if (res.status === 429) return this.throttled(res);
      if (res.status === 401 && token) {
        this.token = null; // expired or revoked; get a fresh one next time
        return this.fail('401 unauthorized, token refreshed for next poll');
      }
      if (!res.ok) return this.fail(`HTTP ${res.status}`);

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return this.fail('response was not JSON');
      }
      const rows = parseStatesResponse(body);
      if (rows === null) return this.fail('response had no states array');
      aircraft += this.ingest(rows);
    }

    this.aircraft = aircraft;
    this.lastPolled = plan;
    if (this.backoff.attempts > 0 || this.pausedUntil !== null) {
      this.log.info('recovered', { afterFailures: this.backoff.attempts, aircraft: this.aircraft });
    }
    this.backoff.reset();
    this.pausedUntil = null;
    this.lastError = null;
    this.lastSuccessAt = this.now();
    return this.opts.pollMs;
  }

  /** Push mapped rows into the sink; returns how many were airborne. */
  private ingest(rows: unknown[]): number {
    const sink = this.sink;
    if (!sink) return 0;
    let airborne = 0;
    for (const row of rows) {
      const outcome = mapState(row);
      if (outcome.kind === 'airborne') {
        sink.upsert(outcome.report);
        airborne++;
      } else if (outcome.kind === 'on-ground') {
        // We know it landed, so take it off now rather than leaving it to go stale.
        // Removing a track the store never had is harmless.
        sink.remove(outcome.id);
      }
    }
    return airborne;
  }

  private throttled(res: Response): number {
    const seconds = Number(res.headers.get('X-Rate-Limit-Retry-After-Seconds'));
    if (!res.headers.has('X-Rate-Limit-Retry-After-Seconds') || !Number.isFinite(seconds) || seconds < 0) {
      return this.fail('429 rate limited (no retry-after header)');
    }
    const delay = Math.max(this.opts.pollMs, seconds * 1000);
    this.pausedUntil = this.now() + delay;
    this.lastError = '429 rate limited';
    this.log.warn('credits used up; tracks will go stale until polling resumes', {
      resumesAt: new Date(this.pausedUntil).toISOString(),
      auth: this.authenticated ? 'client credentials' : 'anonymous',
    });
    return delay;
  }

  private fail(reason: string): number {
    const delay = Math.max(this.opts.pollMs, this.backoff.next());
    this.lastError = reason;
    this.log.warn('poll failed', { reason, attempt: this.backoff.attempts, retryInS: Math.round(delay / 1000) });
    return delay;
  }

  /** Combines the per-request timeout with stop(), so stopping cancels an in-flight request. */
  private signal(): AbortSignal {
    return AbortSignal.any([this.stopController.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  }

  /** A bearer token, or null to poll anonymously. Cached until shortly before it expires. */
  private async getToken(): Promise<string | null> {
    const creds = this.credentials;
    if (!creds) return null;
    if (this.token && this.now() < this.token.expiresAt - TOKEN_MARGIN_MS) return this.token.value;

    const res = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
      signal: this.signal(),
    });
    if (res.status === 400 || res.status === 401) {
      // Wrong id or secret. Retrying won't fix that, and anonymous still works.
      this.credentials = undefined;
      this.token = null;
      this.log.error('OpenSky rejected the client credentials; continuing anonymously', {
        status: res.status,
        hint: 'check OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in .env',
      });
      return null;
    }
    if (!res.ok) throw new Error(`token endpoint returned HTTP ${res.status}`);
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string') throw new Error('token response had no access_token');
    const expiresInS = typeof body.expires_in === 'number' ? body.expires_in : 1800;
    this.token = { value: body.access_token, expiresAt: this.now() + expiresInS * 1000 };
    return this.token.value;
  }
}
