import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import type { TrackSink } from '../feed';
import { AdsbLolFeed, type AdsbLolOptions } from './adsbLolFeed';

const POLL_MS = 30_000;
const cairo = readFileSync(new URL('./fixtures/cairo-2026-10-27.json', import.meta.url), 'utf8');
const JOHANNESBURG = { south: -27, west: 27.5, north: -25.5, east: 29 };
const HIGHVELD_TO_DURBAN = { south: -31, west: 26, north: -24, east: 32 };
const SOUTH_AFRICA = { south: -35, west: 16, north: -22, east: 33 };
const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const json = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) } });

function setup(...responses: Response[]) {
  return setupWith({}, ...responses);
}

/** `watched: false` mimics index.ts, which tells feeds nobody is connected before starting them. */
function setupWith(extra: Partial<AdsbLolOptions> & { watched?: boolean }, ...responses: Response[]) {
  let now = 1_793_121_200_000;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const timers: number[] = [];
  let latest: () => void = () => {};
  const upserts: Array<{ id: string; provider?: string }> = [];
  const removals: string[] = [];
  const feed = new AdsbLolFeed({
    pollMs: POLL_MS,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const next = responses.shift();
      if (!next) throw new Error('fake fetch: no more responses');
      return next;
    }) as typeof fetch,
    now: () => now,
    random: () => 1,
    setTimer: (fn, ms) => {
      timers.push(ms);
      latest = fn;
    },
    clearTimer: () => {},
    log: silent,
    ...extra,
  });
  if (extra.watched === false) feed.setDemand(false);
  const sink: TrackSink = { upsert: (r) => upserts.push(r as { id: string }), remove: (id) => removals.push(id) };
  feed.start(sink);
  const fire = async () => {
    latest();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { feed, calls, timers, upserts, removals, fire, advance: (ms: number) => (now += ms) };
}

