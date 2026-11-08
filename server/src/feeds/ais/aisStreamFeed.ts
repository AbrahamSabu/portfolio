import type { BBox, FeedStatus, ShipDetails } from '@watchfloor/shared';
import { WebSocket, type RawData } from 'ws';
import { createLogger, type Logger } from '../../log';
import { Backoff } from '../backoff';
import { describeBoxes, planAisBoxes } from './areas';
import type { Feed, TrackSink } from '../feed';
import { mapAisMessage, parseStreamMessage, SUBSCRIBED_TYPES, type AisSkipReason } from './mapAis';
import { ShipRegistry } from './ships';

export const DEFAULT_AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 2 * 60_000;
/**
 * AISStream answers a rejected subscription (bad key, a fourth connection on
 * one account) by dropping the socket without a word, so a close before the
 * confirmation waits at least this long: retrying a bad key every second
 * would only hammer them.
 */
const REJECTED_RETRY_MS = 30_000;
/** A connection that stayed up this long was healthy, so the next failure starts the backoff afresh. */
const HEALTHY_AFTER_MS = 30_000;
/** Opening plus confirmation; AISStream itself closes after 3 s without a subscription. */
const CONFIRM_TIMEOUT_MS = 15_000;
/**
 * Keepalive. An empty patch of sea can be silent for minutes, so silence
 * alone doesn't mean the connection died; a missing pong does.
 */
const PING_EVERY_MS = 30_000;
/**
 * Least time between subscription messages on one connection. AISStream
 * closes a connection that updates more than once a second; twice the limit
 * leaves room for timer jitter.
 */
const RESUBSCRIBE_GAP_MS = 2_000;

/** The little of a WebSocket the feed uses, so tests can hand it a fake. */
export interface AisSocket {
  send(data: string): void;
  ping(): void;
  /** Drop the connection now (no closing handshake). onClose still follows. */
  terminate(): void;
}

export interface AisSocketHandlers {
  onOpen(): void;
  onMessage(text: string): void;
  onPong(): void;
  onClose(code: number, reason: string): void;
  onError(error: Error): void;
}

export type AisConnect = (url: string, handlers: AisSocketHandlers) => AisSocket;

export interface AisStreamOptions {
  /** Missing key: the feed never connects and says why in its status. */
  apiKey: string | undefined;
  /** Areas to subscribe to. Empty means there is nothing to stream yet. */
  boxes: BBox[];
  /** Follow what browsers are looking at (setAreas) instead of fixed boxes. */
  viewport?: boolean;
  /** With viewport: views wider than this many square degrees aren't streamed (0 or unset: any). */
  maxArea?: number;
  /** Stream URL, e.g. a local stub for rehearsing failures. Defaults to AISStream's. */
  url?: string;
  // Injectable for tests, so nothing touches the network or real time.
  connect?: AisConnect;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: Logger;
}

/**
 * Live ships from AISStream.io: one WebSocket, one subscription message, and
 * then a stream of decoded AIS messages for the subscribed boxes.
 *
 * Unlike the polled ADS-B feeds there is nothing to schedule: AISStream
 * pushes each message as its receivers hear it. The work is keeping one
 * connection healthy (reconnect with backoff, keepalive) and turning
 * messages into tracks (mapAis, ShipRegistry for names and types).
 *
 * It streams whether or not anyone is watching, so it has no setDemand().
 * AIS has no replay: a ship missed while disconnected only reappears when it
 * next reports, up to 3 minutes later for a moored one. Staying connected is
 * free and keeps the picture ready for the moment a page opens.
 */
export class AisStreamFeed implements Feed {
  readonly name = 'ais';

  private readonly connectFn: AisConnect;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly log: Logger;
  private readonly backoff: Backoff;
  private readonly ships = new ShipRegistry();

  private sink: TrackSink | null = null;
  private boxes: BBox[];

  private socket: AisSocket | null = null;
  private opened = false;
  private confirmedAt: number | null = null;
  private alive = true;
  private connectionError: string | null = null;
  private retryTimer: unknown = null;
  private retryAt: number | null = null;
  private watchdogTimer: unknown = null;
  private resubscribeTimer: unknown = null;
  private lastSubscribedAt = -Infinity;

