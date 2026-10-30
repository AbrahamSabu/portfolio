import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { NewsSettings, NewsStore } from '../state/newsStore';
import { newsImageId } from './newsIcons';
import type { TrackLayer } from './trackLayer';

const SOURCE = 'news';
export const NEWS_LAYER = 'news-icons';
/** Ages are refreshed this often, so old stories fade without a redraw per frame. */
const AGE_REFRESH_MS = 5 * 60_000;

/**
 * The day's news stories as markers, above the tracks, fading with age (a
 * story from this morning is half as bright as one from this hour). Rebuilt
 * when stories arrive, and every few minutes for the fading. Clicking a
 * marker opens its card, unless a track is under the pointer: tracks are the
 * map's main business.
 */
export class NewsLayer {
  constructor(
    private readonly map: MapLibreMap,
    private readonly news: NewsStore,
    private readonly settings: NewsSettings,
    tracks: TrackLayer,
    private readonly now: () => number,
    onPick: (id: string) => void,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    news.subscribe(() => this.render());
    settings.subscribe(() => this.applyVisibility());
    window.setInterval(() => this.render(), AGE_REFRESH_MS);

    map.on('click', NEWS_LAYER, (event) => {
      if (tracks.trackAt(event.point)) return;
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') onPick(id);
    });
    map.on('mouseenter', NEWS_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', NEWS_LAYER, () => (map.getCanvas().style.cursor = ''));
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer(NEWS_LAYER)) {
      map.addLayer({
        id: NEWS_LAYER,
        type: 'symbol',
        source: SOURCE,
        layout: {
          'icon-image': ['get', 'icon'],
          // Small on the globe, where a whole hemisphere's stories share the screen.
          'icon-size': ['interpolate', ['linear'], ['zoom'], 0.5, 0.45, 3, 0.65, 8, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Newest on top.
          'symbol-sort-key': ['get', 'ageMin'],
        },
        paint: {
          'icon-opacity': ['interpolate', ['linear'], ['get', 'ageMin'], 0, 1, 60, 0.9, 1440, 0.45],
        },
      });
    }
    this.applyVisibility();
    this.render();
  }

  private applyVisibility(): void {
    if (this.map.getLayer(NEWS_LAYER)) this.map.setLayoutProperty(NEWS_LAYER, 'visibility', this.settings.shown ? 'visible' : 'none');
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const now = this.now();
    const features: Feature<Point>[] = this.news.items.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, icon: newsImageId(s.kind), ageMin: Math.max(0, Math.round((now - s.publishedAt) / 60_000)) },
    }));
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features };
    source.setData(data);
  }
}