describe('AdsbLolFeed', () => {
  it('waits for a view, then polls its circle politely and pushes merged-ready reports', async () => {
    const { feed, calls, timers, fire, upserts, removals } = setup(json(cairo));
    expect(timers).toEqual([]);
    feed.setAreas([JOHANNESBURG]);
    await fire();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/^https:\/\/api\.adsb\.lol\/v2\/point\/-26(\.5)?\/28(\.5)?\/\d+$/);
    expect((calls[0]!.init?.headers as Record<string, string>)['User-Agent']).toMatch(/Watchfloor/);
    expect(upserts).toHaveLength(37);
    expect(upserts.every((u) => u.id.startsWith('adsb:') && u.provider === 'adsb.lol')).toBe(true);
    expect(removals).toHaveLength(3); // on the ground
    expect(feed.status().state).toBe('ok');
  });

  it('fetches at most two circles at once, and pushes each as it answers', async () => {
    let inFlight = 0;
    let most = 0;
    const releases: Array<() => void> = [];
    const pushedAtRelease: number[] = [];
    const upserts: unknown[] = [];
    const feed = new AdsbLolFeed({
      pollMs: POLL_MS,
      fetch: (async () => {
        inFlight++;
        most = Math.max(most, inFlight);
        await new Promise<void>((r) => releases.push(r));
        inFlight--;
        return json(cairo);
      }) as typeof fetch,
      now: () => 1_793_121_200_000,
      setTimer: (fn) => void setTimeout(fn, 0),
      clearTimer: () => {},
      log: silent,
    });
    feed.start({ upsert: (r) => upserts.push(r), remove: () => {} });
    feed.setAreas([{ south: -31, west: 22, north: -24, east: 32 }]); // four circles
    const tick = () => new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < 4; i++) {
      while (releases.length === 0) await tick();
      releases.shift()!();
      await tick();
      pushedAtRelease.push(upserts.length);
    }
    feed.stop();
    expect(most).toBe(2);
    expect(pushedAtRelease).toEqual([37, 74, 111, 148]);
  });

  it('stands aside for views wider than a region, and says so', () => {
    const { feed, timers } = setup();
    feed.setAreas([SOUTH_AFRICA]);
    expect(timers).toEqual([]);
    expect(feed.status().state).toBe('standing-aside');
    expect(feed.health().standingAside).toBe('view wider than a region');
  });

  it('waits as long as Retry-After says on 429', async () => {
    const { feed, timers, fire } = setup(json('', { status: 429, headers: { 'Retry-After': '120' } }));
    feed.setAreas([JOHANNESBURG]);
    await fire();
    expect(timers.at(-1)).toBe(120_000);
    expect(feed.status().state).toBe('rate-limited');
  });

  it('keeps what earlier circles returned when a later one fails, and backs off', async () => {
    const { feed, fire, upserts, timers } = setup(json(cairo), json('', { status: 503 }));
    feed.setAreas([HIGHVELD_TO_DURBAN]);
    await fire();
    expect(upserts).toHaveLength(37);
    expect(timers.at(-1)).toBe(POLL_MS);
    expect(feed.status()).toMatchObject({ state: 'failing', detail: 'HTTP 503' });
    expect(feed.health().polled).toBe('none');
  });

  it('polls a moved view soon after the last poll: free, so a 3 s gap instead of 10 s', async () => {
    const { feed, timers, fire, advance } = setup(json(cairo), json(cairo));
    feed.setAreas([JOHANNESBURG]);
    await fire();
    advance(500);
    feed.setAreas([{ south: -30.5, west: 30, north: -29, east: 31.5 }]);
    expect(timers.at(-1)).toBe(2_500); // 3 s after that poll began
  });

  it('polls early when the view moves somewhere new', async () => {
    const { feed, calls, timers, fire, advance } = setup(json(cairo), json(cairo));
    feed.setAreas([JOHANNESBURG]);
    await fire();
    advance(15_000);
    feed.setAreas([{ south: -30.5, west: 30, north: -29, east: 31.5 }]); // Durban
    expect(timers.at(-1)).toBe(1_000); // a 1 s settle, well before the regular 30 s poll
    await fire();
    expect(calls).toHaveLength(2);
  });

  describe('with a home area', () => {
    const HOME = [{ lat: -26, lon: 28, radiusNm: 250 }];
    const warm = (...r: Response[]) => setupWith({ home: HOME, warmPollMs: 60_000, watched: false }, ...r);

    it('keeps the home area warm with nobody watching, at the slower interval', async () => {
      const { calls, timers, fire, upserts } = warm(json(cairo), json(cairo));
      expect(timers).toEqual([0]); // polls at once, no viewer needed
      await fire();
      expect(calls[0]!.url).toMatch(/\/v2\/point\/-26\/28\/250$/);
      expect(upserts).toHaveLength(37);
      expect(timers.at(-1)).toBe(60_000);
    });

    it('polls almost at once when a viewer arrives to warm data older than a watched poll', async () => {
      const { feed, calls, timers, fire, advance } = warm(json(cairo), json(cairo), json(cairo));
      await fire();
      advance(45_000); // older than POLL_MS (30 s), not yet due (60 s)
      feed.setDemand(true);
      expect(timers.at(-1)).toBe(1_000); // the scheduler's settle, not the remaining 15 s
      await fire();
      expect(calls).toHaveLength(2);
      expect(timers.at(-1)).toBe(POLL_MS); // watched cadence from now on
    });

    it('adds view circles only where the home area does not already cover them', async () => {
      const { feed, calls, fire } = warm(json(cairo), json(cairo), json(cairo), json(cairo));
      await fire();
      feed.setDemand(true);
      feed.setAreas([JOHANNESBURG]); // inside home
      await fire();
      expect(calls).toHaveLength(2);
      feed.setAreas([{ south: -34.5, west: 18, north: -33.5, east: 19 }]); // Cape Town, outside
      await fire();
      expect(calls.slice(2).map((c) => c.url.split('/point/')[1])).toEqual(['-26/28/250', expect.stringMatching(/^-34/)]);
    });

    it('stretches the interval with the number of circles, so a wide view stays within budget', async () => {
      const r = () => json(cairo);
      const { feed, timers, fire } = setupWith({ home: HOME, pollMs: 10_000, watched: true }, r(), r(), r(), r(), r(), r(), r(), r());
      await fire();
      expect(timers.at(-1)).toBe(10_000); // home only: 1 circle
      feed.setAreas([{ south: -34.5, west: 18, north: -33.5, east: 19 }, { south: -30.5, west: 30.5, north: -29.5, east: 31.5 }]);
      await fire();
      expect(timers.at(-1)).toBe(15_000); // home, Cape Town and Durban: 3 circles x 5 s
    });
  });
});
