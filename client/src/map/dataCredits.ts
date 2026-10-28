import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Credits for the live data on the map, shown in MapLibre's attribution
 * control next to the basemap's. adsb.lol's data is ODbL, which requires
 * attribution with the licence; adsb.fi's terms require a credit with a link
 * to its home page; OpenSky and AISStream are credited too.
 *
 * The attribution control collects credits from sources that visible layers
 * use, so the credits ride on an empty source with an empty layer. It is
 * re-added when the running feeds are known (hello) and after a style reload.
 */
const SOURCE = 'data-credits';
const LAYER = 'data-credits';

/** Credits by feed id, grouped by what each feed shows. */
const CREDITS: Record<string, { kind: 'Aircraft' | 'Ships'; html: string }> = {
  opensky: { kind: 'Aircraft', html: '<a href="https://opensky-network.org" target="_blank" rel="noopener">The OpenSky Network</a>' },
  adsblol: {
    kind: 'Aircraft',
    html: '<a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (<a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">ODbL</a>)',
  },
  adsbfi: { kind: 'Aircraft', html: '<a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a>' },
  ais: { kind: 'Ships', html: '<a href="https://aisstream.io" target="_blank" rel="noopener">AISStream</a>' },
};

/** The credit line for a set of feed ids; empty when none need one (the simulator). */
export function creditsFor(feeds: readonly string[]): string {
  const credits = feeds.map((feed) => CREDITS[feed]).filter((c) => c !== undefined);
  const line = (kind: 'Aircraft' | 'Ships') => {
    const parts = credits.filter((c) => c.kind === kind).map((c) => c.html);
    return parts.length ? `${kind}: ${parts.join(', ')}` : '';
  };
  return [line('Aircraft'), line('Ships')].filter(Boolean).join('; ');
}

export class DataCredits {
  private html = '';
  /**
   * Whether the style can take a source now. Not `map.isStyleLoaded()`: that
   * is also false while tiles load, so a hello arriving then (a heavy
   * worldwide page) would skip the install, after style.load had already fired.
   */
  private styleReady: boolean;

  constructor(private readonly map: MapLibreMap) {
    this.styleReady = map.isStyleLoaded() === true;
    map.on('styledataloading', () => {
      this.styleReady = false;
    });
    map.on('style.load', () => {
      this.styleReady = true;
      this.install();
    });
  }

  set(feeds: readonly string[]): void {
    const html = creditsFor(feeds);
    if (html === this.html) return;
    this.html = html;
    if (this.styleReady) this.install();
  }

  private install(): void {
    const map = this.map;
    if (map.getLayer(LAYER)) map.removeLayer(LAYER);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    if (!this.html) return;
    map.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: this.html,
    });
    map.addLayer({ id: LAYER, type: 'circle', source: SOURCE });
  }
}
