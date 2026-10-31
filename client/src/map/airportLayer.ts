import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { StoredToggle } from '../state/storedToggle';
import airportsUrl from '../data/airports.json?url';
import { type Airport, type AirportSize, airportCode, airportImageId, airportLabelImageId, parseAirports } from './airports';

const SOURCE = 'airports';
const SIZES = [0, 1, 2] as const;
const iconLayer = (size: AirportSize) => `airport-icons-${size}`;
const labelLayer = (size: AirportSize) => `airport-labels-${size}`;
const ICON_LAYERS = SIZES.map(iconLayer);
const HIT_PX = 5;

/**
 * Zoom at which each size of airport appears: the big ones from the globe,
 * medium from about a country's view, small scheduled ones from a region's.
 * Codes follow a little later, and full names close in.
 */
const SHOW_FROM = [0, 6, 8] as const;
const CODE_FROM = [5, 7, 9] as const;
const NAME_FROM = 10;

/**
 * Airports under everything else we draw (trails, tracks, news): a dim
 * ring with a runway. The data (~480 KB, ~185 KB gzipped) is fetched once
 * after the map is up, so it never slows the first picture. Hover shows the
 * name and codes (through the HoverCard); the A key hides them.
 */
export class AirportLayer {
  private airports: Airport[] = [];

  constructor(
    private readonly map: MapLibreMap,
    private readonly shown: StoredToggle,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    shown.subscribe(() => this.applyVisibility());
    void this.load();
  }

  /** The airport under a point (within a few pixels: the icons are small), if one is drawn there. */
  airportAt(point: { x: number; y: number }): Airport | undefined {
    const layers = ICON_LAYERS.filter((layer) => this.map.getLayer(layer));
    if (!this.shown.value || layers.length === 0) return undefined;
    const box: [[number, number], [number, number]] = [[point.x - HIT_PX, point.y - HIT_PX], [point.x + HIT_PX, point.y + HIT_PX]];
    const [feature] = this.map.queryRenderedFeatures(box, { layers });
    const i = feature?.properties?.i;
    return typeof i === 'number' ? this.airports[i] : undefined;
  }

  private async load(): Promise<void> {
    try {
      const res = await fetch(airportsUrl);
      if (!res.ok) return;
      this.airports = parseAirports(await res.json());
      this.render();
    } catch {
      // No airports is a quieter map, not a broken one.
    }
  }

  /**
   * Added first on every style load, so trails, tracks and news (added
   * after, by layers constructed later) all draw above.
   */
  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // One pair of layers per size, so minzoom keeps small airports' tiles from being built at all zoomed out.
    for (const size of SIZES) {
      if (map.getLayer(iconLayer(size))) continue;
      const filter = ['==', ['get', 'size'], size] as never;
      map.addLayer({
        id: iconLayer(size),
        type: 'symbol',
        source: SOURCE,
        minzoom: SHOW_FROM[size],
        filter,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 0.5, 0.55, 4, 0.75, 8, 1],
          // Furniture: never pushes a track, a label or another airport off the map.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 0.5, 0.55, 5, 0.85] },
      });
      map.addLayer({
        id: labelLayer(size),
        type: 'symbol',
        source: SOURCE,
        minzoom: CODE_FROM[size],
        filter,
        layout: {
          'icon-image': ['step', ['zoom'], ['get', 'codeImage'], NAME_FROM, ['get', 'nameImage']],
          'icon-anchor': 'left',
          'icon-offset': [9, 0],
          // Labels give way to each other and to the tracks' callsigns (placed first, above).
          'icon-allow-overlap': false,
        },
      });
    }
    this.applyVisibility();
    this.render();
  }

  private applyVisibility(): void {
    const visibility = this.shown.value ? 'visible' : 'none';
    for (const layer of [...ICON_LAYERS, ...SIZES.map(labelLayer)]) if (this.map.getLayer(layer)) this.map.setLayoutProperty(layer, 'visibility', visibility);
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source || this.airports.length === 0) return;
    const features: Feature<Point>[] = this.airports.map((a, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: {
        i,
        size: a.size,
        icon: airportImageId(a.size),
        codeImage: airportLabelImageId(airportCode(a)),
        nameImage: airportLabelImageId(`${airportCode(a)}  ${a.name}`),
      },
    }));
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features };
    source.setData(data);
  }
}
