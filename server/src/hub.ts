import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION,
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

/** If a client has this much unsent data queued, it's too slow: stop sending and resync later. */
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const HEARTBEAT_MS = 15_000;
const MAX_CLIENTS = 200;

interface Client {
  ws: WebSocket;
  alive: boolean;
  /** Set when we skipped deltas for this client; it gets a full snapshot once it catches up. */
  needsResync: boolean;
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
  private tickTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: HubOptions) {
    this.wss = new WebSocketServer({
      server: opts.server,
      path: opts.path,
      maxPayload: 64 * 1024, // clients don't send anything big
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

    const client: Client = { ws, alive: true, needsResync: false, address };
    this.addClient(client);

    ws.on('pong', () => (client.alive = true));
    ws.on('close', () => this.dropClient(client, 'client disconnected'));
    ws.on('error', (err) => log.warn('client socket error', { address, error: err.message }));
    // Nothing is expected from clients yet; ignore anything they send.
    ws.on('message', () => {});

    const hello: HelloMessage = {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      serverTime: Date.now(),
      tickMs: this.opts.tickMs,
      staleness: this.opts.staleness,
      scenario: this.opts.scenario,
      traffic: this.opts.traffic,
    };
    ws.send(JSON.stringify(hello));
    this.sendSnapshot(client);
  }

  private sendSnapshot(client: Client): void {
    const snapshot: SnapshotMessage = {
      type: 'snapshot',
      serverTime: Date.now(),
      tracks: this.opts.store.snapshot(),
      trails: this.opts.store.trailSnapshot(),
    };
    client.ws.send(JSON.stringify(snapshot));
    client.needsResync = false;
  }

  private tick(): void {
    const now = Date.now();
    this.opts.store.prune(now);
    const { upserts, removals } = this.opts.store.flush();

    // Always send, even when empty: it doubles as a heartbeat the browser can watch,
    // and carries serverTime for clock-offset estimation.
    const delta: DeltaMessage = { type: 'delta', serverTime: now, upserts, removals };
    const payload = JSON.stringify(delta);

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        if (!client.needsResync) log.warn('client falling behind, pausing', { address: client.address });
        client.needsResync = true;
        continue;
      }
      if (client.needsResync) {
        this.sendSnapshot(client);
      } else {
        client.ws.send(payload);
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
    this.opts.onClientsChanged?.(this.clients.size);
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
