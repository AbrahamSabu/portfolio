import type { SatelliteCatalog } from '@watchfloor/shared';
import { CatalogClient, type CatalogSource, type CatalogStatus } from './catalogClient';

type OnCatalog = (catalog: SatelliteCatalog) => void;

/** CelesTrak from this browser, as the static demo does; the code comes down only when it's needed. */
async function fromBrowser(onCatalog: OnCatalog, onStatus: () => void): Promise<CatalogSource> {
  const { DemoCatalog } = await import('../demo/demoCatalog');
  return new DemoCatalog(onCatalog, onStatus);
}

/**
 * Our server's catalogue or, when the server has satellites switched off
 * (it answers 404, as the public server does: a free host keeps no copy
 * through a sleep, so it would download again on every wake, which
 * CelesTrak refuses), CelesTrak from this browser, as the static demo does.
 * Each visitor then downloads each update once and keeps it in their
 * browser's cache, which is what CelesTrak's rules ask.
 */
export class ServerOrBrowserCatalog implements CatalogSource {
  private source: CatalogSource;
  private running = false;
  private switched = false;

  constructor(
    private readonly onCatalog: OnCatalog,
    private readonly onStatus: () => void,
    private readonly browser: (onCatalog: OnCatalog, onStatus: () => void) => Promise<CatalogSource> = fromBrowser,
  ) {
    this.source = new CatalogClient(onCatalog, onStatus, () => void this.useBrowser());
  }

  get status(): CatalogStatus {
    return this.source.status;
  }

  get unavailableText(): string {
    return this.source.unavailableText;
  }

  start(): void {
    this.running = true;
    this.source.start();
  }

  stop(): void {
    this.running = false;
    this.source.stop();
  }

  private async useBrowser(): Promise<void> {
    if (this.switched) return;
    this.switched = true;
    this.source.stop();
    try {
      this.source = await this.browser(this.onCatalog, this.onStatus);
    } catch {
      // Its code didn't load (offline for a moment): the server's client carries on, and its
      // next 404 brings us here again.
      this.switched = false;
      if (this.running) this.source.start();
      return;
    }
    this.onStatus();
    if (this.running) this.source.start();
  }
}
