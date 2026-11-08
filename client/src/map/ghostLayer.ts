import { deadReckon, type Track, unwrapLine } from '@watchfloor/shared';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { AFFILIATION_LINE_COLOR } from './colors';

const SOURCE = 'ghosts';
const LINES_SOURCE = 'ghost-lines';
const DOTS = 'ghost-dots';
const LINES = 'ghost-lines';
/** Ghosts redraw this often while projecting: reports land meanwhile and nudge them. */
const REFRESH_MS = 1_000;
/** More than this in view and the projection stops being a picture. */
const MAX_GHOSTS = 5_000;

/**
 * Future ghosts: where everything on screen would be in N minutes if it held
 * course and speed, drawn as faded dots with a thread back to the present.
 * Dead reckoning, clearly presented as such — the timeline's tag says
 * PROJECTED while any ghost is visible.
 */
export class GhostLayer {
  private offsetMs: number | null = null;
  private timer: number | undefined;

  constructor(
    private readonly map: MapLibreMap,
    private readonly live: () => readonly Track[],
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
  }

  /** Project this far ahead, or null to stop. */
  setOffset(offsetMs: number | null): void {
    this.offsetMs = offsetMs;
    window.clearInterval(this.timer);
    this.timer = undefined;
    if (offsetMs !== null) this.timer = window.setInterval(() => this.render(), REFRESH_MS);
    this.render();
  }

  private install(): void {
    const map = this.map;
    for (const id of [SOURCE, LINES_SOURCE]) {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer(LINES)) {
      map.addLayer({
        id: LINES,
        type: 'line',
        source: LINES_SOURCE,
        paint: { 'line-color': AFFILIATION_LINE_COLOR, 'line-width': 0.75, 'line-opacity': 0.25, 'line-dasharray': [2, 3] },
      });
    }
    if (!map.getLayer(DOTS)) {
      map.addLayer({
        id: DOTS,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-color': AFFILIATION_LINE_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 5, 2.6, 10, 3.5],
          'circle-opacity': 0.55,
        },
      });
    }
    this.render();
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    const lines = this.map.getSource<GeoJSONSource>(LINES_SOURCE);
    if (!source || !lines) return;
    const dots: Feature<Point>[] = [];
    const threads: Feature<LineString>[] = [];
    if (this.offsetMs !== null) {
      const bounds = this.map.getBounds();
      for (const t of this.live()) {
        if (dots.length >= MAX_GHOSTS) break;
        if (t.speedMps <= 0) continue;
        if (!bounds.contains([t.lon, t.lat])) continue;
        const ghost = deadReckon(t, t.courseDeg, t.speedMps, this.offsetMs);
        dots.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [ghost.lon, ghost.lat] },
          properties: { affiliation: t.affiliation },
        });
        threads.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: unwrapLine([[t.lon, t.lat], [ghost.lon, ghost.lat]]) },
          properties: { affiliation: t.affiliation },
        });
      }
    }
    source.setData({ type: 'FeatureCollection', features: dots } satisfies FeatureCollection<Point>);
    lines.setData({ type: 'FeatureCollection', features: threads } satisfies FeatureCollection<LineString>);
  }
}
