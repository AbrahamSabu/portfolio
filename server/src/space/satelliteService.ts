import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  encodeSatelliteCatalog,
  encodeSatelliteGroup,
  parseSatelliteGroup,
  SATELLITE_FORMAT,
  SATELLITE_GROUPS,
  type SatelliteElements,
  type SatelliteGroup,
  type SatelliteGroupStatus,
} from '@watchfloor/shared';
import { createLogger } from '../log';
import { CELESTRAK_URL, celestrakUrl, parseCelestrak } from './celestrak';

const log = createLogger('satellites');
const gzip = promisify(zlib.gzip);

const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';
/**
 * CelesTrak's rules (gp-data-formats page, Nov 2026): the data changes once
 * every two hours at most, and since March 2026 a group may be downloaded
 * once per update; asking again gets a 403 until it changes. So no copy is
 * ever refreshed sooner than this.
 */
export const MIN_REFRESH_MS = 2 * 3_600_000;
/**
 * "If you receive an HTTP 403 or 404 error, the response is not going to
 * change by repeating the request", and 50 errors in two hours put the
 * address on CelesTrak's firewall. After this many refusals in a row a group
 * stops asking until the server restarts, and the log says why.
 */
export const MAX_REFUSALS = 3;
/** No answer at all (offline, DNS, timeout) never reached CelesTrak's counters: try again sooner, backing off. */
const NETWORK_RETRY_MS = 15 * 60_000;
/**
 * A 5xx is CelesTrak's server struggling, not a refusal (seen Nov 2026: 503s
 * and a Starlink request that never finished). Leave it alone a while,
 * backing off, without counting towards giving up.
 */
const SERVER_ERROR_RETRY_MS = 30 * 60_000;
/** Starlink's ten thousand records arrive slowly when CelesTrak is busy. */
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;
/** Groups due at startup go one after another, smallest first, so the space stations arrive in seconds. */
const STARTUP_GAP_MS = 5_000;

export interface SatelliteServiceOptions {
  groups: readonly SatelliteGroup[];
  /** How long a downloaded copy is used before asking for a new one; at least MIN_REFRESH_MS. */
  refreshMs: number;
  /** Where each group is kept between restarts (`<group>.json`); null keeps nothing. */
  cacheDir: string | null;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

interface GroupState {
  group: SatelliteGroup;
  satellites: SatelliteElements[];
  fetchedAt: number | null;
  lastError: string | null;
  refusals: number;
  serverErrors: number;
  networkFailures: number;
  /** When to ask CelesTrak next; null once it has refused too often. */
  nextAttemptAt: number | null;
}

/** The API response, built once per change: plain and gzipped, with an ETag for cheap re-checks. */
export interface SatelliteResponse {
  json: Buffer;
  gzip: Buffer | null;
  etag: string;
}

/**
 * Orbital elements from CelesTrak, downloaded rarely and kept on disk, served
 * to browsers at `/api/satellites`. Browsers never ask CelesTrak themselves:
 * one server download per group every few hours, however many people watch.
 * Runs whether or not anyone is connected, like the news: it's a handful of
 * requests a day, and the page should open with the satellites already there.
 */
export class SatelliteService {
  private readonly states: GroupState[];
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly refreshMs: number;
  private readonly baseUrl: string;
  private timer: unknown;
  private stopped = true;
  private busy = false;
  private version = 0;
  private readonly startedAt: number;
  private latest: SatelliteResponse | null = null;
  private work: Promise<void> = Promise.resolve();
  private rebuilding: Promise<void> = Promise.resolve();
  private readonly subsets = new Map<string, { version: number; response: SatelliteResponse }>();

