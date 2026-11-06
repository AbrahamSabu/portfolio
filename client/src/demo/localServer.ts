import {
  DEFAULT_STALENESS,
  PROTOCOL_VERSION,
  encodeServerMessage,
  parseServerMessage,
  type ClientMessage,
  type NewsItem,
  type ScenarioInfo,
  type ServerMessage,
} from '@watchfloor/shared';
// The server's own pieces, unchanged: the demo runs the real simulator,
// store, watchers and event log, just inside the page instead of on Node.
import { BriefService } from '../../../server/src/brief/briefService';
import { Simulator } from '../../../server/src/feeds/sim/simulator';
import { FindingsService } from '../../../server/src/findings/findingsService';
import { RecordsService } from '../../../server/src/records/records';
import { replayFor } from '../../../server/src/replay/replay';
import { getScenario } from '../../../server/src/scenarios';
import { TrackStore } from '../../../server/src/trackStore';
import type { ConnectionHandlers, Link } from '../net/connection';

const TICK_MS = 1000;
/** Fixed, so every visitor sees the same opening picture. */
const SEED = 7;
/**
 * A real server has hours of history; a page that just opened has none, so
 * the timeline would replay an empty sea. On first start the simulator runs
 * this far through the past at full speed (each step stamps its reports with
 * simulated time), so paths, trails and findings exist from the first frame.
 */
const HISTORY_MS = 30 * 60_000;
/**
 * Strides through the past. A world is thousands of tracks, so the past runs
 * in 15-second steps, not the live second: an airliner covers under 4 km in
 * one, inside its turning circle, and a ship 150 m. Paths and trails look the
 * same for a fifteenth of the work.
 */
const HISTORY_STEP_MS = 15_000;
/**
 * Reports filed while running the past: one a minute per track (a path keeps
 * a point every few minutes on a straight leg anyway), and every one for the
 * last few minutes, which the trails show.
 */
const HISTORY_REPORT_GAP_MS = 60_000;
const HISTORY_FULL_RATE_MS = 6 * 60_000;
/**
 * Work per slice before yielding to the page. Sliced by time, not by
 * simulated span: every yield waits behind a frame, and on a slow GPU a
 * frame can take hundreds of milliseconds, so few, short-enough slices
 * finish far sooner than many tiny ones.
 */
const HISTORY_SLICE_BUDGET_MS = 50;
/** Where a frame is slow (a weak GPU), slices grow to match it, up to this: at least half the time goes on the past. */
const HISTORY_SLICE_MAX_MS = 400;
const LIVE_STEP_MS = 250;
/**
 * Real news, not simulated: GDELT's political stories, read by the server's
 * own news code when the demo is published (`npm run demo-news`) and served
 * beside the page. A browser can't read GDELT itself (it sends no CORS
 * headers), and inventing headlines is out of the question. Read again now
 * and then, in case the page has been open across a refresh of the file.
 */
const NEWS_URL = './news.json';
const NEWS_CHECK_MS = 10 * 60_000;

/**
 * The whole server, in the page: what the static demo build (`npm run
 * build:demo`) uses instead of a WebSocket, so it can be hosted anywhere
 * files are served, with no API keys and nothing to spend. It speaks the
 * same protocol as the Hub — hello, snapshot, a delta every tick, findings,
 * and answers to track, brief and replay requests — and every message goes
 * through the real wire encoding and parser, so the client can't tell the
 * difference except that the traffic is labelled simulated, which it is.
 */
export class LocalServer implements Link {
  private readonly store = new TrackStore(DEFAULT_STALENESS);
  private readonly sim: Simulator;
  private readonly findings: FindingsService;
  private readonly brief: BriefService;
  private readonly records: RecordsService;
  /** Whether the page has had the leaderboard yet: changes go out only after it has. */
  private recordsSent = false;
  private readonly scenario: ScenarioInfo;
  private tickTimer: number | undefined;
  private stepTimer: number | undefined;
  private newsTimer: number | undefined;
  /** Stories already sent, so a re-read sends only what's new. Null until the first read. */
  private newsSeen: Set<string> | null = null;
  private running = false;
  /** The past being run (or run): started once, awaited by every start. */
  private history: Promise<void> | null = null;
  /** Simulated time while the past is being run; null once it's live. */
  private simNow: number | null = null;

