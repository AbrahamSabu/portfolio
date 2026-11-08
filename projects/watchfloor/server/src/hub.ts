import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  encodeServerMessage,
  isRoomRequest,
  type BBox,
  type BriefMessage,
  type DeltaMessage,
  type FeedStatus,
  type Finding,
  type FindingsMessage,
  type Board,
  type RecordsMessage,
  type HelloMessage,
  type Hazard,
  type HazardsMessage,
  type ReplayMessage,
  type RoomClientMessage,
  type NewsItem,
  type NewsMessage,
  type DetailsMessage,
  type PathMessage,
  type ScenarioInfo,
  type SnapshotMessage,
  type StalenessRules,
  type TrafficKind,
} from '@watchfloor/shared';
import type { TrackStore } from './trackStore';
import { clientAddress } from './clientAddress';
import type { RoomPeer } from './rooms/rooms';
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
/** Views arriving within this window are reported together. */
const VIEWS_COALESCE_MS = 100;
const MAX_CLIENTS = 200;
/** New connections one address may open in CONNECT_WINDOW_MS: each costs a whole snapshot to encode. */
const CONNECT_BURST = 6;
const CONNECT_WINDOW_MS = 10_000;
/** Messages a browser may send a second (it sends one view per pan; a console a few controls a second). */
const MESSAGES_PER_SECOND = 40;
/** Resyncs (a fresh snapshot after lagging) one client may need in a minute before it's let go. */
const RESYNCS_PER_MINUTE = 3;

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
  /** How the ops room reaches this browser. */
  peer: RoomPeer;
  /** Message budget: refilled MESSAGES_PER_SECOND a second, one spent per message; empty closes the socket. */
  messageCredits: number;
  lastMessageAt: number;
  /** When each resync was sent, for RESYNCS_PER_MINUTE. */
  resyncsAt: number[];
  /** When this browser last asked about a track; a request closer than the gap waits for it (the latest one wins). */
  lastTrackRequestAt: number;
  pendingTrackId: string | null;
  trackTimer: NodeJS.Timeout | null;
  /** When it last asked for the brief or a replay: both are built to order, so they're rationed harder. */
  lastBriefAt: number;
  lastReplayAt: number;
}

/** Everything sent to one browser in answer to one of its requests. */
type ServerReply = PathMessage | DetailsMessage | BriefMessage | ReplayMessage;

