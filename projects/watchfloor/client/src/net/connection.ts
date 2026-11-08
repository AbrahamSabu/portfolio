import { PROTOCOL_VERSION, parseServerMessage, type ClientMessage, type ServerMessage } from '@watchfloor/shared';

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'open' }
  | { status: 'waiting'; retryAt: number; refused?: true }
  /** Server speaks a different protocol version; reconnecting won't help. */
  | { status: 'incompatible'; serverProtocol: number };

export interface ConnectionHandlers {
  onMessage(message: ServerMessage, receivedAt: number): void;
  onState(state: ConnectionState): void;
}

/** What the page needs from its link to the server: the socket, or the demo's in-page server. */
export interface Link {
  send(message: ClientMessage): void;
  start(): void;
  stop(): void;
  retryNow(): void;
}

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
/** Turned away (1013, too many connections): a long wait at once, so a refused tab can't hammer the server. */
const REFUSED_WAIT_MS = 30_000;

/**
 * A WebSocket that keeps itself alive.
 *
 * Reconnects with exponential backoff plus jitter (so a server restart isn't
 * hit by every browser at the same instant), and runs a watchdog: the server
 * sends something every tick, so silence means the link is dead even if the
 * browser hasn't noticed yet.
 */
export class Connection implements Link {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private retryTimer: number | undefined;
  private watchdogTimer: number | undefined;
  private watchdogMs = 5000;
  private lastMessageAt = 0;
  private stopped = true;

  constructor(
    private readonly url: string,
    private readonly handlers: ConnectionHandlers,
  ) {}

  /** Send to the server if connected. Dropped otherwise: callers resend on the next hello. */
  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.watchdogTimer);
    this.ws?.close();
    this.ws = null;
  }

  /** Skip the backoff wait and try again now (e.g. a "Retry now" button). */
  retryNow(): void {
    if (this.stopped || this.ws) return;
    window.clearTimeout(this.retryTimer);
    this.connect();
  }

  private connect(): void {
    this.handlers.onState({ status: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      // The backoff resets on the hello, not here: a server that turns us away does so
      // after the upgrade, so an open followed by a close must still count as an attempt.
      this.handlers.onState({ status: 'open' });
      this.armWatchdog();
    };

    ws.onmessage = (event) => {
      const receivedAt = Date.now();
      this.lastMessageAt = receivedAt;
      this.armWatchdog();
      if (typeof event.data !== 'string') return;
      const parseStart = performance.now();
      const message = parseServerMessage(event.data);
      if (!message) return;
      // User Timing entries, visible in DevTools' Performance panel and to the headless measurements.
      if (message.type === 'snapshot') performance.measure('wf:snapshot-parse', { start: parseStart });

      if (message.type === 'hello') {
        if (message.protocol !== PROTOCOL_VERSION) {
          this.stopped = true;
          ws.close();
          this.handlers.onState({ status: 'incompatible', serverProtocol: message.protocol });
          return;
        }
        this.watchdogMs = Math.max(5000, message.tickMs * 5);
        this.attempt = 0;
      }
      this.handlers.onMessage(message, receivedAt);
    };

    ws.onclose = (event) => {
      // Stopped, or already replaced by a newer socket (restarted before this one
      // finished closing): nothing to reconnect, and the newer socket's watchdog stays.
      if (this.ws !== ws) return;
      window.clearTimeout(this.watchdogTimer);
      this.ws = null;
      if (!this.stopped) this.scheduleReconnect(event.code === 1013);
    };

    // onerror is always followed by onclose, which handles reconnection.
    ws.onerror = () => {};
  }

  private armWatchdog(): void {
    window.clearTimeout(this.watchdogTimer);
    this.watchdogTimer = window.setTimeout(() => {
      // A throttled background tab fires timers late in batches: if a message
      // did arrive recently by the wall clock, the link is fine — re-arm
      // instead of killing a healthy socket (each kill cost the server a
      // fresh world snapshot on reconnect).
      if (Date.now() - this.lastMessageAt < this.watchdogMs) {
        this.armWatchdog();
        return;
      }
      // close() would wait for a closing handshake that will never come on a dead link.
      const ws = this.ws;
      this.ws = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (!this.stopped) this.scheduleReconnect();
    }, this.watchdogMs);
  }

  private scheduleReconnect(refused = false): void {
    const base = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** this.attempt);
    const delay = refused ? REFUSED_WAIT_MS + Math.random() * 5_000 : base / 2 + Math.random() * (base / 2);
    this.attempt++;
    const retryAt = Date.now() + delay;
    this.handlers.onState({ status: 'waiting', retryAt, ...(refused ? { refused: true } : {}) });
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }
}

/** Same host as the page, so the Vite proxy (dev) and the Node server (prod) both just work. */
export function defaultSocketUrl(): string {
  const override = import.meta.env.VITE_WS_URL;
  if (override) return override;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