  constructor(
    private readonly handlers: ConnectionHandlers,
    /** The world, unless a test wants something smaller and quicker. */
    opts: { scenario?: string } = {},
  ) {
    const scenario = getScenario(opts.scenario ?? 'world');
    this.scenario = { id: scenario.id, name: scenario.name, center: scenario.center, zoom: scenario.zoom };
    this.sim = new Simulator({ scenario, seed: SEED });
    this.brief = new BriefService({ tracks: () => this.store.snapshot() });
    this.findings = new FindingsService({
      world: { tracks: () => this.store.snapshot(), path: (id) => this.store.paths.flat(id) },
      // While the past runs, the watchers keep the simulator's time, so a rare
      // aircraft that landed twenty minutes ago is listed as seen then.
      now: () => this.simNow ?? Date.now(),
      // Nothing goes to the page before its hello: the past's findings go with the snapshot.
      onChange: (items, recent) => {
        if (this.simNow === null) this.emit({ type: 'findings', serverTime: Date.now(), items, recent });
      },
      onEvent: (kind, finding, time, resolved) => this.brief.onFinding(kind, finding, time, resolved),
    });
    // The leaderboard, from the same picture; the demo has no registers, so airlines show as their codes.
    this.records = new RecordsService({
      tracks: () => this.store.snapshot(),
      onChange: (boards) => {
        if (this.recordsSent) this.emit({ type: 'records', serverTime: Date.now(), boards });
      },
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // "Connecting" while the past runs: the map and basemap are already up.
    this.handlers.onState({ status: 'connecting' });
    void (this.history ??= this.runHistory()).then(() => {
      if (!this.running) return;
      // Resuming after the tab was hidden carries on from where it stood: the
      // motion model clamps the gap to a second, so nothing teleports.
      this.stepTimer = window.setInterval(() => this.sim.step(Date.now()), LIVE_STEP_MS);
      this.findings.start();
      this.brief.start();
      this.handlers.onState({ status: 'open' });
      const now = Date.now();
      this.emit({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        serverTime: now,
        tickMs: TICK_MS,
        staleness: DEFAULT_STALENESS,
        scenario: this.scenario,
        traffic: 'simulated',
        feeds: [],
      });
      this.emit({ type: 'snapshot', serverTime: now, tracks: this.store.snapshot(), trails: this.store.trailSnapshot() });
      this.store.flush(); // the snapshot carried it all
      this.emit({ type: 'findings', serverTime: now, items: this.findings.items(), recent: this.findings.recent() });
      this.records.update();
      this.emit({ type: 'records', serverTime: now, boards: this.records.boards() });
      this.recordsSent = true;
      this.records.start();
      this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
      this.newsSeen = null; // a fresh hello: send all of them again
      void this.readNews();
      this.newsTimer = window.setInterval(() => void this.readNews(), NEWS_CHECK_MS);
    });
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.tickTimer);
    window.clearInterval(this.stepTimer);
    window.clearInterval(this.newsTimer);
    this.findings.stop();
    this.records.stop();
    this.recordsSent = false;
    this.brief.stop();
  }

  /** Nothing to reconnect to. */
  retryNow(): void {}

  send(message: ClientMessage): void {
    if (!this.running) return;
    const now = Date.now();
    switch (message.type) {
      case 'view':
        return; // the simulator covers its own area whatever is on screen
      case 'track':
        this.emit({ type: 'path', serverTime: now, id: message.id, points: this.store.paths.get(message.id), backfill: 'none' });
        // The server's details come from aircraft and airline databases on
        // disk; a simulated track has no real registry or owner to look up.
        if (this.store.get(message.id)) this.emit({ type: 'details', serverTime: now, id: message.id, details: {} });
        return;
      case 'brief':
        this.emit(this.brief.message());
        return;
      case 'replay':
        this.emit(replayFor(this.store.snapshot(), (id) => this.store.paths.get(id), message.bbox, now));
        return;
    }
  }

  /**
   * Run the simulator through the last HISTORY_MS at full speed, into the
   * store. In slices, yielding between them, so the page stays responsive:
   * the whole run is a second or two of work on a phone.
   */
  private async runHistory(): Promise<void> {
    const started = performance.now();
    let t = Date.now() - HISTORY_MS;
    this.simNow = t;
    // Reports are judged against the time they were made, not the wall clock,
    // or the store would turn the whole past away as too old.
    const sink = {
      upsert: (report: unknown) => this.store.ingest(report, this.simNow ?? Date.now()),
      remove: (id: string) => this.store.remove(id),
    };
    this.sim.attach(sink, t);
    let lastPrune = t;
    let budget = HISTORY_SLICE_BUDGET_MS;
    // The wall clock moves while we yield, so "now" is re-read each slice, and
    // the run stops within a step of it rather than exactly on it (a target
    // that moves on every yield is never met). The live stepper takes the rest.
    while (Date.now() - t > HISTORY_STEP_MS) {
      const sliceStart = performance.now();
      const end = Date.now();
      while (t < end && performance.now() - sliceStart < budget) {
        t = Math.min(end, t + HISTORY_STEP_MS);
        this.simNow = t;
        this.sim.step(t, HISTORY_STEP_MS, end - t > HISTORY_FULL_RATE_MS ? HISTORY_REPORT_GAP_MS : 0);
        if (t - lastPrune >= 60_000) {
          this.store.prune(t);
          this.findings.sweep();
          lastPrune = t;
        }
      }
      const yielded = performance.now();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      budget = Math.min(HISTORY_SLICE_MAX_MS, Math.max(HISTORY_SLICE_BUDGET_MS, performance.now() - yielded));
    }
    this.simNow = null;
    this.store.prune(Date.now());
    this.store.flush(); // the snapshot carries it all
    performance.measure('wf:demo-history', { start: started });
  }

  /** The published stories: all of them the first time, then only new ones. Quietly nothing if there's no file. */
  private async readNews(): Promise<void> {
    let items: NewsItem[];
    try {
      const res = await fetch(NEWS_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const file = (await res.json()) as { items?: NewsItem[] };
      items = Array.isArray(file.items) ? file.items : [];
    } catch {
      return;
    }
    if (!this.running) return;
    const first = this.newsSeen === null;
    const seen = (this.newsSeen ??= new Set());
    const fresh = items.filter((s) => !seen.has(s.id));
    for (const s of fresh) seen.add(s.id);
    if (first || fresh.length) this.emit({ type: 'news', serverTime: Date.now(), items: fresh, replace: first });
  }

  private tick(): void {
    const now = Date.now();
    this.store.prune(now);
    const { upserts, removals } = this.store.flush();
    this.emit({ type: 'delta', serverTime: now, upserts, removals });
  }

  /** Through the real encoder and parser, exactly as the socket path does. */
  private emit(message: ServerMessage): void {
    const parsed = parseServerMessage(encodeServerMessage(message));
    if (parsed) this.handlers.onMessage(parsed, Date.now());
  }
}
