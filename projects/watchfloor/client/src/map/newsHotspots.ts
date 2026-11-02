import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { NewsSettings, NewsStore } from '../state/newsStore';

const SOURCE = 'news-heat';
const LAYER = 'news-hotspots';
const REFRESH_MS = 5 * 60_000;
const DAY_MS = 24 * 3_600_000;

/**
 * Where the day's political news gathers: a soft glow under the markers,
 * brighter where more stories are and where they're recent (a story counts
 * fully for an hour, then fades to a third by the end of its day). Seen
 * from the globe and fading out by country zoom, where the markers
 * themselves say it. In the news's white, never a warm "danger" colour:
 * many stories is coverage, not threat.
 */
export class NewsHotspots {
  constructor(
    private readonly map: MapLibreMap,
    private readonly news: NewsStore,
    private readonly settings: NewsSettings,
    private readonly now: () => number,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    news.subscribe(() => this.render());
    settings.subscribe(() => this.applyVisibility());
    window.setInterval(() => this.render(), REFRESH_MS);
  }

  /**
   * Added before the airports, tracks and news (constructed before them),
   * so the glow sits under everything of ours.
   */
  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer(LAYER)) {
      map.addLayer({
        id: LAYER,
        type: 'heatmap',
        source: SOURCE,
        maxzoom: 7,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0.5, 0.5, 5, 0.9],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0.5, 14, 3, 26, 6, 48],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(242, 246, 248, 0)',
            0.25,
            'rgba(168, 230, 255, 0.1)',
            0.6,
            'rgba(200, 238, 255, 0.27)',
            1,
            'rgba(242, 246, 248, 0.48)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 1, 7, 0],
        },
      });
    }
    this.applyVisibility();
    this.render();
  }

  private applyVisibility(): void {
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', this.settings.shown ? 'visible' : 'none');
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const now = this.now();
    const features: Feature<Point>[] = this.news.items.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { weight: hotspotWeight(now - s.publishedAt) },
    }));
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features };
    source.setData(data);
  }
}

/** A story's share of the glow by age: whole for its first hour, a third by the end of its day. */
export function hotspotWeight(ageMs: number): number {
  if (ageMs <= 3_600_000) return 1;
  return Math.max(1 / 3, 1 - ((2 / 3) * (ageMs - 3_600_000)) / (DAY_MS - 3_600_000));
}
