import { describe, expect, it } from 'vitest';
import type { Logger } from '../../log';
import { AisStreamFeed, type AisSocket, type AisSocketHandlers, type AisStreamOptions } from './aisStreamFeed';

const CHANNEL = { south: 49.3, west: -4.5, north: 51.6, east: 2.8 };
const NORTH_SEA = { south: 53, west: 1, north: 57, east: 6 };
const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const CONFIRM = JSON.stringify({ Message: { CompressionEnabled: true }, MessageType: 'SubscriptionConfirmation' });

class FakeSocket implements AisSocket {
  sent: Array<{ at: number; boxes: unknown }> = [];
  terminated = false;
  constructor(readonly h: AisSocketHandlers, private readonly clock: () => number) {}
  send(data: string) {
    this.sent.push({ at: this.clock(), boxes: (JSON.parse(data) as { BoundingBoxes: unknown }).BoundingBoxes });
  }
  ping() {
    this.h.onPong();
  }
  terminate() {
    if (this.terminated) return;
    this.terminated = true;
    this.h.onClose(1006, '');
  }
  accept() {
    this.h.onOpen();
    this.h.onMessage(CONFIRM);
  }
}

function harness(extra: Partial<AisStreamOptions> = {}) {
  let now = Date.parse('2026-10-27T20:41:00Z');
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sockets: FakeSocket[] = [];
  const feed = new AisStreamFeed({
    apiKey: 'test-key',
    boxes: [],
    viewport: true,
    connect: (_url, h) => {
      const s = new FakeSocket(h, () => now);
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
  const sink = { upsert() {}, remove() {} };
  const last = () => sockets[sockets.length - 1]!;
  return { feed, sockets, advance, sink, last, now: () => now };
}

describe('AisStreamFeed resubscribe pacing across a reconnect', () => {
  it('never sends two subscriptions within a second of each other on one connection', () => {
    const h = harness();
    h.feed.start(h.sink);
    h.feed.setAreas([CHANNEL]); // connects
    h.last().accept(); // subscription 1 on socket 1
    const t0 = h.now();

    h.advance(500);
    h.feed.setAreas([NORTH_SEA]); // a resubscribe is now pending for t0 + 2 s
    h.advance(100);
    h.last().h.onClose(1006, ''); // AISStream drops the socket at t0 + 0.6 s; retry due at t0 + 1.35 s
    h.advance(750);
    expect(h.sockets).toHaveLength(2); // reconnected
    h.advance(50);
    h.last().accept(); // open: the new socket subscribes at t0 + 1.4 s

    h.advance(600); // t0 + 2.0 s: the stale resubscribe timer from socket 1 fires
    const sent = h.last().sent;
    const gaps = sent.slice(1).map((s, i) => s.at - sent[i]!.at);
    // Expected: one subscription on the new socket (the stale timer belonged to the old one).
    // Actual: two, 600 ms apart; AISStream closes a connection updated more than once a second.
    expect.soft(gaps).toEqual([]); // prints the gap between the two sends
    expect(sent).toHaveLength(1);
  });
});
