import {
  encodeSatelliteGroup,
  MAX_ELEMENT_AGE_MS,
  parseSatelliteGroup,
  SATELLITE_GROUPS,
  type SatelliteCatalog,
  type SatelliteGroup,
  type SatelliteGroupData,
} from '@watchfloor/shared';
import { CELESTRAK_URL, celestrakUrl, parseCelestrak } from '../../../server/src/space/celestrak';
import type { CatalogSource, CatalogStatus } from '../space/catalogClient';

/** CelesTrak publishes new elements every 2 hours, and refuses a second download of the same update. */
const FRESH_MS = 2 * 3_600_000;
const CACHE_NAME = 'watchfloor-satellites';

export interface DemoCatalogOptions {
  fetch?: typeof fetch;
  /** The Cache API, or null where the browser has none. */
  openCache?: () => Promise<Cache | null>;
  now?: () => number;
}

const browserCache = async (): Promise<Cache | null> => {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null; // private windows and blocked storage
  }
};

/**
 * The static demo's satellites. There is no server of ours to download
 * CelesTrak's elements once for everyone, so each visitor's browser asks
 * CelesTrak itself (it answers with CORS `*`), which also means nothing of
 * CelesTrak's is republished with the demo. Its usage policy asks for one
 * download per update, so every group is kept in the Cache API and not
 * asked for again for 2 hours, and without the Cache API nothing is
 * downloaded at all. Any answer but a 200 stops that group for the rest of
 * the visit (the policy: stop and let a human look), keeping the visitor's
 * older copy if they have one.
 */
export class DemoCatalog implements CatalogSource {
  status: CatalogStatus = 'loading';
  readonly unavailableText = 'CelesTrak is not answering just now';
  private readonly groups = new Map<SatelliteGroup, SatelliteGroupData>();
  /** Groups that got anything but a 200 this visit: not asked again until the page reloads. */
  private readonly refused = new Set<SatelliteGroup>();
  private readonly fetch: typeof fetch;
  private readonly openCache: () => Promise<Cache | null>;
  private readonly now: () => number;
  private running = false;
  /** Bumped by every start and stop, so a load from an earlier run is dropped. */
  private run = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onCatalog: (catalog: SatelliteCatalog) => void,
    private readonly onStatus: () => void,
    options: DemoCatalogOptions = {},
  ) {
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.openCache = options.openCache ?? browserCache;
    this.now = options.now ?? Date.now;
  }

  /** Loads now, then again once CelesTrak has updated. The promise is for tests: the layer doesn't wait. */
  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    this.running = true;
    return this.load(++this.run);
  }

  stop(): void {
    this.running = false;
    this.run++;
    clearTimeout(this.timer);
  }

  /** Every group in order, the small ones first so something shows soon; then again once CelesTrak has updated. */
  private async load(run: number): Promise<void> {
    const cache = await this.openCache();
    for (const group of SATELLITE_GROUPS) {
      const data = cache ? await this.group(group, cache) : null;
      if (run !== this.run) return;
      if (data) {
        this.groups.set(group, data);
        this.onCatalog(this.catalog());
        this.setStatus('ready');
      }
    }
    if (this.groups.size === 0) this.setStatus('unavailable');
    // A group that came back with nothing is failing now, not pending: say so once more.
    else if (this.groups.size < SATELLITE_GROUPS.length) this.onCatalog(this.catalog());
    if (run === this.run && this.running) this.timer = setTimeout(() => void this.load(run), FRESH_MS);
  }

  private catalog(): SatelliteCatalog {
    return {
      groups: SATELLITE_GROUPS.map(
        (group) => this.groups.get(group) ?? { group, status: this.refused.has(group) ? 'failing' : 'pending', fetchedAt: null, satellites: [] },
      ),
    };
  }

  /** A group from the visitor's own copy while it's fresh, else from CelesTrak, else the older copy. */
  private async group(group: SatelliteGroup, cache: Cache): Promise<SatelliteGroupData | null> {
    const url = celestrakUrl(CELESTRAK_URL, group);
    const kept = await this.kept(cache, url);
    if (kept && this.now() - kept.fetchedAt! < FRESH_MS) return kept;
    if (this.refused.has(group)) return kept;
    try {
      // A redirect counts towards CelesTrak's error limit too: never follow one.
      const res = await this.fetch(url, { redirect: 'manual', cache: 'no-store' });
      const parsed = res.status === 200 ? parseCelestrak(await res.json(), this.now()) : null;
      if (!parsed) {
        this.refused.add(group);
        return kept;
      }
      const data: SatelliteGroupData = { group, status: 'ok', fetchedAt: this.now(), satellites: parsed.satellites };
      await cache.put(url, new Response(JSON.stringify(encodeSatelliteGroup(data)), { headers: { 'content-type': 'application/json' } }));
      return data;
    } catch {
      this.refused.add(group); // no answer: leave it be for this visit
      return kept;
    }
  }

  /** The visitor's copy of a group, unless it is too old to trust (as the server's rule). */
  private async kept(cache: Cache, url: string): Promise<SatelliteGroupData | null> {
    try {
      const res = await cache.match(url);
      const data = res ? parseSatelliteGroup(await res.json()) : null;
      if (!data || data.fetchedAt === null || this.now() - data.fetchedAt > MAX_ELEMENT_AGE_MS) return null;
      return data;
    } catch {
      return null;
    }
  }

  private setStatus(status: CatalogStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.onStatus();
  }
}