  constructor(private readonly opts: SatelliteServiceOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as NodeJS.Timeout));
    this.refreshMs = Math.max(MIN_REFRESH_MS, opts.refreshMs);
    this.baseUrl = opts.baseUrl ?? CELESTRAK_URL;
    this.startedAt = this.now();
    this.states = opts.groups.map((group) => ({
      group,
      satellites: [],
      fetchedAt: null,
      lastError: null,
      refusals: 0,
      serverErrors: 0,
      networkFailures: 0,
      nextAttemptAt: null,
    }));
  }

  /** Loads the saved copies, serves them at once, and schedules downloads for the missing or old ones. */
  async start(): Promise<void> {
    this.stopped = false;
    const now = this.now();
    let due = 0;
    for (const state of this.states) {
      const saved = this.opts.cacheDir ? loadGroup(this.opts.cacheDir, state.group) : null;
      if (saved && saved.fetchedAt !== null) {
        state.satellites = saved.satellites;
        state.fetchedAt = saved.fetchedAt;
      }
      // A copy younger than the refresh interval is used as it is: restarts never re-download.
      const fresh = state.fetchedAt !== null ? state.fetchedAt + this.refreshMs : 0;
      state.nextAttemptAt = fresh > now ? fresh : now + STARTUP_GAP_MS * due++;
    }
    await this.rebuild();
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  /** The current response, or null before the first is built. */
  response(): SatelliteResponse | null {
    return this.latest;
  }

  /**
   * Just some groups: the phone spotter wants the space stations (a few
   * kilobytes), not all of Starlink. Built on demand, kept until the next change.
   */
  responseFor(groups: readonly SatelliteGroup[]): SatelliteResponse | null {
    if (!this.latest) return null;
    const key = SATELLITE_GROUPS.filter((g) => groups.includes(g)).join(',');
    const cached = this.subsets.get(key);
    if (cached && cached.version === this.version) return cached.response;
    const catalog = {
      groups: this.states
        .filter((s) => groups.includes(s.group))
        .map((s) => ({ group: s.group, status: this.statusOf(s), fetchedAt: s.fetchedAt, satellites: s.satellites })),
    };
    const response = {
      json: Buffer.from(JSON.stringify(encodeSatelliteCatalog(catalog))),
      gzip: null,
      etag: `W/"sat-${this.startedAt.toString(36)}-${this.version}-${key}"`,
    };
    this.subsets.set(key, { version: this.version, response });
    return response;
  }

  health(): Record<string, unknown> {
    return Object.fromEntries(
      this.states.map((s) => [
        s.group,
        {
          satellites: s.satellites.length,
          status: this.statusOf(s),
          fetchedAt: s.fetchedAt === null ? null : new Date(s.fetchedAt).toISOString(),
          nextAttemptAt: s.nextAttemptAt === null ? 'stopped' : new Date(s.nextAttemptAt).toISOString(),
          lastError: s.lastError,
        },
      ]),
    );
  }

  private statusOf(s: GroupState): SatelliteGroupStatus {
    if (s.lastError !== null) return 'failing';
    return s.fetchedAt === null ? 'pending' : 'ok';
  }

  /** One timer for all groups, set for whichever is due first. Downloads never overlap. */
  private schedule(): void {
    if (this.stopped || this.busy) return;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    const next = this.dueNext();
    if (!next) return;
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      this.work = this.download(next).then(() => this.schedule());
    }, Math.max(0, (next.nextAttemptAt ?? 0) - this.now()));
  }

  private dueNext(): GroupState | undefined {
    let best: GroupState | undefined;
    for (const s of this.states) {
      if (s.nextAttemptAt !== null && (!best || s.nextAttemptAt < best.nextAttemptAt!)) best = s;
    }
    return best;
  }

  /** A little randomness, as CelesTrak asks, so servers don't all ask at once. */
  private jitter(ms: number): number {
    return ms * (1 + 0.1 * this.random());
  }

  /** One request for one group. Never throws: a failure keeps the copy already held. */
  async download(state: GroupState): Promise<void> {
    this.busy = true;
    const url = celestrakUrl(this.baseUrl, state.group);
    try {
      let res: Response;
      let text: string;
      try {
        res = await this.fetchFn(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          // A redirect is an error in CelesTrak's books: see it, don't follow it.
          redirect: 'manual',
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        text = await res.text();
      } catch (err) {
        // No answer: nothing reached CelesTrak's error counters, so a sooner retry is fair.
        state.networkFailures++;
        const wait = Math.min(this.refreshMs, NETWORK_RETRY_MS * 2 ** (state.networkFailures - 1));
        this.fail(state, err instanceof Error ? err.message : String(err), this.jitter(wait));
        return;
      }
      state.networkFailures = 0;
      const parsed = res.status === 200 ? parseCelestrak(safeJson(text), this.now()) : null;
      if (!parsed || parsed.satellites.length === 0) {
        // CelesTrak's 403 explains itself ("...Data is updated once every 2 hours"): keep its words.
        const detail = res.status === 200 ? 'no usable satellites in the answer' : `HTTP ${res.status}: ${text.slice(0, 200).trim()}`;
        if (res.status >= 500) {
          state.serverErrors++;
          const wait = Math.min(this.refreshMs, SERVER_ERROR_RETRY_MS * 2 ** (state.serverErrors - 1));
          this.fail(state, `HTTP ${res.status} (CelesTrak busy)`, this.jitter(wait));
          return;
        }
        state.refusals++;
        if (state.refusals >= MAX_REFUSALS) {
          state.lastError = detail;
          state.nextAttemptAt = null;
          log.error(`CelesTrak refused ${state.group} ${state.refusals} times in a row; not asking again until restart`, { detail });
          await this.rebuild();
          return;
        }
        this.fail(state, detail, this.jitter(Math.max(MIN_REFRESH_MS, this.refreshMs)));
        return;
      }
      state.refusals = 0;
      state.serverErrors = 0;
      state.satellites = parsed.satellites;
      state.fetchedAt = this.now();
      state.lastError = null;
      state.nextAttemptAt = this.now() + this.jitter(this.refreshMs);
      log.info(`downloaded ${state.group}`, { satellites: parsed.satellites.length, skipped: parsed.skipped });
      if (this.opts.cacheDir) {
        await saveGroup(this.opts.cacheDir, state).catch((err: unknown) =>
          log.warn(`could not save ${state.group}`, { error: err instanceof Error ? err.message : String(err) }),
        );
      }
      await this.rebuild();
    } finally {
      this.busy = false;
    }
  }

  private fail(state: GroupState, detail: string, waitMs: number): void {
    state.lastError = detail;
    state.nextAttemptAt = this.now() + waitMs;
    log.warn(`could not download ${state.group}`, { error: detail, retryInMin: Math.round(waitMs / 60_000) });
    this.rebuilding = this.rebuild();
  }

  /** For tests: resolves once the download under way (if any) and the response it changed are done. */
  async settled(): Promise<void> {
    await this.work;
    await this.rebuilding;
  }

  /** Serialises and compresses the response once per change, off the request path. */
  private async rebuild(): Promise<void> {
    const catalog = {
      groups: this.states.map((s) => ({ group: s.group, status: this.statusOf(s), fetchedAt: s.fetchedAt, satellites: s.satellites })),
    };
    const json = Buffer.from(JSON.stringify(encodeSatelliteCatalog(catalog)));
    const version = ++this.version;
    // Compressed on the thread pool: a whole Starlink catalogue is over a megabyte.
    const zipped = await gzip(json, { level: 6 }).catch(() => null);
    if (version !== this.version) return; // a newer build won the race
    this.latest = { json, gzip: zipped, etag: `W/"sat-${this.startedAt.toString(36)}-${version}"` };
  }

  /** For tests: a group's state by name. */
  state(group: SatelliteGroup): GroupState {
    return this.states.find((s) => s.group === group)!;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cacheFile(dir: string, group: SatelliteGroup): string {
  return path.join(dir, `${group}.json`);
}

export function loadGroup(dir: string, group: SatelliteGroup): ReturnType<typeof parseSatelliteGroup> {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(dir, group), 'utf8')) as { v?: unknown };
    if (raw.v !== SATELLITE_FORMAT) return null;
    const parsed = parseSatelliteGroup(raw);
    return parsed && parsed.group === group ? parsed : null;
  } catch {
    return null;
  }
}

async function saveGroup(dir: string, state: GroupState): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
  const file = cacheFile(dir, state.group);
  const tmp = `${file}.tmp`;
  const body = encodeSatelliteGroup({ group: state.group, status: 'ok', fetchedAt: state.fetchedAt, satellites: state.satellites });
  await fs.promises.writeFile(tmp, JSON.stringify({ v: SATELLITE_FORMAT, ...body }));
  await fs.promises.rename(tmp, file);
}
