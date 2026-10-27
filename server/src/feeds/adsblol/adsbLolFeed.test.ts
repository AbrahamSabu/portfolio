import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import type { TrackSink } from '../feed';
import { AdsbLolFeed } from './adsbLolFeed';

const POLL_MS = 30_000;
const cairo = readFileSync(new URL('./fixtures/cairo-2026-10-27.json', import.meta.url), 'utf8');
const JOHANNESBURG = { south: -27, west: 27.5, north: -25.5, east: 29 };
const HIGHVELD_TO_DURBAN = { south: -31, west: 26, north: -24, east: 32 };
const SOUTH_AFRICA = { south: -35, west: 16, north: -22, east: 33 };
const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const json = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) } });

function setup(...responses: Response[]) {
  let now = 1_793_121_200_000;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const sleeps: number[] = [];
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
    sleep: async (ms) => void sleeps.push(ms),
    setTimer: (fn, ms) => {
      timers.push(ms);
      latest = fn;
    },
    clearTimer: () => {},
    log: silent,
  });
  const sink: TrackSink = { upsert: (r) => upserts.push(r as { id: string }), remove: (id) => removals.push(id) };
  feed.start(sink);
  const fire = async () => {
    latest();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { feed, calls, sleeps, timers, upserts, removals, fire, advance: (ms: number) => (now += ms) };
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

  it('spaces requests within a poll a second apart', async () => {
    const { feed, calls, sleeps, fire } = setup(json(cairo), json(cairo));
    feed.setAreas([HIGHVELD_TO_DURBAN]);
    await fire();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it('stands aside for views wider than a region, without calling it a fault', () => {
    const { feed, timers } = setup();
    feed.setAreas([SOUTH_AFRICA]);
    expect(timers).toEqual([]);
    expect(feed.status().state).toBe('ok');
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

  it('polls early when the view moves somewhere new', async () => {
    const { feed, calls, timers, fire, advance } = setup(json(cairo), json(cairo));
    feed.setAreas([JOHANNESBURG]);
    await fire();
    advance(15_000);
    feed.setAreas([{ south: -30.5, west: 30, north: -29, east: 31.5 }]); // Durban
    expect(timers.at(-1)).toBe(2_000); // the 2 s settle, well before the regular 30 s poll
    await fire();
    expect(calls).toHaveLength(2);
  });
});
