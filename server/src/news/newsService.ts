import fs from 'node:fs';
import path from 'node:path';
import { parseNewsItem, type NewsItem } from '@watchfloor/shared';
import { Backoff } from '../feeds/backoff';
import { createLogger } from '../log';
import {
  BATCH_MS,
  LAST_UPDATE_URL,
  batchUrls,
  parseArticles,
  parseEvents,
  parseLastUpdate,
  selectStories,
  stampTime,
  stampsBefore,
} from './gdelt';
import { firstZipEntry } from './zip';

const log = createLogger('news');

const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';

/** lastupdate.txt is 320 bytes; checking every 3 minutes finds a batch within 3 of it appearing. */
const CHECK_MS = 3 * 60_000;
/** Between any two requests: GDELT asks its API users for one every 5 s, and the files deserve the same. */
const REQUEST_GAP_MS = 5_000;
/** Stories older than a day leave the map. */
export const KEEP_MS = 24 * 3_600_000;
/** A day is about 96 batches of 30-60 stories; keep the most political of each. */
const MAX_PER_BATCH = 40;
const MAX_ITEMS = 2_000;

export interface SavedNews {
  /** Batches already read (or missing at GDELT), so a restart doesn't fetch them again. */
  stamps: string[];
  items: NewsItem[];
}

export interface NewsServiceOptions {
  fetch?: typeof fetch;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  random?: () => number;
  /** Earlier batches to read at startup, so the map opens with news on it: 8 is the last two hours. */
  backfill?: number;
  saved?: SavedNews | null;
  /** New stories, newest batch first: the hub sends them to every browser. */
  onStories?: (items: NewsItem[]) => void;
}

/**
 * Political news from GDELT, kept for a day. Checks for a new 15-minute batch
 * every few minutes, reads it (two files, ~5 MB zipped) and keeps the
 * political stories. Runs whether or not anyone watches, like AIS: a batch
 * missed is news missing from the map, and it costs GDELT very little.
 */
export class NewsService {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly backoff: Backoff;
  private readonly done = new Set<string>();
  private stories: NewsItem[] = [];
  private timer: unknown;
  private stopped = false;
  private lastRequestAt = 0;
  private lastError: string | undefined;
  private newest: string | undefined;

  constructor(private readonly opts: NewsServiceOptions = {}) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as NodeJS.Timeout));
    this.backoff = new Backoff(30_000, 30 * 60_000, opts.random);
    if (opts.saved) {
      for (const s of opts.saved.stamps) this.done.add(s);
      this.add(opts.saved.items);
    }
  }

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  /** The day's stories, newest first. */
  items(): NewsItem[] {
    this.prune();
    return this.stories;
  }

  toSaved(): SavedNews {
    const oldest = timeOf(this.now() - KEEP_MS);
    return { stamps: [...this.done].filter((s) => s >= oldest).sort(), items: this.items() };
  }

  health(): Record<string, unknown> {
    return { stories: this.stories.length, newestBatch: this.newest ?? null, lastError: this.lastError ?? null };
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = this.setTimer(() => void this.check(), ms);
  }

  /** One round: find the newest batch, then read it and any earlier ones not yet read. Never throws. */
  async check(): Promise<void> {
    let delay = CHECK_MS;
    try {
      const update = await this.get(LAST_UPDATE_URL);
      const stamp = update && parseLastUpdate(update.toString('utf8'));
      if (!stamp) throw new Error('no batch in lastupdate.txt');
      this.newest = stamp;
      const oldest = timeOf(this.now() - KEEP_MS);
      const wanted = [stamp, ...stampsBefore(stamp, this.opts.backfill ?? 8)].filter((s) => s >= oldest && !this.done.has(s));
      for (const s of wanted) {
        if (this.stopped) return;
        await this.read(s);
      }
      this.backoff.reset();
      this.lastError = undefined;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      delay = Math.max(CHECK_MS, this.backoff.next());
      log.warn('could not read GDELT', { error: this.lastError, retryInS: Math.round(delay / 1000) });
    }
    this.schedule(delay);
  }

  private async read(stamp: string): Promise<void> {
    const urls = batchUrls(stamp);
    const events = await this.get(urls.events, true);
    const articles = events && (await this.get(urls.articles, true));
    this.done.add(stamp);
    if (!events || !articles) {
      log.info('GDELT batch missing', { stamp });
      return;
    }
    const stories = selectStories(
      parseEvents((await firstZipEntry(events)).toString('utf8')),
      parseArticles((await firstZipEntry(articles)).toString('utf8')),
      stampTime(stamp),
    )
      .slice(0, MAX_PER_BATCH)
      .map(({ score: _, ...item }) => item);
    const added = this.add(stories);
    log.info('read GDELT batch', { stamp, stories: added.length });
    if (added.length > 0) this.opts.onStories?.(added);
  }

  /** Stories not already known (by id, URL or headline), merged newest first. */
  private add(items: readonly NewsItem[]): NewsItem[] {
    const ids = new Set(this.stories.map((s) => s.id));
    const urls = new Set(this.stories.map((s) => s.url));
    const headlines = new Set(this.stories.map((s) => s.headline));
    const fresh = items.filter((s) => {
      if (ids.has(s.id) || urls.has(s.url) || headlines.has(s.headline)) return false;
      ids.add(s.id);
      urls.add(s.url);
      headlines.add(s.headline);
      return true;
    });
    // Stable sort: within a batch the most political stay first.
    this.stories = [...this.stories, ...fresh].sort((a, b) => b.publishedAt - a.publishedAt);
    this.prune();
    return fresh;
  }

  private prune(): void {
    const cutoff = this.now() - KEEP_MS;
    if (this.stories.length > MAX_ITEMS || this.stories.some((s) => s.publishedAt < cutoff)) {
      this.stories = this.stories.filter((s) => s.publishedAt >= cutoff).slice(0, MAX_ITEMS);
    }
  }

  /** A file, at least REQUEST_GAP_MS after the last request; null for a 404 when `missingOk`. */
  private async get(url: string, missingOk = false): Promise<Buffer | null> {
    const wait = this.lastRequestAt + REQUEST_GAP_MS - this.now();
    if (wait > 0) await new Promise<void>((resolve) => this.setTimer(resolve, wait));
    this.lastRequestAt = this.now();
    const res = await this.fetchFn(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
    if (missingOk && res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(url.lastIndexOf('/') + 1)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** A batch stamp for a time, for comparing with stamps as strings. */
function timeOf(ms: number): string {
  return new Date(Math.floor(ms / BATCH_MS) * BATCH_MS).toISOString().replace(/\D/g, '').slice(0, 14);
}

/** The saved news, checked item by item; null when there's none or it's unreadable. */
export function loadNews(file: string): SavedNews | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: unknown; stamps?: unknown; items?: unknown };
    if (raw.version !== 1 || !Array.isArray(raw.stamps) || !Array.isArray(raw.items)) return null;
    return {
      stamps: raw.stamps.filter((s): s is string => typeof s === 'string' && /^\d{14}$/.test(s)),
      items: raw.items.map(parseNewsItem).filter((i): i is NewsItem => i !== null),
    };
  } catch {
    return null;
  }
}

/** Written atomically, like the picture: about 300 KB for a day. */
export async function saveNews(file: string, news: SavedNews): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify({ version: 1, ...news }));
  await fs.promises.rename(tmp, file);
}
