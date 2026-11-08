import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@watchfloor/shared';
import { Connection, type ConnectionState } from './connection';

/** A WebSocket the test drives: it records every instance and fires events on demand. */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closeCalls = 0;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.closeCalls++;
    this.readyState = FakeWebSocket.CLOSING;
  }

  // The network's side of things.
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  closed(code = 1000): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  hello(): void {
    const hello = { type: 'hello', protocol: PROTOCOL_VERSION, serverTime: Date.now(), tickMs: 1000, staleness: { byDomain: {}, bySource: {} }, traffic: 'simulated', feeds: [] };
    this.onmessage?.({ data: JSON.stringify(hello) });
  }
}

describe('Connection', () => {
  const states: ConnectionState[] = [];
  const messages: string[] = [];
  const handlers = { onMessage: (m: { type: string }) => messages.push(m.type), onState: (s: ConnectionState) => states.push(s) };
  const waits = () => states.filter((s): s is Extract<ConnectionState, { status: 'waiting' }> => s.status === 'waiting');

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    states.length = 0;
    messages.length = 0;
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
  });
  afterEach(() => vi.useRealTimers());

  it('stopped then started before the old socket has closed, it keeps one live socket', () => {
    const c = new Connection('ws://test/ws', handlers);
    c.start();
    const a = FakeWebSocket.instances[0]!;
    a.open();
    // The hidden-tab timer stops the link; the user comes back before the closing handshake finishes.
    c.stop();
    c.start();
    expect(FakeWebSocket.instances).toHaveLength(2);
    const b = FakeWebSocket.instances[1]!;
    b.open();
    b.hello();
    // Now the old socket's close event lands: nothing to reconnect, and B is left alone
    // (2 s: any wrongly scheduled reconnect would have fired, and B's watchdog hasn't).
    a.closed();
    vi.advanceTimersByTime(2_000);
    expect({ sockets: FakeWebSocket.instances.length, waiting: waits().length, bClosed: b.closeCalls }).toEqual({ sockets: 2, waiting: 0, bClosed: 0 });
  });

  it('backs off when a server accepts and closes at once, instead of retrying several times a second', () => {
    const c = new Connection('ws://test/ws', handlers);
    c.start();
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const s = FakeWebSocket.instances.at(-1)!;
      s.open(); // the upgrade completed: the browser fires open...
      const closedAt = Date.now();
      s.closed(); // ...and the server's close lands right after
      delays.push(waits().at(-1)!.retryAt - closedAt);
      vi.advanceTimersByTime(60_000); // let whatever retry is scheduled fire
    }
    // The backoff only resets on a hello, so these grow towards the 10 s cap.
    expect(delays.at(-1)!, `retry delays were ${delays.map((d) => Math.round(d)).join(', ')} ms`).toBeGreaterThan(2_000);
    expect(delays[0]!).toBeLessThan(delays.at(-1)!);
  });

  it('waits half a minute when turned away for too many connections (1013), and says so', () => {
    const c = new Connection('ws://test/ws', handlers);
    c.start();
    const s = FakeWebSocket.instances[0]!;
    s.open();
    const closedAt = Date.now();
    s.closed(1013);
    const wait = waits().at(-1)!;
    expect(wait.refused).toBe(true);
    expect(wait.retryAt - closedAt).toBeGreaterThanOrEqual(30_000);
    vi.advanceTimersByTime(29_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('resets the backoff on a hello, not on the socket opening', () => {
    const c = new Connection('ws://test/ws', handlers);
    c.start();
    for (let i = 0; i < 3; i++) {
      const s = FakeWebSocket.instances.at(-1)!;
      s.open();
      s.closed();
      vi.advanceTimersByTime(60_000);
    }
    const s = FakeWebSocket.instances.at(-1)!;
    s.open();
    s.hello();
    const closedAt = Date.now();
    s.closed();
    expect(waits().at(-1)!.retryAt - closedAt).toBeLessThan(600);
  });
});