/** A browser selects tracks by hand: more than a few track requests a second is a bug or abuse. */
const TRACK_REQUEST_GAP_MS = 200;
const BRIEF_GAP_MS = 2_000;
/** A replay reply can run to megabytes, so asking is paced like a pan settling. */
const REPLAY_GAP_MS = 3_000;

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
  /** Current status of each feed that can fail; sent in hello and whenever it changes. */
  feedStatus?: () => FeedStatus[];
  /** The ops room (rooms/rooms.ts): browsers' room-* messages, and their going away. */
  rooms?: {
    handle(peer: RoomPeer, message: RoomClientMessage): void;
    drop(peer: RoomPeer): void;
  };
  /** Headers a trusted proxy sets to the visitor's address (CLIENT_IP_HEADER, clientAddress.ts); none: the socket's. */
  addressHeaders?: readonly string[];
  /** Connections one address may hold at once (MAX_CONNECTIONS_PER_ADDRESS); 0 or unset: no limit. */
  maxPerAddress?: number;
  /**
   * Origins allowed besides the page's own host (ALLOWED_ORIGINS). A browser
   * sends the page's origin with the upgrade; one that doesn't match the Host
   * is another site's page using a visitor's position on this network to
   * read the picture, steer the feeds and spend the room allowances.
   */
  allowedOrigins?: readonly string[];
  /** Answers a browser's question about one track (its path, its details); `send` may be called more than once. */
  onTrackRequest?: (id: string, send: (message: PathMessage | DetailsMessage) => void) => void;
  /** The day's news stories, sent to each browser after its snapshot. */
  news?: () => NewsItem[];
  /** Current earthquakes and disasters, sent after the news. */
  hazards?: () => Hazard[];
  /** The watchers' current findings, and the last day's ended rare sightings, sent after the hazards. */
  findings?: () => { items: Finding[]; recent: Finding[] };
  /** The leaderboard, sent after the findings. */
  records?: () => Board[];
  /** Answers a browser's request for the handover brief. */
  onBrief?: (send: (message: BriefMessage) => void) => void;
  /** Answers a browser's request for recent paths through an area. */
  onReplay?: (bbox: BBox, send: (message: ReplayMessage) => void) => void;
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
  private viewsTimer: NodeJS.Timeout | undefined;
  /** The feed statuses every connected browser already has, serialised. */
  private sentFeeds = '[]';
  /** Recent connections per address, for the connection-rate limit. */
  private readonly connectsAt = new Map<string, number[]>();
  /**
   * The snapshot encoded this tick, reused by every browser that connects or
   * resyncs within it. Encoding the world picture takes a few hundred ms and
   * deflating it more, so a burst of connections (a reload storm, a churning
   * client) used to pin the event loop. Reusing a snapshot up to a tick old is
   * safe: the next delta carries everything since the previous flush, and
   * applying messages is idempotent.
   */
  private snapshotCache: { at: number; payload: string } | null = null;
  private tickTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: HubOptions) {
    this.wss = new WebSocketServer({
      server: opts.server,
      path: opts.path,
      maxPayload: 4 * 1024, // browsers only send small view messages
      // Level 1, not zlib's default 6: compressing a 4.7 MB world snapshot is
      // about twice as fast for 12% more bytes (1.95 MB, not 1.7), and every
      // delta to every viewer is compressed separately. Measured, Oct 2026.
      perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 1 } },
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
    clearTimeout(this.viewsTimer);
    for (const client of this.clients) client.ws.close(1001, 'Server shutting down');
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const address = clientAddress(req.headers, req.socket.remoteAddress, this.opts.addressHeaders ?? []);
    if (!this.originAllowed(req.headers.origin, req.headers.host)) {
      log.warn('refused a cross-site connection', { address, origin: req.headers.origin });
      ws.close(1008, 'Origin not allowed');
      return;
    }
    if (this.clients.size >= MAX_CLIENTS) {
      ws.close(1013, 'Too many connections');
      return;
    }
    if (!this.connectAllowed(address)) {
      ws.close(1013, 'Too many connections from one address');
      return;
    }
    // One visitor can't take the server's share: every connection costs a whole snapshot.
    const perAddress = this.opts.maxPerAddress ?? 0;
    if (perAddress > 0) {
      let mine = 0;
      for (const c of this.clients) if (c.address === address) mine++;
      if (mine >= perAddress) {
        ws.close(1013, 'Too many connections from one address');
        return;
      }
    }

    const client: Client = {
      ws,
      alive: true,
      needsResync: false,
      backlog: 0,
      snapshotInFlight: false,
      view: null,
      address,
      peer: {
        address,
        send: (message) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(encodeServerMessage(message));
        },
      },
      messageCredits: MESSAGES_PER_SECOND,
      lastMessageAt: Date.now(),
      resyncsAt: [],
      lastTrackRequestAt: 0,
      pendingTrackId: null,
      trackTimer: null,
      lastBriefAt: 0,
      lastReplayAt: 0,
    };
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
      feeds: this.opts.feedStatus?.() ?? [],
    };
    client.ws.send(encodeServerMessage(hello));
    // Build the snapshot on the next turn of the event loop, so the hello goes
    // out first. Encoding a world snapshot takes a few hundred ms, and the
    // hello lets the page frame the map and send its view meanwhile.
    setImmediate(() => {
      if (!this.clients.has(client)) return;
      this.sendSnapshot(client);
      // After the snapshot: the tracks are what the page is for.
      const news = this.opts.news?.();
      if (news) this.send(client, { type: 'news', serverTime: Date.now(), items: news, replace: true });
      const hazards = this.opts.hazards?.();
      if (hazards) this.send(client, { type: 'hazards', serverTime: Date.now(), items: hazards });
      const findings = this.opts.findings?.();
      if (findings) this.send(client, { type: 'findings', serverTime: Date.now(), ...findings });
      const records = this.opts.records?.();
      if (records) this.send(client, { type: 'records', serverTime: Date.now(), boards: records });
    });
  }

  /** New stories to every browser, as they arrive (every 15 minutes or so). */
  broadcastNews(items: NewsItem[]): void {
    if (items.length === 0) return;
    const payload = encodeServerMessage({ type: 'news', serverTime: Date.now(), items, replace: false });
    for (const client of this.clients) if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }

  /** The whole hazard list to every browser, whenever it changes. */
  broadcastHazards(items: Hazard[]): void {
    const payload = encodeServerMessage({ type: 'hazards', serverTime: Date.now(), items });
    for (const client of this.clients) if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }

  /** The whole findings list to every browser, whenever a watcher's picture changes. */
  broadcastFindings(items: Finding[], recent: Finding[]): void {
    const payload = encodeServerMessage({ type: 'findings', serverTime: Date.now(), items, recent });
    for (const client of this.clients) if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }

  /** The whole leaderboard to every browser, whenever a record moves. */
  broadcastRecords(boards: Board[]): void {
    const payload = encodeServerMessage({ type: 'records', serverTime: Date.now(), boards });
    for (const client of this.clients) if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }

  private send(client: Client, message: NewsMessage | HazardsMessage | FindingsMessage | RecordsMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(encodeServerMessage(message));
  }

  private sendSnapshot(client: Client): void {
    const resync = client.needsResync;
    const now = Date.now();
    if (resync) {
      // A client that keeps falling behind costs a whole snapshot each time: let it go after a few.
      client.resyncsAt = client.resyncsAt.filter((t) => now - t < 60_000);
      client.resyncsAt.push(now);
      if (client.resyncsAt.length > RESYNCS_PER_MINUTE) {
        client.ws.close(1013, 'Too slow to keep up');
        return;
      }
    }
    if (!this.snapshotCache || now - this.snapshotCache.at >= this.opts.tickMs) {
      const snapshot: SnapshotMessage = {
        type: 'snapshot',
        serverTime: now,
        tracks: this.opts.store.snapshot(),
        trails: this.opts.store.trailSnapshot(),
      };
      this.snapshotCache = { at: now, payload: encodeServerMessage(snapshot) };
    }
    client.snapshotInFlight = true;
    client.needsResync = false;
    // The callback fires once ws has written the message, or on error.
    client.ws.send(this.snapshotCache.payload, () => (client.snapshotInFlight = false));
    // Feed statuses ride only on the tick where they change, which a lagging
    // client was skipped for: after a resync it gets the current ones, or its
    // status bar could show a feed as failing hours after it recovered.
    if (resync) {
      const feeds = this.opts.feedStatus?.() ?? [];
      client.ws.send(encodeServerMessage({ type: 'delta', serverTime: now, upserts: [], removals: [], feeds }));
    }
  }

  /** The page's own origin, no origin at all (curl, probes), or one from the allow list. */
  private originAllowed(origin: string | undefined, host: string | undefined): boolean {
    if (!origin) return true;
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    if (host !== undefined && originHost === host.toLowerCase()) return true;
    return (this.opts.allowedOrigins ?? []).some((o) => o.toLowerCase() === origin.toLowerCase());
  }

  /** At most CONNECT_BURST new connections per address in CONNECT_WINDOW_MS. */
  private connectAllowed(address: string): boolean {
    const now = Date.now();
    const recent = (this.connectsAt.get(address) ?? []).filter((t) => now - t < CONNECT_WINDOW_MS);
    if (recent.length >= CONNECT_BURST) return false;
    recent.push(now);
    this.connectsAt.set(address, recent);
    // The map is pruned here rather than on a timer: a quiet address drops out on anyone's next connection.
    for (const [a, times] of this.connectsAt) {
      if (a !== address && times.every((t) => now - t >= CONNECT_WINDOW_MS)) this.connectsAt.delete(a);
    }
    return true;
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
    const now = Date.now();
    this.opts.store.prune(now);
    const { upserts, removals } = this.opts.store.flush();

    // Always send, even when empty: it doubles as a heartbeat the browser can watch,
    // and carries serverTime for clock-offset estimation.
    const delta: DeltaMessage = { type: 'delta', serverTime: now, upserts, removals };
    // Feed status rides on the delta only when it changed, so the per-tick message stays small.
    const feeds = this.opts.feedStatus?.() ?? [];
    const feedsJson = JSON.stringify(feeds);
    if (feedsJson !== this.sentFeeds) {
      delta.feeds = feeds;
      this.sentFeeds = feedsJson;
    }
    const payload = encodeServerMessage(delta);

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
    if (client.trackTimer) clearTimeout(client.trackTimer);
    client.trackTimer = null;
    this.opts.rooms?.drop(client.peer);
    log.info(reason, { address: client.address, clients: this.clients.size });
    if (client.view) this.viewsChanged();
    this.opts.onClientsChanged?.(this.clients.size);
  }

  /** Browser messages are untrusted: anything that doesn't parse is ignored, and a flood closes the socket. */
  private onClientMessage(client: Client, raw: string): void {
    const now = Date.now();
    client.messageCredits = Math.min(MESSAGES_PER_SECOND, client.messageCredits + ((now - client.lastMessageAt) / 1000) * MESSAGES_PER_SECOND);
    client.lastMessageAt = now;
    if (client.messageCredits < 1) {
      log.warn('client flooding, closing', { address: client.address });
      client.ws.close(1008, 'Too many messages');
      return;
    }
    client.messageCredits -= 1;
    const message = parseClientMessage(raw);
    if (!message) {
      log.debug('ignored client message', { address: client.address });
      return;
    }
    if (isRoomRequest(message)) {
      this.opts.rooms?.handle(client.peer, message);
      return;
    }
    const reply = (message: ServerReply) => {
      if (client.ws.readyState === WebSocket.OPEN) client.ws.send(encodeServerMessage(message));
    };
    if (message.type === 'track') {
      const now = Date.now();
      const wait = TRACK_REQUEST_GAP_MS - (now - client.lastTrackRequestAt);
      if (wait > 0) {
        // Inside the gap: keep the latest id and answer it when the gap ends.
        // The browser sends one request per selection and never retries, so
        // dropping it lost the path and details of the second of two quick
        // selections (arrowing down the list). Still one answer per gap.
        client.pendingTrackId = message.id;
        client.trackTimer ??= setTimeout(() => {
          client.trackTimer = null;
          const id = client.pendingTrackId;
          client.pendingTrackId = null;
          if (id === null || client.ws.readyState !== WebSocket.OPEN) return;
          client.lastTrackRequestAt = Date.now();
          this.opts.onTrackRequest?.(id, reply);
        }, wait);
        return;
      }
      client.lastTrackRequestAt = now;
      this.opts.onTrackRequest?.(message.id, reply);
      return;
    }
    if (message.type === 'brief') {
      const now = Date.now();
      if (now - client.lastBriefAt < BRIEF_GAP_MS) return;
      client.lastBriefAt = now;
      this.opts.onBrief?.(reply);
      return;
    }
    if (message.type === 'replay') {
      const now = Date.now();
      if (now - client.lastReplayAt < REPLAY_GAP_MS) return;
      client.lastReplayAt = now;
      this.opts.onReplay?.(message.bbox, reply);
      return;
    }
    client.view = message.bbox;
    this.viewsChanged();
  }

  /**
   * Report views shortly after they change rather than on the next tick: a
   * new view decides what gets fetched, so waiting up to a second for the tick
   * was pure added latency. The short window still coalesces a burst, so a
   * chatty browser costs one report per VIEWS_COALESCE_MS at most.
   */
  private viewsChanged(): void {
    this.viewsDirty = true;
    this.viewsTimer ??= setTimeout(() => {
      this.viewsTimer = undefined;
      this.reportViews();
    }, VIEWS_COALESCE_MS);
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
