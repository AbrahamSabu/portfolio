import type { Hazard } from '@watchfloor/shared';
import { Backoff } from '../feeds/backoff';
import { createLogger } from '../log';
import { GDACS_URL, mergeHazards, parseGdacs, parseUsgs, USGS_URL } from './sources';

const log = createLogger('hazards');

const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';
/** USGS updates its feed each minute; every two keeps a quake on the map within about three of it being located. */
const USGS_MS = 2 * 60_000;
/** GDACS's list moves slowly (cyclones every 6 h, floods daily): every ten minutes is plenty. */
const GDACS_MS = 10 * 60_000;

export interface HazardServiceOptions {
  fetch?: typeof fetch;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  random?: () => number;
  /** The whole list, whenever it changes: the hub sends it to every browser. */
  onChange?: (items: Hazard[]) => void;
  /** Sent with every request; null sends none (the static demo runs this in a browser, which may not set it). */
  userAgent?: string | null;
}

interface Source {
  name: 'usgs' | 'gdacs';
  url: string;
  everyMs: number;
  parse: (body: unknown) => Hazard[];
  items: Hazard[];
  backoff: Backoff;
  timer?: unknown;
  lastError?: string;
  lastOk?: number;
}

/**
 * Earthquakes from the USGS and disasters from GDACS, each polled on its
 * own clock, merged into one list. Runs whether or not anyone watches, like
 * the news: the files are small and the page should open with them on.
 */
export class HazardService {
  private readonly fetchFn: typeof fetch;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly sources: Source[];
  private merged: Hazard[] = [];
  private signature = '';
  private stopped = false;

  constructor(private readonly opts: HazardServiceOptions = {}) {
    // Wrapped: a browser's fetch called as another object's method throws "Illegal invocation".
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
    const backoff = () => new Backoff(30_000, 30 * 60_000, opts.random);
    this.sources = [
      { name: 'usgs', url: USGS_URL, everyMs: USGS_MS, parse: parseUsgs, items: [], backoff: backoff() },
      { name: 'gdacs', url: GDACS_URL, everyMs: GDACS_MS, parse: parseGdacs, items: [], backoff: backoff() },
    ];
  }

  /** Polls each source now, then on its own clock. Starting again (the demo, when its tab comes back) restarts the clocks. */
  start(): void {
    this.stopped = false;
    for (const source of this.sources) {
      if (source.timer !== undefined) this.clearTimer(source.timer);
      this.schedule(source, 0);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const source of this.sources) if (source.timer !== undefined) this.clearTimer(source.timer);
  }

  items(): Hazard[] {
    return this.merged;
  }

  health(): Record<string, unknown> {
    return Object.fromEntries(
      this.sources.map((s) => [s.name, { items: s.items.length, lastOk: s.lastOk ?? null, lastError: s.lastError ?? null }]),
    );
  }

  private schedule(source: Source, ms: number): void {
    if (this.stopped) return;
    source.timer = this.setTimer(() => void this.poll(source), ms);
  }

  /** One request to one source. Never throws; a failure keeps its last list. */
  async poll(source: Source = this.sources[0]!): Promise<void> {
    let delay = source.everyMs;
    try {
      const headers: Record<string, string> = this.opts.userAgent === null ? {} : { 'User-Agent': this.opts.userAgent ?? USER_AGENT };
      const res = await this.fetchFn(source.url, { headers, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // GDACS starts its JSON with a byte-order mark, which JSON.parse refuses.
      source.items = source.parse(JSON.parse((await res.text()).replace(/^﻿/, '')));
      source.lastOk = Date.now();
      source.lastError = undefined;
      source.backoff.reset();
      this.publish();
    } catch (err) {
      source.lastError = err instanceof Error ? err.message : String(err);
      delay = Math.max(source.everyMs, source.backoff.next());
      log.warn(`could not read ${source.name}`, { error: source.lastError, retryInS: Math.round(delay / 1000) });
    }
    this.schedule(source, delay);
  }

  private publish(): void {
    const [usgs, gdacs] = this.sources;
    const merged = mergeHazards(usgs!.items, gdacs!.items);
    const signature = JSON.stringify(merged);
    if (signature === this.signature) return;
    this.signature = signature;
    this.merged = merged;
    this.opts.onChange?.(merged);
  }

  /** For tests: the sources by name. */
  source(name: 'usgs' | 'gdacs'): Source {
    return this.sources.find((s) => s.name === name)!;
  }
}
