import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import type { TrackSink } from '../feed';
import { OpenSkyFeed, openSkyStatus, type OpenSkyOptions } from './openSkyFeed';

const CHANNEL = { south: 49.3, west: -4.5, north: 51.6, east: 2.8 };
const POLL_MS = 60_000;
const recorded = readFileSync(new URL('./fixtures/channel-2026-10-26.json', import.meta.url), 'utf8');

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
  });
}

/** A fake fetch that answers from a queue and records every request it was given. */
function scripted(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error('fake fetch: no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function recordingSink() {
  const upserts: Array<{ id: string }> = [];
  const removals: string[] = [];
  const sink: TrackSink = {
    upsert: (r) => upserts.push(r as { id: string }),
    remove: (id) => removals.push(id),
  };
  return { sink, upserts, removals };
}

/** A started feed whose timer never fires on its own: tests call pollOnce(). */
function setup(fetch: typeof globalThis.fetch, opts: Partial<OpenSkyOptions> = {}) {
  let now = 1_792_975_620_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const feed = new OpenSkyFeed({
    bounds: CHANNEL,
    pollMs: POLL_MS,
    fetch,
    now: () => now,
    random: () => 1,
    setTimer: () => 'timer',
    clearTimer: () => {},
    log: silent,
    ...opts,
  });
  const out = recordingSink();
  feed.start(out.sink);
  return { feed, clock, ...out };
}

const authHeader = (init: RequestInit | undefined) =>
  (init?.headers as Record<string, string> | undefined)?.Authorization;

describe('OpenSkyFeed', () => {
  it('polls the scenario box anonymously and pushes what it maps', async () => {
    const { fetch, calls } = scripted(json(recorded, { headers: { 'X-Rate-Limit-Remaining': '399' } }));
    const { feed, upserts, removals } = setup(fetch);

    expect(await feed.pollOnce()).toBe(POLL_MS);

    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://opensky-network.org/api/states/all');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      extended: '1',
      lamin: '49.3',
      lomin: '-4.5',
      lamax: '51.6',
      lomax: '2.8',
    });
    expect(authHeader(calls[0]!.init)).toBeUndefined();
    expect(upserts).toHaveLength(13);
    expect(removals).toHaveLength(5); // on the ground at Gatwick
    expect(feed.health()).toMatchObject({ auth: 'anonymous', aircraft: 13, creditsRemaining: 399 });
  });

  it('polls the whole world by leaving the box out', async () => {
    const { fetch, calls } = scripted(json(recorded));
    const { feed } = setup(fetch, { bounds: null });
    await feed.pollOnce();
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toEqual({ extended: '1' });
  });

  it('treats an empty sky as success, not failure', async () => {
    const { fetch } = scripted(json({ time: 1, states: null }));
    const { feed, upserts } = setup(fetch);
    expect(await feed.pollOnce()).toBe(POLL_MS);
    expect(upserts).toHaveLength(0);
    expect(feed.health().consecutiveFailures).toBe(0);
  });

  describe('on 429', () => {
    it('waits exactly as long as OpenSky says, and pushes nothing', async () => {
      const { fetch } = scripted(
        json('', { status: 429, headers: { 'X-Rate-Limit-Retry-After-Seconds': '7200' } }),
      );
      const { feed, upserts } = setup(fetch);
      expect(await feed.pollOnce()).toBe(7_200_000);
      expect(upserts).toHaveLength(0);
      expect(feed.health()).toMatchObject({ lastError: '429 rate limited' });
      expect(feed.health().pausedUntil).not.toBeNull();
    });

    it('never retries sooner than the poll interval', async () => {
      const { fetch } = scripted(
        json('', { status: 429, headers: { 'X-Rate-Limit-Retry-After-Seconds': '3' } }),
      );
      const { feed } = setup(fetch);
      expect(await feed.pollOnce()).toBe(POLL_MS);
    });

    it('backs off when the retry-after header is missing', async () => {
      const { fetch } = scripted(json('', { status: 429 }), json('', { status: 429 }));
      const { feed } = setup(fetch);
      expect(await feed.pollOnce()).toBe(POLL_MS);
      expect(await feed.pollOnce()).toBe(2 * POLL_MS);
    });

    it('clears the pause once a poll succeeds', async () => {
      const { fetch } = scripted(
        json('', { status: 429, headers: { 'X-Rate-Limit-Retry-After-Seconds': '600' } }),
        json(recorded),
      );
      const { feed } = setup(fetch);
      await feed.pollOnce();
      expect(await feed.pollOnce()).toBe(POLL_MS);
      expect(feed.health()).toMatchObject({ pausedUntil: null, lastError: null });
    });
  });

  describe('on errors', () => {
    it('backs off exponentially, capped, without throwing', async () => {
      const { fetch } = scripted(
        new TypeError('fetch failed'),
        json('', { status: 503 }),
        json('<html>busy</html>'),
        json({ unexpected: true }),
        json('', { status: 500 }),
        json('', { status: 500 }),
      );
      const { feed, upserts } = setup(fetch);
      const delays = [];
      for (let i = 0; i < 6; i++) delays.push(await feed.pollOnce());
      expect(delays).toEqual([60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
      expect(upserts).toHaveLength(0);
      expect(feed.health()).toMatchObject({ consecutiveFailures: 6, lastError: 'HTTP 500' });
    });

    it('returns to the normal interval after recovering', async () => {
      const { fetch } = scripted(json('', { status: 502 }), json('', { status: 502 }), json(recorded));
      const { feed, upserts } = setup(fetch);
      await feed.pollOnce();
      await feed.pollOnce();
      expect(await feed.pollOnce()).toBe(POLL_MS);
      expect(upserts).toHaveLength(13);
      expect(feed.health().consecutiveFailures).toBe(0);
    });
  });

  describe('with credentials', () => {
    const credentials = { clientId: 'watchfloor-test', clientSecret: 'not-a-real-secret' };
    const token = (value: string) => json({ access_token: value, expires_in: 1800 });

    it('fetches a token once and reuses it until shortly before expiry', async () => {
      const { fetch, calls } = scripted(token('t1'), json(recorded), json(recorded), token('t2'), json(recorded));
      const { feed, clock } = setup(fetch, { credentials, pollMs: 15_000 });

      await feed.pollOnce();
      clock.advance(15_000);
      await feed.pollOnce();
      clock.advance(30 * 60_000); // past expiry
      await feed.pollOnce();

      expect(calls.map((c) => (c.url.includes('/token') ? 'token' : 'states'))).toEqual([
        'token',
        'states',
        'states',
        'token',
        'states',
      ]);
      const body = new URLSearchParams(String(calls[0]!.init?.body));
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe('watchfloor-test');
      expect(authHeader(calls[1]!.init)).toBe('Bearer t1');
      expect(authHeader(calls[4]!.init)).toBe('Bearer t2');
    });

    it('gets a new token after a 401', async () => {
      const { fetch, calls } = scripted(token('t1'), json('', { status: 401 }), token('t2'), json(recorded));
      const { feed } = setup(fetch, { credentials, pollMs: 15_000 });
      expect(await feed.pollOnce()).toBe(15_000); // a failure, so backoff, but floored at the interval
      await feed.pollOnce();
      expect(authHeader(calls[3]!.init)).toBe('Bearer t2');
    });

    it('falls back to anonymous when the credentials are rejected', async () => {
      const { fetch, calls } = scripted(json({ error: 'invalid_client' }, { status: 401 }), json(recorded), json(recorded));
      const { feed, upserts } = setup(fetch, { credentials, pollMs: 15_000 });
      await feed.pollOnce();
      await feed.pollOnce();
      expect(authHeader(calls[1]!.init)).toBeUndefined();
      expect(calls.filter((c) => c.url.includes('/token'))).toHaveLength(1);
      expect(upserts).toHaveLength(26);
      expect(feed.health().auth).toBe('anonymous');
    });

    it('backs off when the token endpoint is down', async () => {
      const { fetch } = scripted(json('', { status: 503 }));
      const { feed } = setup(fetch, { credentials, pollMs: 15_000 });
      expect(await feed.pollOnce()).toBe(15_000);
      expect(feed.health()).toMatchObject({ auth: 'client credentials', lastError: 'token endpoint returned HTTP 503' });
    });
  });

  describe('lifecycle', () => {
    it('polls immediately on start, reschedules after each poll, and stops cleanly', async () => {
      const timers: Array<{ fn: () => void; ms: number }> = [];
      let cleared = 0;
      const { fetch } = scripted(json(recorded), json(recorded));
      const feed = new OpenSkyFeed({
        bounds: CHANNEL,
        pollMs: POLL_MS,
        fetch,
        log: silent,
        setTimer: (fn, ms) => timers.push({ fn, ms }),
        clearTimer: () => cleared++,
      });
      const { sink, upserts } = recordingSink();
      feed.start(sink);
      expect(timers.map((t) => t.ms)).toEqual([0]);

      timers[0]!.fn();
      await new Promise((r) => setTimeout(r, 0));
      expect(upserts).toHaveLength(13);
      expect(timers.map((t) => t.ms)).toEqual([0, POLL_MS]);

      feed.stop();
      expect(cleared).toBe(1);
      timers[1]!.fn(); // a timer that fires after stop must not push or reschedule
      await new Promise((r) => setTimeout(r, 0));
      expect(timers).toHaveLength(2);
      expect(upserts).toHaveLength(13);
    });
  });
});

describe('OpenSkyFeed demand', () => {
  /** A feed with recorded timers: fire() runs the most recent one and lets the poll settle. */
  function watchable(...responses: Array<Response | Error>) {
    let now = 1_792_975_620_000;
    const timers: number[] = [];
    let latest: () => void = () => {};
    const { fetch, calls } = scripted(...responses);
    const feed = new OpenSkyFeed({
      bounds: CHANNEL,
      pollMs: POLL_MS,
      fetch,
      now: () => now,
      random: () => 1,
      log: silent,
      setTimer: (fn, ms) => {
        timers.push(ms);
        latest = fn;
      },
      clearTimer: () => {},
    });
    const fire = async () => {
      latest();
      await new Promise((r) => setTimeout(r, 0));
    };
    return { feed, timers, calls, fire, advance: (ms: number) => (now += ms), ...recordingSink() };
  }

  it('waits for the first viewer before spending a credit', async () => {
    const { feed, timers, calls, fire, sink, upserts } = watchable(json(recorded));
    feed.setDemand(false);
    feed.start(sink);
    expect(timers).toEqual([]);
    expect(feed.health().paused).toBe(true);

    feed.setDemand(true);
    expect(timers).toEqual([0]);
    await fire();
    expect(calls).toHaveLength(1);
    expect(upserts).toHaveLength(13);
    expect(timers).toEqual([0, POLL_MS]);
  });

  it('skips the next due poll when nobody is watching, and stops rescheduling', async () => {
    const { feed, timers, calls, fire, advance, sink } = watchable(json(recorded));
    feed.start(sink);
    await fire();
    feed.setDemand(false);
    advance(POLL_MS);
    await fire();
    expect(calls).toHaveLength(1);
    expect(timers).toEqual([0, POLL_MS]);
    expect(feed.health().paused).toBe(true);
  });

  it('polls at once for a viewer who returns after the poll fell due', async () => {
    const { feed, timers, fire, advance, sink } = watchable(json(recorded));
    feed.start(sink);
    await fire();
    feed.setDemand(false);
    advance(POLL_MS);
    await fire();
    advance(3_600_000);
    feed.setDemand(true);
    expect(timers).toEqual([0, POLL_MS, 0]);
    expect(feed.health().paused).toBe(false);
  });

  it('lets a page reload neither pause polling nor poll early', async () => {
    const { feed, timers, calls, fire, sink } = watchable(json(recorded));
    feed.start(sink);
    await fire();
    for (let i = 0; i < 10; i++) {
      feed.setDemand(false);
      feed.setDemand(true);
    }
    expect(timers).toEqual([0, POLL_MS]); // still just the one pending poll
    expect(calls).toHaveLength(1);
  });

  it('keeps honouring a 429 wait across viewers leaving and returning', async () => {
    const { feed, timers, fire, advance, sink } = watchable(
      json('', { status: 429, headers: { 'X-Rate-Limit-Retry-After-Seconds': '7200' } }),
    );
    feed.start(sink);
    await fire();
    feed.setDemand(false);
    advance(3_600_000);
    feed.setDemand(true);
    expect(timers).toEqual([0, 7_200_000]);
  });

  it('never schedules two polls when demand is reported twice', () => {
    const { feed, timers, sink } = watchable();
    feed.setDemand(false);
    feed.start(sink);
    feed.setDemand(true);
    feed.setDemand(true);
    expect(timers).toEqual([0]);
  });
});

describe('OpenSkyFeed viewport mode', () => {
  const LONDON = { south: 51.2, west: -0.6, north: 51.8, east: 0.4 };
  const MADRID = { south: 40.2, west: -4.0, north: 40.7, east: -3.4 };
  const TOKYO = { south: 35.4, west: 139.4, north: 35.9, east: 140.1 };

  function viewportFeed(fetch: typeof globalThis.fetch) {
    let now = 1_792_975_620_000;
    const timers: number[] = [];
    let cleared = 0;
    let latest: () => void = () => {};
    const feed = new OpenSkyFeed({
      bounds: null,
      viewport: true,
      pollMs: POLL_MS,
      fetch,
      now: () => now,
      random: () => 1,
      log: silent,
      setTimer: (fn, ms) => {
        timers.push(ms);
        latest = fn;
      },
      clearTimer: () => cleared++,
    });
    const out = recordingSink();
    const fire = async () => {
      latest();
      await new Promise((r) => setTimeout(r, 0));
    };
    feed.start(out.sink);
    return { feed, timers, fire, advance: (ms: number) => (now += ms), cleared: () => cleared, ...out };
  }

  const box = (url: string) => {
    const q = new URL(url).searchParams;
    return [q.get('lamin'), q.get('lomin'), q.get('lamax'), q.get('lomax')].join(',');
  };

  it('waits for a view, then polls just that area for 1 credit', async () => {
    const { fetch, calls } = scripted(json(recorded));
    const { feed, timers, fire } = viewportFeed(fetch);
    expect(timers).toEqual([]); // a browser is connected but hasn't said where it's looking

    feed.setAreas([LONDON]);
    expect(timers).toEqual([0]);
    await fire();
    expect(calls.map((c) => box(c.url))).toEqual(['51,-1,52,1']);
    expect(feed.health()).toMatchObject({ polled: '51,-1,52,1', creditsPerPoll: 1 });
  });

  it('does not poll early for a view the last poll already covered', async () => {
    const { fetch } = scripted(json(recorded));
    const { feed, timers, fire } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    await fire();
    feed.setAreas([{ south: 51.4, west: -0.3, north: 51.6, east: 0.1 }]); // a small pan inside London
    expect(timers).toEqual([0, POLL_MS]);
  });

  it('polls early when the view moves somewhere new, but not within 10 s of the last poll', async () => {
    const { fetch, calls } = scripted(json(recorded), json(recorded));
    const { feed, timers, fire, advance, cleared } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    await fire();
    advance(2_000);
    feed.setAreas([MADRID]);
    expect(timers).toEqual([0, POLL_MS, 8_000]); // 10 s after the last poll, not 60
    expect(cleared()).toBe(1);
    await fire();
    expect(box(calls[1]!.url)).toBe('40,-4,41,-3');
  });

  it('waits for the view to settle before an early poll', async () => {
    const { fetch } = scripted(json(recorded));
    const { feed, timers, fire, advance } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    await fire();
    advance(30_000);
    feed.setAreas([MADRID]);
    expect(timers.at(-1)).toBe(2_000);
  });

  it('debounces: a view that keeps changing pushes the early poll back, never past the regular one', async () => {
    const { fetch, calls } = scripted(json(recorded), json(recorded));
    const { feed, timers, fire, advance } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    await fire();
    advance(30_000);
    // A zoom out in steps: each new view restarts the 2 s settle.
    for (const view of [MADRID, { south: 39, west: -6, north: 42, east: -1 }, { south: 36, west: -10, north: 44, east: 0 }]) {
      feed.setAreas([view]);
      advance(1_000);
    }
    expect(timers.slice(2)).toEqual([2_000, 2_000, 2_000]);
    await fire();
    expect(calls).toHaveLength(2); // one poll for the whole gesture
    expect(box(calls[1]!.url)).toBe('36,-10,44,0'); // the final view, at 2 credits

    // Near the regular poll, the debounce can't push past it.
    advance(POLL_MS - 1_000);
    feed.setAreas([TOKYO]);
    expect(timers.at(-1)).toBe(POLL_MS); // the regular poll, rescheduled after the last one, is untouched
  });

  it('returns to the regular schedule if the view goes back to the polled area', async () => {
    const { fetch } = scripted(json(recorded));
    const { feed, timers, fire, advance } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    await fire();
    advance(30_000);
    feed.setAreas([MADRID]);
    expect(timers.at(-1)).toBe(2_000);
    feed.setAreas([LONDON]);
    expect(timers.at(-1)).toBe(30_000); // the regular poll, still due at 60 s
  });

  it('never brings a poll forward into a backoff or a 429 wait', async () => {
    for (const failure of [json('', { status: 503 }), json('', { status: 429, headers: { 'X-Rate-Limit-Retry-After-Seconds': '3600' } })]) {
      const { fetch } = scripted(failure);
      const { feed, timers, fire, advance } = viewportFeed(fetch);
      feed.setAreas([LONDON]);
      await fire();
      const waiting = timers.length;
      advance(30_000);
      feed.setAreas([MADRID]);
      expect(timers).toHaveLength(waiting);
    }
  });

  it('polls far-apart views as separate small requests in one poll', async () => {
    const { fetch, calls } = scripted(json(recorded), json(recorded));
    const { feed, fire, upserts } = viewportFeed(fetch);
    feed.setAreas([LONDON, TOKYO]);
    await fire();
    expect(calls.map((c) => box(c.url))).toEqual(['51,-1,52,1', '35,139,36,141']);
    expect(upserts).toHaveLength(26);
    expect(feed.health()).toMatchObject({ creditsPerPoll: 2, aircraft: 26 });
  });

  it('keeps what earlier requests returned when a later one fails, but counts the poll as failed', async () => {
    const { fetch } = scripted(json(recorded), json('', { status: 500 }));
    const { feed, fire, upserts, timers } = viewportFeed(fetch);
    feed.setAreas([LONDON, TOKYO]);
    await fire();
    expect(upserts).toHaveLength(13);
    expect(feed.health()).toMatchObject({ polled: 'none', lastError: 'HTTP 500', consecutiveFailures: 1 });
    expect(timers.at(-1)).toBe(POLL_MS); // backoff, floored at the interval
  });

  it('pauses when no browser has a view', async () => {
    const { fetch, calls } = scripted(json(recorded));
    const { feed, fire, advance, timers } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    await fire();
    feed.setAreas([]);
    advance(POLL_MS);
    await fire();
    expect(calls).toHaveLength(1);
    expect(timers).toEqual([0, POLL_MS]);
    expect(feed.health().paused).toBe(true);
  });

  it('polls early after a poll if the view moved while the request was in flight', async () => {
    let release: (r: Response) => void = () => {};
    const calls: string[] = [];
    const fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      if (calls.length === 1) return new Promise<Response>((r) => (release = r));
      return json(recorded);
    }) as typeof globalThis.fetch;
    const { feed, timers, fire, advance } = viewportFeed(fetch);
    feed.setAreas([LONDON]);
    const polling = fire();
    advance(5_000);
    feed.setAreas([MADRID]); // no timer pending: the poll is in flight
    await polling;
    release(json(recorded));
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); // let the poll finish
    expect(timers).toEqual([0, POLL_MS, 5_000]); // 10 s after that poll began (settling already passed)
  });
});

