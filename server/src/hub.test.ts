import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_STALENESS, type Track } from '@watchfloor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Hub } from './hub';
import { TrackStore } from './trackStore';

describe('Hub', () => {
  let server: Server | undefined;
  let hub: Hub | undefined;

  afterEach(async () => {
    await hub?.stop();
    await new Promise((r) => server?.close(r));
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
    await new Promise((r) => setTimeout(r, 1500));
    client.close();

    // Counting bytes, the first snapshot made the client look slow and each
    // resync repeated it: about 30 snapshots in this window.
    expect(types.filter((t) => t === 'snapshot')).toHaveLength(1);
    expect(types.filter((t) => t === 'delta').length).toBeGreaterThan(10);
  });
});
