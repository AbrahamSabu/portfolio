import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type BBox,
  type DeltaMessage,
  type HelloMessage,
  type ScenarioInfo,
  type SnapshotMessage,
  type StalenessRules,
  type TrafficKind,
} from '@watchfloor/shared';
import type { TrackStore } from './trackStore';
import { createLogger } from './log';

const log = createLogger('hub');

/**
 * A client with more than this many deltas not yet written to its socket is
 * too slow: stop sending and resync it later.
 *
 * Backlog is counted in deltas (roughly ticks behind), not bytes, because
 * message sizes vary a thousandfold: an empty delta is ~60 bytes, a worldwide
 * snapshot ~2.5 MB. Deltas queued behind a snapshot that is still being
 * written don't count, and no resync starts while one is in flight. Counting
 * bytes made one big snapshot look like a slow client, which got another
 * snapshot, which looked slow too: a snapshot storm.
 */
const MAX_PENDING_DELTAS = 5;
/** Memory backstop per client, whatever the message count. */
const MAX_BUFFERED_BYTES = 32 * 1024 * 1024;
const HEARTBEAT_MS = 15_000;
const MAX_CLIENTS = 200;

interface Client {
  ws: WebSocket;
  alive: boolean;
  /** Set when we skipped deltas for this client; it gets a full snapshot once it catches up. */
  needsResync: boolean;
  /** Deltas handed to ws but not yet written, excluding those queued behind a snapshot. */
  backlog: number;
  /** A snapshot has been handed to ws and not yet written. */
  snapshotInFlight: boolean;
  /** The area this browser last said it was looking at, if it has said. */
  view: BBox | null;
  address: string;
}

export interface HubOptions {
  server: Server;
  path: string;
  store: TrackStore;
  tickMs: number;
  staleness: StalenessRules;
  scenario: ScenarioInfo | null;
  traffic: TrafficKind;
  /**
   * Called with the new count whenever a browser connects or goes away, so
   * pay-per-request feeds can pause while nobody is watching.
   */
  onClientsChanged?: (count: number) => void;
  /**
   * Called with every browser's current view when any of them changes,
   * at most once per tick however often browsers send them.
   */
  onViewsChanged?: (views: BBox[]) => void;
}

/**
 * Fans the picture out to browsers.
 *
 * Every tick: prune dead tracks, collect what changed, serialise it once,
 * and send the same string to every client. Slow clients are skipped rather
 * than allowed to build an unbounded queue, then resynced with a snapshot.
 */
export class Hub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();
  /** Some browser's view changed (or one with a view left) since the last report. */
  private viewsDirty = false;
  private tickTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: HubOptions) {
    this.wss = new WebSocketServer({
      server: opts.server,
      path: opts.path,
      maxPayload: 4 * 1024, // browsers only send small view messages
      perMessageDeflate: { threshold: 1024 },
    });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  get clientCount(): number {
    return this.clients.size;
  }

  start(): void {
    this.tickTimer = setInterval(() => this.tick(), this.opts.tickMs);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  async stop(): Promise<void> {
    clearInterval(this.tickTimer);
    clearInterval(this.heartbeatTimer);
    for (const client of this.clients) client.ws.close(1001, 'Server shutting down');
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const address = req.socket.remoteAddress ?? 'unknown';
    if (this.clients.size >= MAX_CLIENTS) {
      ws.close(1013, 'Too many connections');
      return;
    }

    const client: Client = { ws, alive: true, needsResync: false, backlog: 0, snapshotInFlight: false, view: null, address };
    this.addClient(client);

    ws.on('pong', () => (client.alive = true));
    ws.on('close', () => this.dropClient(client, 'client disconnected'));
    ws.on('error', (err) => log.warn('client socket error', { address, error: err.message }));
    ws.on('message', (data) => this.onClientMessage(client, String(data)));

    const hello: HelloMessage = {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      serverTime: Date.now(),
      tickMs: this.opts.tickMs,
      staleness: this.opts.staleness,
      scenario: this.opts.scenario,
      traffic: this.opts.traffic,
    };
    client.ws.send(JSON.stringify(hello));
    this.sendSnapshot(client);
  }

  private sendSnapshot(client: Client): void {
    const snapshot: SnapshotMessage = {
      type: 'snapshot',
      serverTime: Date.now(),
      tracks: this.opts.store.snapshot(),
      trails: this.opts.store.trailSnapshot(),
    };
    client.snapshotInFlight = true;
    client.needsResync = false;
    // The callback fires once ws has written the message, or on error.
    client.ws.send(JSON.stringify(snapshot), () => (client.snapshotInFlight = false));
  }

  private sendDelta(client: Client, payload: string): void {
    // Waiting behind a snapshot is expected, not a sign of a slow client.
    const counted = !client.snapshotInFlight;
    if (counted) client.backlog++;
    client.ws.send(payload, () => {
      if (counted) client.backlog--;
    });
  }

  private isLagging(client: Client): boolean {
    if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) return true;
    return !client.snapshotInFlight && client.backlog > MAX_PENDING_DELTAS;
  }

  private tick(): void {
    this.reportViews();
    const now = Date.now();
    this.opts.store.prune(now);
    const { upserts, removals } = this.opts.store.flush();

    // Always send, even when empty: it doubles as a heartbeat the browser can watch,
    // and carries serverTime for clock-offset estimation.
    const delta: DeltaMessage = { type: 'delta', serverTime: now, upserts, removals };
    const payload = JSON.stringify(delta);

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (this.isLagging(client)) {
        if (!client.needsResync) log.warn('client falling behind, pausing', { address: client.address });
        client.needsResync = true;
        continue;
      }
      if (client.needsResync) {
        this.sendSnapshot(client);
      } else {
        this.sendDelta(client, payload);
      }
    }
  }

  private addClient(client: Client): void {
    this.clients.add(client);
    log.info('client connected', { address: client.address, clients: this.clients.size });
    this.opts.onClientsChanged?.(this.clients.size);
  }

  /** Safe to call twice (terminate() is followed by a close event): only a real removal notifies. */
  private dropClient(client: Client, reason: string): void {
    if (!this.clients.delete(client)) return;
    log.info(reason, { address: client.address, clients: this.clients.size });
    if (client.view) this.viewsDirty = true;
    this.opts.onClientsChanged?.(this.clients.size);
  }

  /** Browser messages are untrusted: anything that doesn't parse is ignored. */
  private onClientMessage(client: Client, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) {
      log.debug('ignored client message', { address: client.address });
      return;
    }
    client.view = message.bbox;
    this.viewsDirty = true; // reported on the next tick, which also rate-limits a chatty browser
  }

  private reportViews(): void {
    if (!this.viewsDirty) return;
    this.viewsDirty = false;
    const views: BBox[] = [];
    for (const client of this.clients) if (client.view) views.push(client.view);
    this.opts.onViewsChanged?.(views);
  }

  /** Protocol-level ping/pong: drop connections that silently died (sleeping laptops, NAT timeouts). */
  private heartbeat(): void {
    for (const client of this.clients) {
      if (!client.alive) {
        client.ws.terminate();
        this.dropClient(client, 'terminated unresponsive client');
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }
}
