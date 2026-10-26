import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import type { TrackSink } from '../feed';
import { OpenSkyFeed, requestCost, type OpenSkyOptions } from './openSkyFeed';

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

describe('requestCost', () => {
  it('charges 1 credit for the English Channel box (about 17 square degrees)', () => {
    expect(requestCost(CHANNEL)).toBe(1);
  });

  it('follows the documented area bands', () => {
    expect(requestCost({ south: 0, west: 0, north: 10, east: 10 })).toBe(2);
    expect(requestCost({ south: 0, west: 0, north: 20, east: 20 })).toBe(3);
    expect(requestCost({ south: -90, west: -180, north: 90, east: 180 })).toBe(4);
  });
});

describe('OpenSkyFeed', () => {
  it('polls the scenario box anonymously and pushes what it maps', async () => {
    const { fetch, calls } = scripted(json(recorded, { headers: { 'X-Rate-Limit-Remaining': '399' } }));
    const { feed, upserts, removals } = setup(fetch);

    expect(await feed.pollOnce()).toBe(POLL_MS);

    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://opensky-network.org/api/states/all');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lamin: '49.3',
      lomin: '-4.5',
      lamax: '51.6',
      lomax: '2.8',
      extended: '1',
    });
    expect(authHeader(calls[0]!.init)).toBeUndefined();
    expect(upserts).toHaveLength(13);
    expect(removals).toHaveLength(5); // on the ground at Gatwick
    expect(feed.health()).toMatchObject({ auth: 'anonymous', aircraft: 13, creditsRemaining: 399 });
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
