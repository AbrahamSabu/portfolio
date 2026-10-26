import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_STALENESS } from '@watchfloor/shared';
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
});
