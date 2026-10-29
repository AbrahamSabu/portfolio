import type { Feature, LineString, Point } from 'geojson';
import { LngLatBounds, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { Domain } from '@watchfloor/shared';
import { splitAtGaps, type SelectedPath } from '../state/selectedPath';
import type { TrackStore } from '../state/trackStore';
import { LOWEST_TRACK_LAYER } from './trackLayer';

const SOURCE = 'selected-path';
const CASING_LAYER = 'selected-path-casing';
const LINE_LAYER = 'selected-path-line';
const GAP_LAYER = 'selected-path-gaps';
/** A ring where the path begins: the departure, when OpenSky filled it in. */
const START_LAYER = 'selected-path-start';

/** The selection accent (styles.css --accent): the path belongs to the selection, not to an identity. */
const ACCENT = '#C9A0FF';
const CASING = 'rgba(9, 16, 21, 0.55)';

/**
 * A pause longer than this between points is drawn dashed: no reports, so
 * the straight line between them is a guess. Longer than the server keeps
 * between points when reports flow (5 and 15 minutes), and than OpenSky's
 * waypoint spacing (at most 15 minutes).
 */
const GAP_MS: Record<Domain, number> = { air: 20 * 60_000, sea: 60 * 60_000 };

/**
 * Draws the selected track's whole path, as far back as the server has it,
 * above the short trails and below the tracks. Rebuilt only when the path
 * changes (a new selection, the server's answer, a report), never per frame.
 */
export class PathLayer {
  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly path: SelectedPath,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    path.subscribe(() => this.render());
  }

  /**
   * Zoom the map to show the whole path, clear of the details panel. The map
   * doesn't zoom out past its minimum, so a long-haul flight may not fit: then
   * it shows as much of the most recent part as does, which is what matters.
   */
  fit(): void {
    const points = this.path.points;
    if (points.length < 2) return;
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    // The details panel sits on the right, or as a bottom sheet on a phone.
    const padding = narrow ? { top: 70, bottom: 360, left: 50, right: 40 } : { top: 90, bottom: 80, left: 110, right: 420 };
    // One continuous line, unwrapped across the antimeridian.
    const line = splitAtGaps(points, Infinity).solid[0] ?? [];
    const boundsOf = (coords: [number, number][]) =>
      coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
    const fits = (coords: [number, number][]) =>
      (this.map.cameraForBounds(boundsOf(coords), { padding })?.zoom ?? -1) >= this.map.getMinZoom();
    // The earliest point the view can start from (binary search: dropping old points only shrinks the bounds)...
    let lo = 0;
    let hi = line.length - 2;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(line.slice(mid))) hi = mid;
      else lo = mid + 1;
    }
    let coords = line.slice(lo);
    // ...then as far back along the segment before it as still fits, since one
    // segment can be long (an ocean crossing with no reports).
    const before = line[lo - 1];
    const after = line[lo];
    if (before && after) {
      let a = 0; // fraction from `before` towards `after`; 1 fits, 0 doesn't
      let b = 1;
      for (let k = 0; k < 12; k++) {
        const f = (a + b) / 2;
        const p: [number, number] = [before[0] + (after[0] - before[0]) * f, before[1] + (after[1] - before[1]) * f];
        if (fits([p, ...coords])) b = f;
        else a = f;
      }
      coords = [[before[0] + (after[0] - before[0]) * b, before[1] + (after[1] - before[1]) * b], ...coords];
    }
    this.map.fitBounds(boundsOf(coords), {
      padding,
      maxZoom: 11,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
    });
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const beforeId = map.getLayer(LOWEST_TRACK_LAYER) ? LOWEST_TRACK_LAYER : undefined;
    if (!map.getLayer(CASING_LAYER)) {
      map.addLayer(
        {
          id: CASING_LAYER,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'gap'], 0],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': CASING, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 7] },
        },
        beforeId,
      );
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer(
        {
          id: LINE_LAYER,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'gap'], 0],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ACCENT, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 10, 4], 'line-opacity': 0.95 },
        },
        beforeId,
      );
    }
    if (!map.getLayer(GAP_LAYER)) {
      map.addLayer(
        {
          id: GAP_LAYER,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'gap'], 1],
          paint: { 'line-color': ACCENT, 'line-width': 2, 'line-opacity': 0.75, 'line-dasharray': [2, 2.5] },
        },
        beforeId,
      );
    }
    if (!map.getLayer(START_LAYER)) {
      map.addLayer(
        {
          id: START_LAYER,
          type: 'circle',
          source: SOURCE,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 5,
            'circle-color': CASING,
            'circle-stroke-color': ACCENT,
            'circle-stroke-width': 2.5,
          },
        },
        beforeId,
      );
    }
    this.render();
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const id = this.path.id;
    const domain = (id && this.store.get(id)?.domain) || 'air';
    const { solid, gaps } = splitAtGaps(this.path.points, GAP_MS[domain]);
    const line = (coordinates: [number, number][], gap: 0 | 1): Feature<LineString> => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { gap },
    });
    // splitAtGaps leaves the first point's longitude as it is, so this is where the line starts.
    const first = this.path.points.length > 1 ? this.path.points[0] : undefined;
    const start: Feature<Point>[] = first
      ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [first[0], first[1]] }, properties: {} }]
      : [];
    source.setData({
      type: 'FeatureCollection',
      features: [...solid.map((c) => line(c, 0)), ...gaps.map((c) => line(c, 1)), ...start],
    });
  }
}