describe('openSkyStatus', () => {
  const healthy = { now: 1000, lastSuccessAt: 900, pausedUntil: null, failures: 0, lastError: null, nextPollAt: 61_000 };

  it('is ok after a successful poll', () => {
    expect(openSkyStatus(healthy)).toEqual({ feed: 'opensky', label: 'OpenSky', state: 'ok' });
  });

  it('is starting before the first success', () => {
    expect(openSkyStatus({ ...healthy, lastSuccessAt: null }).state).toBe('starting');
  });

  it('is failing with the error and the next retry', () => {
    expect(openSkyStatus({ ...healthy, failures: 2, lastError: 'HTTP 503', nextPollAt: 121_000 })).toMatchObject({
      state: 'failing',
      detail: 'HTTP 503',
      until: 121_000,
    });
  });

  it('is rate limited until polling resumes, outranking the failure count', () => {
    expect(openSkyStatus({ ...healthy, pausedUntil: 7_200_000, failures: 1, lastError: '429 rate limited' })).toEqual({
      feed: 'opensky',
      label: 'OpenSky',
      state: 'rate-limited',
      until: 7_200_000,
    });
  });

  it('stops saying rate limited once the wait has passed', () => {
    expect(openSkyStatus({ ...healthy, pausedUntil: 500 }).state).toBe('ok');
  });
});

describe('OpenSkyFeed.status', () => {
  it('follows the feed through a 429, a failure and recovery', async () => {
    const { fetch } = scripted(
      json('', { status: 429, headers: { 'X-Rate-Limit-Retry-After-Seconds': '3600' } }),
      json('', { status: 503 }),
      json(recorded),
    );
    const { feed, clock } = setup(fetch);
    expect(feed.status().state).toBe('starting');
    await feed.pollOnce();
    expect(feed.status()).toMatchObject({ state: 'rate-limited' });
    clock.advance(3_600_000);
    await feed.pollOnce();
    expect(feed.status()).toMatchObject({ state: 'failing', detail: 'HTTP 503' });
    await feed.pollOnce();
    expect(feed.status().state).toBe('ok');
  });
});
