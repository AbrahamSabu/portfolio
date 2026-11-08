import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_STALENESS, type BBox, type FeedStatus, type Track } from '@watchfloor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Hub } from './hub';
import { TrackStore } from './trackStore';

/**
 * Waits for a condition rather than sleeping a guessed time: the hub runs on
 * real timers and sockets, and on a loaded machine a fixed sleep either
 * fails (too short) or wastes seconds (too long).
 */
const until = async (ready: () => boolean, what: string, timeoutMs = 10_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('Hub', () => {
  let server: Server | undefined;
  let hub: Hub | undefined;

  afterEach(async () => {
    await hub?.stop();
    await new Promise((r) => server?.close(r));
  });

  it('limits connections per visitor, by the address header a proxy sets', async () => {
    server = createServer();
    hub = new Hub({
      server, path: '/ws', store: new TrackStore(DEFAULT_STALENESS), tickMs: 1000, staleness: DEFAULT_STALENESS,
      scenario: null, traffic: 'live', addressHeaders: ['cf-connecting-ip'], maxPerAddress: 2,
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const open = (ip: string) => new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { 'cf-connecting-ip': ip } });
    // 'hello' when the server greets it; the close code when it's turned away.
    const outcome = (ws: WebSocket) =>
      new Promise<string>((resolve) => {
        ws.on('message', (data) => {
          if ((JSON.parse(String(data)) as { type: string }).type === 'hello') resolve('hello');
        });
        ws.on('close', (code) => resolve(String(code)));
      });
    const a = open('203.0.113.9');
    const b = open('203.0.113.9');
    expect(await outcome(a)).toBe('hello');
    expect(await outcome(b)).toBe('hello');
    expect(await outcome(open('203.0.113.9'))).toBe('1013');
    const d = open('198.51.100.4');
    expect(await outcome(d)).toBe('hello');
    for (const ws of [a, b, d]) ws.close();
  });

  it("refuses a socket from another site's page, and takes the page's own or an allowed origin", async () => {
    server = createServer();
    hub = new Hub({
      server, path: '/ws', store: new TrackStore(DEFAULT_STALENESS), tickMs: 1000, staleness: DEFAULT_STALENESS,
      scenario: null, traffic: 'live', allowedOrigins: ['https://wall.example'],
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const outcome = (headers: Record<string, string>) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
        ws.on('message', (data) => {
          if ((JSON.parse(String(data)) as { type: string }).type === 'hello') {
            resolve('hello');
            ws.close();
          }
        });
        ws.on('close', (code) => resolve(String(code)));
      });
    expect(await outcome({ origin: 'https://evil.example' })).toBe('1008');
    expect(await outcome({ origin: `http://127.0.0.1:${port}` })).toBe('hello');
    expect(await outcome({ origin: 'https://wall.example' })).toBe('hello');
    expect(await outcome({})).toBe('hello'); // no Origin at all: curl, probes
  });

  it('limits how fast one address may open connections', async () => {
    server = createServer();
    hub = new Hub({
      server, path: '/ws', store: new TrackStore(DEFAULT_STALENESS), tickMs: 1000, staleness: DEFAULT_STALENESS,
      scenario: null, traffic: 'live',
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const sockets: WebSocket[] = [];
    const outcomes: Promise<string>[] = [];
    for (let i = 0; i < 7; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      sockets.push(ws);
      outcomes.push(
        new Promise<string>((resolve) => {
          ws.on('message', (data) => {
            if ((JSON.parse(String(data)) as { type: string }).type === 'hello') resolve('hello');
          });
          ws.on('close', (code) => resolve(String(code)));
        }),
      );
    }
    const results = await Promise.all(outcomes);
    expect(results.filter((r) => r === 'hello')).toHaveLength(6);
    expect(results.filter((r) => r === '1013')).toHaveLength(1);
    for (const ws of sockets) ws.close();
  });

  it("sends the day's news and the hazards after the snapshot, then changes as they come", async () => {
    const story = {
      id: '1', headline: 'Parliament passes the budget', url: 'https://example.org/a', outlet: 'example.org',
      lat: 51.5, lon: -0.12, place: 'London, United Kingdom', kind: 'politics' as const, publishedAt: 1,
    };
    const quake = {
      id: 'usgs:1', kind: 'earthquake' as const, source: 'usgs' as const, title: 'M 5.0 - Somewhere',
      lat: 10, lon: 20, time: 1, magnitude: 5, url: 'https://earthquake.usgs.gov/a',
    };
    server = createServer();
    hub = new Hub({
      server, path: '/ws', store: new TrackStore(DEFAULT_STALENESS), tickMs: 1000, staleness: DEFAULT_STALENESS,
      scenario: null, traffic: 'live', news: () => [story], hazards: () => [quake],
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const types: string[] = [];
    const extras: unknown[] = [];
    let got: () => void = () => {};
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as { type: string };
      types.push(m.type);
      if (m.type === 'news' || m.type === 'hazards') {
        extras.push(m);
        if (m.type === 'hazards' || extras.length > 2) got();
      }
    });
    await new Promise<void>((r) => (got = r));
    hub.broadcastNews([{ ...story, id: '2' }]);
    await new Promise<void>((r) => (got = r));
    hub.broadcastHazards([]);
    await new Promise<void>((r) => (got = r));
    ws.close();
    expect(types).toEqual(['hello', 'snapshot', 'news', 'hazards', 'news', 'hazards']);
    expect(extras).toMatchObject([
      { items: [story], replace: true },
      { items: [quake] },
      { items: [{ id: '2' }], replace: false },
      { items: [] },
    ]);
  });

  it('reports the client count as browsers connect and leave', async () => {
    const counts: number[] = [];
    let changed: () => void = () => {};
    server = createServer();
    hub = new Hub({
      server,
      path: '/ws',
      store: new TrackStore(DEFAULT_STALENESS),
      tickMs: 1000,
      staleness: DEFAULT_STALENESS,
      scenario: null,
      traffic: 'simulated',
      onClientsChanged: (n) => {
        counts.push(n);
        changed();
      },
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const nextChange = () => new Promise<void>((r) => (changed = r));

    const connected = nextChange();
    const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await connected;
    const second = nextChange();
    const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await second;

    const left = nextChange();
    a.close();
    await left;
    const empty = nextChange();
    b.terminate();
    await empty;

    expect(counts).toEqual([1, 2, 1, 0]);
  });

  it('does not mistake one big snapshot for a slow client', async () => {
    // About 8,000 aircraft, like a worldwide picture: the snapshot alone is over 2 MB.
    const store = new TrackStore(DEFAULT_STALENESS);
    const now = Date.now();
    for (let i = 0; i < 8000; i++) {
      const track: Track = {
        id: `adsb:${i.toString(16).padStart(6, '0')}`,
        source: 'adsb',
        domain: 'air',
        platform: 'aircraft',
        affiliation: 'unknown',
        callsign: `TEST${i}`,
        lat: -60 + (i % 120),
        lon: -170 + ((i * 7) % 340),
        altitudeM: 10_000,
        courseDeg: i % 360,
        speedMps: 230,
        observedAt: now,
      };
      store.ingest(track, now);
    }
    server = createServer();
    hub = new Hub({
      server,
      path: '/ws',
      store,
      tickMs: 10, // 100x the real rate, so a big snapshot is in flight across many ticks
      staleness: DEFAULT_STALENESS,
      scenario: null,
      traffic: 'live',
    });
    hub.start();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;

    const types: string[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    client.on('message', (data) => types.push(JSON.parse(String(data)).type));
    await until(() => types.filter((t) => t === 'delta').length > 10, 'ten deltas after the snapshot');
    client.close();

    // Counting bytes, the first snapshot made the client look slow and each
    // resync repeated it: about 30 snapshots in this window.
    expect(types.filter((t) => t === 'snapshot')).toHaveLength(1);
    expect(types.filter((t) => t === 'delta').length).toBeGreaterThan(10);
  });

  it('reports browser views promptly, coalescing bursts, and forgets them on disconnect', async () => {
    const reports: BBox[][] = [];
    server = createServer();
    hub = new Hub({
      server,
      path: '/ws',
      store: new TrackStore(DEFAULT_STALENESS),
      tickMs: 50,
      staleness: DEFAULT_STALENESS,
      scenario: null,
      traffic: 'live',
      onViewsChanged: (views) => reports.push(views),
    });
    hub.start();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const lastReport = () => JSON.stringify(reports.at(-1));
    const open = async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => ws.once('open', r));
      return ws;
    };
    const view = (west: number) => ({ south: 50, west, north: 51, east: west + 1 });

    const a = await open();
    for (let i = 0; i < 10; i++) a.send(JSON.stringify({ type: 'view', bbox: view(i) }));
    a.send('junk');
    a.send(JSON.stringify({ type: 'view', bbox: { south: 5, west: 0, north: 1, east: 1 } })); // inverted: ignored
    await until(() => lastReport() === JSON.stringify([view(9)]), "the burst's last view");
    expect(reports.length).toBeLessThanOrEqual(2); // a burst becomes one or two reports, not ten

    const b = await open();
    b.send(JSON.stringify({ type: 'view', bbox: view(100) }));
    await until(() => lastReport() === JSON.stringify([view(9), view(100)]), "the second browser's view");

    a.close();
    await until(() => lastReport() === JSON.stringify([view(100)]), "the first browser's view forgotten");

    // A message over the 4 KB limit closes that socket (ws enforces maxPayload).
    const closed = new Promise<number>((r) => b.once('close', (code) => r(code)));
    b.send('x'.repeat(5000));
    expect(await closed).toBe(1009);
  });

  it('sends feed status in hello, then on a delta only when it changes', async () => {
    let feeds: FeedStatus[] = [{ feed: 'opensky', label: 'OpenSky', state: 'starting' }];
    server = createServer();
    hub = new Hub({
      server,
      path: '/ws',
      store: new TrackStore(DEFAULT_STALENESS),
      tickMs: 30,
      staleness: DEFAULT_STALENESS,
      scenario: null,
      traffic: 'live',
      feedStatus: () => feeds,
    });
    hub.start();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;

    const messages: Array<{ type: string; feeds?: FeedStatus[] }> = [];
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    client.on('message', (data) => messages.push(JSON.parse(String(data))));
    await until(() => messages.length > 0, 'the hello');
    expect(messages[0]).toMatchObject({ type: 'hello', feeds });

    const before = messages.length;
    feeds = [{ feed: 'opensky', label: 'OpenSky', state: 'rate-limited', until: 123 }];
    const since = () => messages.slice(before);
    await until(() => since().some((m) => m.type === 'delta' && m.feeds), 'the delta carrying the change');
    // Three more ticks: the change rides on one delta only.
    const seen = since().length;
    await until(() => since().length >= seen + 3, 'three more deltas');
    const withFeeds = since().filter((m) => m.type === 'delta' && m.feeds);
    expect(withFeeds).toHaveLength(1);
    expect(withFeeds[0]!.feeds).toEqual(feeds);
    client.close();
  });
});

