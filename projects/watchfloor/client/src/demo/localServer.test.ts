import type { NewsItem, ServerMessage, SnapshotMessage } from '@watchfloor/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../net/connection';
import { LocalServer } from './localServer';

beforeAll(() => {
  // The demo server only needs timers from `window`; Node has them globally.
  vi.stubGlobal('window', globalThis);
});

let server: LocalServer | undefined;
afterEach(() => {
  server?.stop();
  vi.unstubAllGlobals();
  vi.stubGlobal('window', globalThis);
});

/**
 * Start a demo server and collect what it says, until `until` is satisfied.
 * On the Channel, which is quick to run through an hour of; the World, what
 * the demo really shows, has a test of its own.
 */
async function run(
  until: (messages: ServerMessage[]) => boolean,
  scenario = 'english-channel',
): Promise<{ messages: ServerMessage[]; states: ConnectionState[] }> {
  const messages: ServerMessage[] = [];
  const states: ConnectionState[] = [];
  server = new LocalServer({ onMessage: (m) => messages.push(m), onState: (s) => states.push(s) }, { scenario });
  server.start();
  await vi.waitFor(() => expect(until(messages)).toBe(true), { timeout: 60_000, interval: 50 });
  return { messages, states };
}

const snapshotOf = (messages: ServerMessage[]) => messages.find((m): m is SnapshotMessage => m.type === 'snapshot');

describe('LocalServer (the static demo)', () => {
  it('opens like a real server: hello first, simulated traffic, then a full snapshot', async () => {
    const { messages, states } = await run((m) => m.some((x) => x.type === 'snapshot'));
    expect(states.map((s) => s.status)).toEqual(['connecting', 'open']);
    const hello = messages[0];
    expect(hello?.type).toBe('hello');
    expect(hello?.type === 'hello' && hello.traffic).toBe('simulated');
    expect(snapshotOf(messages)!.tracks.length).toBeGreaterThan(50);
  });

  it('comes with history, so the timeline has a past to replay', async () => {
    const { messages } = await run((m) => m.some((x) => x.type === 'snapshot'));
    const ships = snapshotOf(messages)!.tracks.filter((t) => t.domain === 'sea');
    server!.send({ type: 'replay', bbox: { south: 48, west: -6, north: 52, east: 3 } });
    const replay = messages.find((m) => m.type === 'replay');
    expect(replay?.type).toBe('replay');
    if (replay?.type !== 'replay') return;
    // Ships stay in the area all run, so their paths reach well into the past.
    const oldest = Math.min(...replay.tracks.flatMap((t) => t.points.map((p) => p[2])));
    expect(Date.now() - oldest).toBeGreaterThan(25 * 60_000);
    expect(ships.length).toBeGreaterThan(20);
  });

  it('answers a track request with its path and (empty) details', async () => {
    const { messages } = await run((m) => m.some((x) => x.type === 'snapshot'));
    const id = snapshotOf(messages)!.tracks[0]!.id;
    server!.send({ type: 'track', id });
    const path = messages.find((m) => m.type === 'path');
    expect(path?.type === 'path' && path.points.length).toBeGreaterThan(1);
    expect(messages.some((m) => m.type === 'details')).toBe(true);
  });

  it('shows the whole world by default: thousands of aircraft and ships, everywhere', { timeout: 90_000 }, async () => {
    const messages: ServerMessage[] = [];
    server = new LocalServer({ onMessage: (m) => messages.push(m), onState: () => {} });
    server.start();
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'snapshot')).toBe(true), { timeout: 85_000, interval: 100 });
    const hello = messages[0];
    expect(hello?.type === 'hello' && hello.scenario?.id).toBe('world');
    const tracks = snapshotOf(messages)!.tracks;
    expect(tracks.filter((t) => t.domain === 'air').length).toBeGreaterThan(2000);
    expect(tracks.filter((t) => t.domain === 'sea').length).toBeGreaterThan(1000);
    // Every ocean has traffic, not just the Channel: both hemispheres, both sides of the date line.
    expect(tracks.some((t) => t.lat < -20)).toBe(true);
    expect(tracks.some((t) => t.lon < -100)).toBe(true);
    expect(tracks.some((t) => t.lon > 100)).toBe(true);
    // Rare aircraft too, found by the real rare watcher from their type codes.
    const findings = messages.find((m) => m.type === 'findings');
    const rare = findings?.type === 'findings' ? findings.items.filter((f) => f.kind === 'rare') : [];
    expect(rare.length).toBeGreaterThanOrEqual(8);
    expect(rare.map((f) => f.detail).join(' ')).toMatch(/BelugaXL|Dreamlifter|Ruslan|Galaxy|Sentry|Global Hawk/);
  });

  it('sends the published news, all of it first', async () => {
    const story: NewsItem = {
      id: 'g1',
      headline: 'A headline, verbatim',
      url: 'https://example.org/a',
      outlet: 'example.org',
      lat: 51.5,
      lon: -0.1,
      place: 'London, United Kingdom',
      kind: 'politics',
      publishedAt: Date.now() - 30 * 60_000,
    };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ version: 1, stamps: [], items: [story] })));
    const { messages } = await run((m) => m.some((x) => x.type === 'news'));
    const news = messages.find((m) => m.type === 'news');
    expect(news?.type === 'news' && news.replace).toBe(true);
    expect(news?.type === 'news' && news.items.map((i) => i.headline)).toEqual(['A headline, verbatim']);
  });

  it('keeps ticking deltas once live', async () => {
    // The past ends on "now", when everything has just reported, so the very
    // first second can be quiet; within a few, reports flow every tick.
    const { messages } = await run((m) => m.filter((x) => x.type === 'delta' && x.upserts.length > 0).length >= 2);
    expect(messages.filter((m) => m.type === 'delta').length).toBeLessThan(10);
  });
});
