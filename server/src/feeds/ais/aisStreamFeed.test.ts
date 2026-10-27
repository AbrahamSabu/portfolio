import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import { AisStreamFeed, type AisSocket, type AisSocketHandlers, type AisStreamOptions } from './aisStreamFeed';
import edge from './fixtures/edge-cases.json';

const CHANNEL = { south: 49.3, west: -4.5, north: 51.6, east: 2.8 };
const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const frame = (m: unknown) => JSON.stringify(m);
const CONFIRM = frame(edge.messages.confirmation);

class FakeSocket implements AisSocket {
  sent: unknown[] = [];
  pings = 0;
  /** A healthy server answers pings; turn off to play a dead connection. */
  answerPings = true;
  terminated = false;
  constructor(readonly url: string, readonly h: AisSocketHandlers) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  ping() {
    this.pings++;
    if (this.answerPings) this.h.onPong();
  }
  terminate() {
    if (this.terminated) return;
    this.terminated = true;
    this.h.onClose(1006, '');
  }
  /** The server end: open, then confirm. */
  accept() {
    this.h.onOpen();
    this.h.onMessage(CONFIRM);
  }
}

/** A clock and timers we move by hand. */
function harness(extra: Partial<AisStreamOptions> = {}) {
  let now = Date.parse('2026-10-27T20:41:00Z');
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sockets: FakeSocket[] = [];
  const upserts: Record<string, unknown>[] = [];
  const feed = new AisStreamFeed({
    apiKey: 'test-key',
    boxes: [CHANNEL],
    connect: (url, h) => {
      const s = new FakeSocket(url, h);
      sockets.push(s);
      return s;
    },
    now: () => now,
    random: () => 0.5,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id as number),
    log: quiet,
    ...extra,
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  const sink = { upsert: (r: unknown) => void upserts.push(r as Record<string, unknown>), remove() {} };
  const last = () => sockets[sockets.length - 1]!;
  return { feed, sockets, upserts, advance, sink, last, now: () => now };
}

describe('AisStreamFeed', () => {
  it('subscribes on open with lat-first boxes and only the types it maps', () => {
    const t = harness();
    t.feed.start(t.sink);
    expect(t.sockets).toHaveLength(1);
    expect(t.last().url).toBe('wss://stream.aisstream.io/v0/stream');
    expect(t.last().sent).toEqual([]);
    t.last().h.onOpen();
    expect(t.last().sent).toEqual([
      {
        APIKey: 'test-key',
        BoundingBoxes: [
          [
            [49.3, -4.5],
            [51.6, 2.8],
          ],
        ],
        FilterMessageTypes: [
          'PositionReport',
          'StandardClassBPositionReport',
          'ExtendedClassBPositionReport',
          'ShipStaticData',
          'StaticDataReport',
        ],
      },
    ]);
    expect(t.feed.status().state).toBe('starting');
    t.last().h.onMessage(CONFIRM);
    expect(t.feed.status()).toEqual({ feed: 'ais', label: 'AISStream', state: 'ok' });
    expect(t.feed.health()).toMatchObject({ subscribed: true, compression: true });
  });

  it('turns messages into named tracks', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().accept();
    t.last().h.onMessage(frame(edge.messages.shipStatic));
    t.last().h.onMessage(frame(edge.messages.classA));
    t.last().h.onMessage(frame(edge.messages.noPosition));
    t.last().h.onMessage('garbage');
    expect(t.upserts).toHaveLength(1);
    expect(t.upserts[0]).toMatchObject({ id: 'ais:235000001', callsign: 'TEST CARRIER', platform: 'cargo', domain: 'sea' });
    expect(t.feed.health()).toMatchObject({ messages: 5, ships: 1, skipped: { 'no-position': 1, unparsed: 1 } });
  });

  it('without a key, never connects and says so', () => {
    const t = harness({ apiKey: undefined });
    t.feed.start(t.sink);
    t.advance(10 * 60_000);
    expect(t.sockets).toHaveLength(0);
    expect(t.feed.status()).toEqual({
      feed: 'ais',
      label: 'AISStream',
      state: 'unconfigured',
      detail: 'no API key, set AISSTREAM_API_KEY',
    });
    expect(t.feed.health()).toMatchObject({ configured: false });
  });

  it('reconnects with growing backoff, and resets it after a healthy connection', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().h.onError(new Error('getaddrinfo ENOTFOUND'));
    t.last().h.onClose(1006, '');
    // random 0.5 → 75% of the window: 1 s window → 750 ms.
    expect(t.feed.status()).toMatchObject({ state: 'failing', detail: 'getaddrinfo ENOTFOUND', until: t.now() + 750 });
    t.advance(749);
    expect(t.sockets).toHaveLength(1);
    t.advance(1);
    expect(t.sockets).toHaveLength(2);
    t.last().h.onClose(1006, '');
    t.advance(1499);
    expect(t.sockets).toHaveLength(2);
    t.advance(1);
    expect(t.sockets).toHaveLength(3);

    // Up for a minute, then dropped: the backoff starts again from 1 s.
    t.last().accept();
    t.advance(60_000);
    t.last().h.onClose(1001, 'going away');
    expect(t.feed.status()).toMatchObject({
      state: 'failing',
      detail: 'AISStream closed the connection (code 1001: going away)',
      until: t.now() + 750,
    });
  });

  it('waits at least 30 s after a rejected subscription', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().h.onOpen();
    t.last().h.onClose(1006, '');
    expect(t.feed.status()).toMatchObject({ state: 'failing', until: t.now() + 30_000 });
    expect(t.feed.status().detail).toMatch(/check AISSTREAM_API_KEY/);
  });

  it("uses AISStream's own error text when it sends one", () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().h.onOpen();
    t.last().h.onMessage(frame(edge.messages.error));
    t.last().h.onClose(1000, '');
    expect(t.feed.status().detail).toBe('AISStream: Api Key Is Not Valid');
  });

  it('gives up on a connection that never confirms', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().h.onOpen();
    t.advance(15_000);
    expect(t.sockets[0]!.terminated).toBe(true);
    expect(t.feed.status().detail).toBe('AISStream accepted the connection but never confirmed the subscription');
  });

  it('pings to keep a quiet connection, and drops one that stops answering', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().accept();
    t.advance(60_000);
    expect(t.last().pings).toBe(2);
    expect(t.last().terminated).toBe(false);
    t.last().answerPings = false;
    t.advance(60_000);
    expect(t.sockets[0]!.terminated).toBe(true);
    expect(t.feed.status().detail).toBe('No reply from AISStream for 30 s');
    t.advance(1_000);
    expect(t.sockets).toHaveLength(2);
  });

  it('with nobody watching, keeps streaming for a grace period, then disconnects', () => {
    const t = harness();
    t.feed.setDemand(false);
    t.feed.start(t.sink);
    expect(t.sockets).toHaveLength(0);

    t.feed.setDemand(true);
    expect(t.sockets).toHaveLength(1);
    t.last().accept();
    t.feed.setDemand(false);
    t.advance(60_000);
    t.feed.setDemand(true); // a reload: same connection
    t.feed.setDemand(false);
    t.advance(119_999);
    expect(t.last().terminated).toBe(false);
    t.advance(1);
    expect(t.last().terminated).toBe(true);
    // Closing on purpose is not a failure, and nothing reconnects.
    expect(t.feed.status().state).toBe('starting');
    t.advance(10 * 60_000);
    expect(t.sockets).toHaveLength(1);

    t.feed.setDemand(true);
    expect(t.sockets).toHaveLength(2);
  });

  it("doesn't let a returning viewer skip the backoff", () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().h.onOpen();
    t.last().h.onClose(1006, ''); // rejected: 30 s
    t.feed.setDemand(false);
    t.feed.setDemand(true);
    expect(t.sockets).toHaveLength(1);
    t.advance(30_000);
    expect(t.sockets).toHaveLength(2);
  });

  it('stop() closes without retrying', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().accept();
    t.feed.stop();
    expect(t.last().terminated).toBe(true);
    t.advance(10 * 60_000);
    expect(t.sockets).toHaveLength(1);
  });
});

