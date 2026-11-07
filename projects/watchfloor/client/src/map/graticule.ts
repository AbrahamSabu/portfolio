import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';

const SOURCE = 'graticule';
const LAYER = 'graticule';
/** A vertex every few degrees, so the lines curve properly on the globe. */
const STEP = 5;

/** One line per 10° of longitude and latitude; the equator, meridian and 30° lines are major. */
export function graticuleGeoJson(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (let lon = -180; lon < 180; lon += 10) {
    const coordinates: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += STEP) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { major: lon % 30 === 0 ? 1 : 0 } });
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    const coordinates: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += STEP) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { major: lat % 30 === 0 ? 1 : 0 } });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * A faint graticule in the display's own light: the mark of a plotting
 * surface rather than a street map. Under the basemap's labels and under
 * everything of ours; the night shade dims it like the ground. Built once —
 * it never changes.
 */
export class Graticule {
  /** The skin's grid colour (state/skins.ts); the display's blue until told otherwise. */
  private colour = '#3FB6FF';

  constructor(private readonly map: MapLibreMap) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
  }

  setColour(colour: string): void {
    this.colour = colour;
    if (this.map.getLayer(LAYER)) this.map.setPaintProperty(LAYER, 'line-color', colour);
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: graticuleGeoJson() });
    if (map.getLayer(LAYER)) return;
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(
      {
        id: LAYER,
        type: 'line',
        source: SOURCE,
        paint: {
          'line-color': this.colour,
          'line-width': 0.75,
          // Quieter as the streets take over from the globe.
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            ['case', ['==', ['get', 'major'], 1], 0.22, 0.12],
            7,
            ['case', ['==', ['get', 'major'], 1], 0.1, 0.05],
          ],
        },
      },
      firstSymbol,
    );
  }
}