  // Exposed through status() and health().
  private failures = 0;
  private lastError: string | null = null;
  private compression: boolean | null = null;
  private connections = 0;
  private messages = 0;
  private lastMessageAt: number | null = null;
  private rateWindow = { start: 0, count: 0, perSecond: 0 };
  private readonly skipped: Partial<Record<AisSkipReason | 'unparsed', number>> = {};

  constructor(private readonly opts: AisStreamOptions) {
    this.connectFn = opts.connect ?? connectWs;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.log = opts.log ?? createLogger('ais');
    this.backoff = new Backoff(MIN_BACKOFF_MS, MAX_BACKOFF_MS, opts.random);
    this.boxes = opts.boxes;
  }

  start(sink: TrackSink): void {
    this.sink = sink;
    if (!this.opts.apiKey) {
      this.log.warn('no AISSTREAM_API_KEY set: not connecting (get a free key at aisstream.io)');
      return;
    }
    this.reconcile();
  }

  stop(): void {
    this.sink = null;
    this.clearRetry();
    this.disconnect();
  }

  /**
   * Viewport mode: subscribe to what browsers are looking at. AISStream takes
   * a new subscription on the open connection (it replaces the old one), so
   * a pan costs one small message, not a reconnect. No views (everyone left)
   * keeps the last subscription streaming, ready for the next viewer.
   * There is no replay, so ships in a newly covered area appear as they next
   * report: seconds for ships underway, up to 3 minutes for moored ones.
   */
  /** What we know about these ships (by MMSI), to save with the picture. */
  savedShips(mmsis: Iterable<string>): Record<string, unknown> {
    return this.ships.toRecord(mmsis);
  }

  /** Bring back ships saved with the picture; returns how many were kept. */
  restoreShips(saved: unknown): number {
    return this.ships.load(saved);
  }

  /** What a ship has broadcast about its voyage and hull, for the details panel. */
  shipDetails(mmsi: string): ShipDetails | undefined {
    return this.ships.details(mmsi);
  }

  setAreas(views: BBox[]): void {
    if (!this.opts.viewport) return;
    const boxes = planAisBoxes(views, this.opts.maxArea);
    if (boxes.length === 0 || describeBoxes(boxes) === describeBoxes(this.boxes)) return;
    this.boxes = boxes;
    this.log.info('area changed', { boxes: describeBoxes(boxes) });
    if (this.socket && this.opened) this.resubscribe();
    else this.reconcile();
  }

  status(): FeedStatus {
    const base = { feed: this.name, label: 'AISStream' };
    if (!this.opts.apiKey) {
      return { ...base, state: 'unconfigured', detail: 'no API key, set AISSTREAM_API_KEY' };
    }
    if (this.socket && this.confirmedAt !== null) return { ...base, state: 'ok' };
    if (this.failures > 0) {
      return {
        ...base,
        state: 'failing',
        ...(this.lastError ? { detail: this.lastError } : {}),
        ...(this.retryAt !== null ? { until: this.retryAt } : {}),
      };
    }
    return { ...base, state: 'starting' };
  }

  health(): Record<string, unknown> {
    const now = this.now();
    return {
      configured: Boolean(this.opts.apiKey),
      connected: this.socket !== null && this.opened,
      subscribed: this.confirmedAt !== null,
      compression: this.compression,
      boxes: describeBoxes(this.boxes),
      connections: this.connections,
      messages: this.messages,
      messagesPerSecond: this.rateWindow.perSecond,
      lastMessageAgeS: this.lastMessageAt === null ? null : Math.round((now - this.lastMessageAt) / 1000),
      ships: this.ships.size,
      skipped: this.skipped,
      failures: this.failures,
      lastError: this.lastError,
      nextRetryAt: this.retryAt === null ? null : new Date(this.retryAt).toISOString(),
    };
  }