describe('AisStreamFeed in viewport mode', () => {
  const DOVER = { south: 50.6, west: 0.9, north: 51.3, east: 1.9 };
  const SOLENT = { south: 50.6, west: -1.6, north: 50.9, east: -1.0 };
  const boxesSent = (s: FakeSocket) => s.sent.map((m) => (m as { BoundingBoxes: unknown }).BoundingBoxes);

  it('waits for a view, then subscribes to it, snapped to whole degrees', () => {
    const t = harness({ boxes: [], viewport: true });
    t.feed.start(t.sink);
    expect(t.sockets).toHaveLength(0);
    t.feed.setAreas([DOVER]);
    t.last().h.onOpen();
    expect(boxesSent(t.last())).toEqual([
      [
        [
          [50, 0],
          [52, 2],
        ],
      ],
    ]);
  });

  it('resubscribes on the open connection, at most once every 2 s, with the latest view', () => {
    const t = harness({ boxes: [], viewport: true });
    t.feed.start(t.sink);
    t.feed.setAreas([DOVER]);
    t.last().accept();
    t.feed.setAreas([{ ...DOVER, west: 1.1 }]); // same whole degrees: nothing to send
    t.feed.setAreas([SOLENT]);
    t.feed.setAreas([SOLENT, DOVER]);
    expect(t.last().sent).toHaveLength(1);
    t.advance(2_000);
    expect(t.sockets).toHaveLength(1);
    expect(boxesSent(t.last())[1]).toEqual([
      [
        [50, -2],
        [51, -1],
      ],
      [
        [50, 0],
        [52, 2],
      ],
    ]);
    // Long after the last one, a change goes out at once.
    t.advance(10_000);
    t.feed.setAreas([DOVER]);
    expect(t.last().sent).toHaveLength(3);
  });

  it('keeps the last subscription when the views go away', () => {
    const t = harness({ boxes: [], viewport: true });
    t.feed.start(t.sink);
    t.feed.setAreas([DOVER]);
    t.last().accept();
    t.feed.setAreas([]);
    t.advance(10_000);
    expect(t.last().terminated).toBe(false);
    expect(t.last().sent).toHaveLength(1);
  });

  it('ignores views when it streams a fixed area', () => {
    const t = harness();
    t.feed.start(t.sink);
    t.last().accept();
    t.feed.setAreas([SOLENT]);
    t.advance(5_000);
    expect(t.last().sent).toHaveLength(1);
  });
});
