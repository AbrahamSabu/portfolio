import { parseSatelliteCatalog, type SatelliteCatalog } from '@watchfloor/shared';

/** Elements change a few times a day on the server; a look every half hour is plenty (usually a bodiless 304). */
const REFRESH_MS = 30 * 60_000;
/** While the server is still downloading a group for the first time. */
const PENDING_MS = 20_000;
/** No server answer, or no satellites on this one (the static demo): look again much later. */
const UNAVAILABLE_MS = 60 * 60_000;

export type CatalogStatus = 'loading' | 'ready' | 'unavailable';

/** Where the catalogue comes from: our server (CatalogClient), or CelesTrak itself in the static demo (demo/demoCatalog.ts). */
export interface CatalogSource {
  start(): void;
  stop(): void;
  readonly status: CatalogStatus;
  /** Why there are no satellites, in words for the Layers menu. */
  readonly unavailableText: string;
}

/**
 * Fetches `/api/satellites` from our own server (never CelesTrak: the server
 * downloads it once for everyone) and hands each new catalogue over.
 */
export class CatalogClient implements CatalogSource {
  private etag: string | null = null;
  /** Some group not downloaded yet by the server: look again soon. */
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  /** Bumped by every start and stop, so an answer from an earlier run is dropped, not acted on. */
  private run = 0;
  status: CatalogStatus = 'loading';
  readonly unavailableText = 'not available from this server';

  constructor(
    private readonly onCatalog: (catalog: SatelliteCatalog) => void,
    private readonly onStatus: () => void,
    /** The server answered 404: satellites are switched off there (ServerOrBrowserCatalog then fetches them itself). */
    private readonly onOff?: () => void,
  ) {}

  /** Checks now, then every so often until stopped. Starting twice is harmless. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.check(++this.run);
  }

  stop(): void {
    this.running = false;
    this.run++;
    clearTimeout(this.timer);
  }

  private async check(run: number): Promise<void> {
    let wait = REFRESH_MS;
    try {
      // no-cache: the browser revalidates with the ETag, and a 304 hands back its stored copy.
      const res = await fetch('/api/satellites', { cache: 'no-cache' });
      if (run !== this.run) return;
      if (res.status === 503) {
        wait = 5_000;
      } else if (res.status === 404 && this.onOff) {
        // Switched off on this server: someone else fetches them now, and this client is done.
        this.onOff();
        return;
      } else if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
        this.setStatus('unavailable');
        wait = UNAVAILABLE_MS;
      } else {
        const etag = res.headers.get('etag');
        if (etag === null || etag !== this.etag) {
          const catalog = parseSatelliteCatalog(await res.json());
          if (run !== this.run) return;
          if (!catalog) throw new Error('not a satellite catalogue');
          this.etag = etag;
          this.pending = catalog.groups.some((g) => g.status === 'pending');
          this.onCatalog(catalog);
          this.setStatus('ready');
        }
        if (this.pending) wait = PENDING_MS;
      }
    } catch {
      if (run !== this.run) return;
      if (this.status !== 'ready') this.setStatus('unavailable');
      wait = 60_000;
    }
    if (run === this.run) this.timer = setTimeout(() => void this.check(run), wait);
  }

  private setStatus(status: CatalogStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.onStatus();
  }
}
