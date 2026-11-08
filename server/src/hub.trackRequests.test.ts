import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_STALENESS } from '@watchfloor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Hub } from './hub';
import { TrackStore } from './trackStore';

describe('Hub track requests', () => {
  let server: Server | undefined;
  let hub: Hub | undefined;

  afterEach(async () => {
    await hub?.stop();
    await new Promise((r) => server?.close(r));
  });

  it('answers the latest of two quick selections (the browser sends one request per selection and never retries)', async () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    const now = Date.now();
    for (const hex of ['aaaaaa', 'bbbbbb']) {
      store.ingest(
        { id: `adsb:${hex}`, source: 'adsb', domain: 'air', platform: 'aircraft', affiliation: 'unknown', lat: 50, lon: 0, courseDeg: 0, speedMps: 100, observedAt: now },
        now,
      );
    }
    const asked: string[] = [];
    server = createServer();
    hub = new Hub({
      server, path: '/ws', store, tickMs: 1000, staleness: DEFAULT_STALENESS, scenario: null, traffic: 'live',
      onTrackRequest: (id, send) => {
        asked.push(id);
        send({ type: 'details', serverTime: Date.now(), id, details: {} } as never);
      },
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const replies: string[] = [];
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as { type: string; id?: string };
      if (m.type === 'details' && m.id) replies.push(m.id);
    });
    await new Promise<void>((r) => ws.once('open', () => r()));
    // Arrow down the track list: two selections a few ms apart; main.ts:517-522 sends one `track` each.
    ws.send(JSON.stringify({ type: 'track', id: 'adsb:aaaaaa' }));
    ws.send(JSON.stringify({ type: 'track', id: 'adsb:bbbbbb' }));
    await new Promise((r) => setTimeout(r, 600));
    ws.close();
    expect.soft(replies).toContain('adsb:aaaaaa'); // sanity: requests do parse and get answered
    // Expected: the track now selected (bbbbbb) is answered, at once or after the gap.
    // Actual: its request is dropped by the 200 ms gap (hub.ts:367-372), with no reply and no retry,
    // so its details and path never arrive until the user selects it again.
    expect(asked).toContain('adsb:bbbbbb');
    expect(replies).toContain('adsb:bbbbbb');
  });
});
