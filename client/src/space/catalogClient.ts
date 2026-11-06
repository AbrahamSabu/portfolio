import { parseSatelliteCatalog, type SatelliteCatalog } from '@watchfloor/shared';

/** Elements change a few times a day on the server; a look every half hour is plenty (usually a bodiless 304). */
const REFRESH_MS = 30 * 60_000;
/** While the server is still downloading a group for the first time. */
const PENDING_MS = 20_000;
/** No server answer, or no satellites on this one (the static demo): look again much later. */
const UNAVAILABLE_MS = 60 * 60_000;

export type CatalogStatus = 'loading' | 'ready' | 'unavailable';

/**
 * Fetches `/api/satellites` from our own server (never CelesTrak: the server
 * downloads it once for everyone) and hands each new catalogue over.
 */
export class CatalogClient {
  private etag: string | null = null;
  /** Some group not downloaded yet by the server: look again soon. */
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  status: CatalogStatus = 'loading';

  constructor(
    private readonly onCatalog: (catalog: SatelliteCatalog) => void,
    private readonly onStatus: () => void,
  ) {}

  start(): void {
    void this.check();
  }

  private async check(): Promise<void> {
    let wait = REFRESH_MS;
    try {
      // no-cache: the browser revalidates with the ETag, and a 304 hands back its stored copy.
      const res = await fetch('/api/satellites', { cache: 'no-cache' });
      if (res.status === 503) {
        wait = 5_000;
      } else if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
        this.setStatus('unavailable');
        wait = UNAVAILABLE_MS;
      } else {
        const etag = res.headers.get('etag');
        if (etag === null || etag !== this.etag) {
          const catalog = parseSatelliteCatalog(await res.json());
          if (!catalog) throw new Error('not a satellite catalogue');
          this.etag = etag;
          this.pending = catalog.groups.some((g) => g.status === 'pending');
          this.onCatalog(catalog);
          this.setStatus('ready');
        }
        if (this.pending) wait = PENDING_MS;
      }
    } catch {
      if (this.status !== 'ready') this.setStatus('unavailable');
      wait = 60_000;
    }
    this.timer = setTimeout(() => void this.check(), wait);
  }

  private setStatus(status: CatalogStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.onStatus();
  }

  stop(): void {
    clearTimeout(this.timer);
  }
}
