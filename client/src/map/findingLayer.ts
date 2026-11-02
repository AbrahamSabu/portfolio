import type { Finding } from '@watchfloor/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FindingStore } from '../state/findings';
import type { StoredToggle } from '../state/storedToggle';
import { isDrawing } from './regionDraw';
import type { TrackLayer } from './trackLayer';

const SOURCE = 'findings';
const RING = 'finding-rings';
const DOT = 'finding-dots';
/** The HUD blue: findings are the floor's own observations, not emergencies. */
const BLUE = '#3FB6FF';
/** Ghosts (AIS contact lost) fade over this long; refreshed every minute. */
const FADE_MS = 45 * 60_000;
const AGE_REFRESH_MS = 60_000;

/**
 * The watchers' findings on the map: a ring around where something is
 * circling, converging or gone silent, with a dot at the spot. A ghost (AIS
 * contact lost) fades as its last contact ages. Clicking a ring (unless a
 * track is under the pointer) hands the finding to the page, which selects
 * the track involved.
 */
export class FindingLayer {
  constructor(
    private readonly map: MapLibreMap,
    private readonly findings: FindingStore,
    private readonly shown: StoredToggle,
    tracks: TrackLayer,
    private readonly now: () => number,
    onPick: (finding: Finding) => void,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    findings.subscribe(() => this.render());
    shown.subscribe(() => this.applyVisibility());
    window.setInterval(() => this.render(), AGE_REFRESH_MS);
    map.on('click', RING, (event) => {
      if (isDrawing() || tracks.trackAt(event.point)) return;
      const id = event.features?.[0]?.properties?.id;
      const finding = typeof id === 'string' ? findings.get(id) : undefined;
      if (finding) onPick(finding);
    });
    map.on('mouseenter', RING, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', RING, () => (map.getCanvas().style.cursor = ''));
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer(RING)) {
      map.addLayer({
        id: RING,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-color': 'rgba(0,0,0,0)',
          // Zoom must be the outermost input (MapLibre rejects it inside '*').
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 6, 6, 11, 10, 16],
          'circle-stroke-color': BLUE,
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': ['*', 0.85, ['get', 'fade']],
        },
      });
    }
    if (!map.getLayer(DOT)) {
      map.addLayer({
        id: DOT,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-color': BLUE,
          'circle-radius': 2,
          'circle-opacity': ['*', 0.9, ['get', 'fade']],
        },
      });
    }
    this.applyVisibility();
    this.render();
  }

  private applyVisibility(): void {
    const visibility = this.shown.value ? 'visible' : 'none';
    for (const layer of [RING, DOT]) {
      if (this.map.getLayer(layer)) this.map.setLayoutProperty(layer, 'visibility', visibility);
    }
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const now = this.now();
    const features: Feature<Point>[] = this.findings.items.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
      properties: {
        id: f.id,
        // Ghosts dim with age; live observations hold full strength.
        fade: f.kind === 'dark' ? Math.max(0.25, 1 - (now - f.since) / FADE_MS) : 1,
      },
    }));
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features };
    source.setData(data);
  }
}