  /** Connect if we should be streaming and aren't (or aren't about to). */
  private reconcile(): void {
    const wanted = this.sink !== null && Boolean(this.opts.apiKey) && this.boxes.length > 0;
    if (wanted && !this.socket && this.retryTimer === null) this.connect();
  }

  private connect(): void {
    this.connections++;
    this.opened = false;
    this.confirmedAt = null;
    this.alive = true;
    this.connectionError = null;
    const socket = this.connectFn(this.opts.url ?? DEFAULT_AISSTREAM_URL, {
      onOpen: () => {
        if (this.socket !== socket) return;
        this.opened = true;
        // AISStream closes a connection with no subscription after 3 s.
        this.sendSubscription(socket);
      },
      onMessage: (text) => {
        if (this.socket === socket) this.onMessage(text);
      },
      onPong: () => {
        if (this.socket === socket) this.alive = true;
      },
      onError: (error) => {
        if (this.socket === socket && !this.connectionError) this.connectionError = error.message;
      },
      onClose: (code, reason) => {
        if (this.socket === socket) this.onClose(code, reason);
      },
    });
    this.socket = socket;
    this.armWatchdog(CONFIRM_TIMEOUT_MS, () => {
      this.connectionError = this.opened
        ? 'AISStream accepted the connection but never confirmed the subscription'
        : "Couldn't connect to AISStream (timed out)";
      socket.terminate();
    });
  }

  private sendSubscription(socket: AisSocket): void {
    socket.send(JSON.stringify(this.subscription()));
    this.lastSubscribedAt = this.now();
  }

  /** Send the current boxes on the open connection, no more than once per RESUBSCRIBE_GAP_MS. */
  private resubscribe(): void {
    if (this.resubscribeTimer !== null) return; // already due, and it sends the latest boxes
    const send = () => {
      if (this.socket && this.opened) this.sendSubscription(this.socket);
    };
    const wait = this.lastSubscribedAt + RESUBSCRIBE_GAP_MS - this.now();
    if (wait <= 0) {
      send();
      return;
    }
    this.resubscribeTimer = this.setTimer(() => {
      this.resubscribeTimer = null;
      send();
    }, wait);
  }

  private subscription(): Record<string, unknown> {
    return {
      APIKey: this.opts.apiKey,
      // AISStream wants [[lat, lon], [lat, lon]] corners: latitude first.
      BoundingBoxes: this.boxes.map((b) => [
        [b.south, b.west],
        [b.north, b.east],
      ]),
      FilterMessageTypes: SUBSCRIBED_TYPES,
    };
  }

  private onMessage(text: string): void {
    const now = this.now();
    this.alive = true;
    this.messages++;
    this.lastMessageAt = now;
    this.countRate(now);

    const msg = parseStreamMessage(text);
    if (msg === null) {
      this.skip('unparsed');
      return;
    }
    switch (msg.kind) {
      case 'confirmation':
        if (this.confirmedAt === null) this.onConfirmed(now, msg.compression);
        return;
      case 'error':
        // AISStream's own words beat our guess at why it closed.
        this.connectionError = `AISStream: ${msg.error}`;
        this.log.warn('AISStream reported an error', { error: msg.error });
        return;
      case 'ais': {
        // Data counts as confirmation, in case a confirmation frame is ever skipped.
        if (this.confirmedAt === null) this.onConfirmed(now, null);
        const outcome = mapAisMessage(msg);
        if (outcome.kind === 'skip') this.skip(outcome.reason);
        else if (outcome.kind === 'static') this.ships.learn(outcome.mmsi, outcome.identity);
        else this.sink?.upsert(this.ships.track(outcome));
      }
    }
  }

  private onConfirmed(now: number, compression: boolean | null): void {
    this.confirmedAt = now;
    if (compression !== null) this.compression = compression;
    if (this.failures > 0) this.log.info('reconnected', { after: this.failures });
    else this.log.info('subscribed', { boxes: this.boxes.length, compression });
    this.failures = 0;
    this.lastError = null;
    if (compression === false) {
      // AISStream limits bandwidth on uncompressed connections and drops what's over.
      this.log.warn('compression was not negotiated: AISStream may drop messages');
    }
    this.armKeepalive();
  }

