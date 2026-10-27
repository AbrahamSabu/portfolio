import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Credits for the live data on the map, shown in MapLibre's attribution
 * control next to the basemap's. adsb.lol's data is ODbL, which requires
 * attribution with the licence; OpenSky asks to be credited too.
 *
 * The attribution control collects credits from sources that visible layers
 * use, so the credits ride on an empty source with an empty layer. It is
 * re-added when the running feeds are known (hello) and after a style reload.
 */
const SOURCE = 'data-credits';
const LAYER = 'data-credits';

const CREDITS: Record<string, string> = {
  opensky: '<a href="https://opensky-network.org" target="_blank" rel="noopener">The OpenSky Network</a>',
  adsblol:
    '<a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> (<a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">ODbL</a>)',
};

/** The credit line for a set of feed ids; empty when none need one (the simulator). */
export function creditsFor(feeds: readonly string[]): string {
  const parts = feeds.map((feed) => CREDITS[feed]).filter((c): c is string => c !== undefined);
  return parts.length ? `Aircraft: ${parts.join(', ')}` : '';
}

export class DataCredits {
  private html = '';

  constructor(private readonly map: MapLibreMap) {
    map.on('style.load', () => this.install());
  }

  set(feeds: readonly string[]): void {
    const html = creditsFor(feeds);
    if (html === this.html) return;
    this.html = html;
    if (this.map.isStyleLoaded()) this.install();
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