  private onClose(code: number, reason: string): void {
    const now = this.now();
    const { opened, confirmedAt } = this;
    this.clearWatchdog();
    // A resubscribe due on this socket must not fire on the next one: a
    // second subscription within a second of the reconnect's own gets that
    // connection closed too, and the backoff doubles for nothing.
    if (this.resubscribeTimer !== null) this.clearTimer(this.resubscribeTimer);
    this.resubscribeTimer = null;
    this.opened = false;
    this.socket = null;
    this.confirmedAt = null;

    if (confirmedAt !== null && now - confirmedAt >= HEALTHY_AFTER_MS) this.backoff.reset();
    const rejected = opened && confirmedAt === null;
    this.failures++;
    this.lastError = this.connectionError ?? describeClose(code, reason, opened, rejected);
    const delay = Math.max(this.backoff.next(), rejected ? REJECTED_RETRY_MS : 0);
    this.log.warn('connection closed', { code, reason, error: this.lastError, retryInS: Math.round(delay / 1000) });

    this.retryAt = now + delay;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      this.retryAt = null;
      this.reconcile();
    }, delay);
  }

  /** Close on purpose: no failure, no retry. */
  private disconnect(): void {
    this.clearWatchdog();
    if (this.resubscribeTimer !== null) this.clearTimer(this.resubscribeTimer);
    this.resubscribeTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.confirmedAt = null;
    socket?.terminate();
  }

  private armKeepalive(): void {
    this.armWatchdog(PING_EVERY_MS, () => {
      const socket = this.socket;
      if (!socket) return;
      if (!this.alive) {
        this.connectionError = `No reply from AISStream for ${Math.round(PING_EVERY_MS / 1000)} s`;
        socket.terminate();
        return;
      }
      this.alive = false;
      socket.ping();
      this.armKeepalive();
    });
  }

  private armWatchdog(ms: number, fn: () => void): void {
    this.clearWatchdog();
    this.watchdogTimer = this.setTimer(() => {
      this.watchdogTimer = null;
      fn();
    }, ms);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) this.clearTimer(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.retryAt = null;
  }


  private skip(reason: AisSkipReason | 'unparsed'): void {
    this.skipped[reason] = (this.skipped[reason] ?? 0) + 1;
  }

  /** Messages per second over roughly the last 10 s, for /healthz. */
  private countRate(now: number): void {
    const w = this.rateWindow;
    if (w.count === 0) w.start = now;
    w.count++;
    const elapsed = now - w.start;
    if (elapsed >= 10_000) {
      w.perSecond = Math.round((w.count / elapsed) * 10_000) / 10;
      w.count = 0;
    }
  }
}

/** Why a connection ended, in words for the status bar. */
export function describeClose(code: number, reason: string, opened: boolean, rejected: boolean): string {
  if (!opened) return "Couldn't connect to AISStream";
  if (rejected) {
    return 'AISStream closed the connection before confirming the subscription: check AISSTREAM_API_KEY (3 connections per key at most)';
  }
  return `AISStream closed the connection (code ${code}${reason ? `: ${reason}` : ''})`;
}

/**
 * The real socket, with the `ws` client the server already uses. Node's
 * built-in WebSocket would do on Node 22+, but `ws` negotiates
 * permessage-deflate, which AISStream now requires to avoid bandwidth limits,
 * and it gives us ping/pong for the keepalive.
 */
const connectWs: AisConnect = (url, h) => {
  const ws = new WebSocket(url, { perMessageDeflate: true, handshakeTimeout: CONFIRM_TIMEOUT_MS });
  ws.on('open', () => h.onOpen());
  ws.on('message', (data: RawData) => {
    const buf = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
    h.onMessage(buf.toString('utf8'));
  });
  ws.on('pong', () => h.onPong());
  ws.on('error', (err) => h.onError(err));
  ws.on('close', (code, reason) => h.onClose(code, reason.toString('utf8')));
  return {
    send: (data) => ws.send(data),
    ping: () => ws.ping(),
    terminate: () => ws.terminate(),
  };
};
