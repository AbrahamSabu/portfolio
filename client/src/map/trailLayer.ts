import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { GeoJSONSource, LineLayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { Track } from '@watchfloor/shared';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { AFFILIATION_LINE_COLOR, LOWEST_TRACK_LAYER, SYMBOL_MIN_ZOOM, type TrackLayer } from './trackLayer';
import { inViewBox } from './viewBox';

/** Which tracks show their history. */
export type TrailMode = 'all' | 'selected' | 'off';

const TRAILS_SOURCE = 'track-trails';
const HEADS_SOURCE = 'track-trail-heads';
const TRAILS_LAYER = 'track-trails';
const HEADS_LAYER = 'track-trail-heads';

/** Quiet by default so trails never compete with symbols; the selected one stands out. */
const PAINT: LineLayerSpecification['paint'] = {
  'line-color': AFFILIATION_LINE_COLOR,
  'line-width': ['case', ['==', ['get', 'selected'], 1], 2, 1.25],
  'line-opacity': ['case', ['==', ['get', 'selected'], 1], 0.85, 0.35],
};

/**
 * Draws where each track has been.
 *
 * A trail is the track's *reported* positions, never dead-reckoned ones, so it
 * shows only where the track was actually seen. It is drawn in two parts:
 *
 * - The trail itself changes only when a report arrives (about once a
 *   second), so it is rebuilt only when the store changes.
 * - The "head" joins the last report to the symbol, which moves at 10 Hz.
 *   It is one short segment per track, in its own small source, so the
 *   frequent update stays cheap however long the trails get.
 *
 * Zoomed out to dots, "all" draws only the selected track's trail. A ship's
 * 30-minute trail is about a pixel long at world zoom, and rebuilding tens of
 * thousands of them every second (each delta changes the store) was most of
 * the main thread's work with the whole world loaded.
 */
export class TrailLayer {
  private currentMode: TrailMode;

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly tracks: TrackLayer,
    private readonly selection: Selection,
    mode: TrailMode,
  ) {
    this.currentMode = mode;
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    store.subscribe(() => this.renderTrails());
    selection.subscribe(() => this.renderTrails());
    tracks.onFrame(() => this.renderHeads());
    // Trails are culled to the view, so a finished pan or zoom needs a rebuild.
    map.on('moveend', () => this.renderTrails());
  }

  get mode(): TrailMode {
    return this.currentMode;
  }

  setMode(mode: TrailMode): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.renderTrails();
    this.renderHeads();
  }

  private install(): void {
    const map = this.map;
    for (const id of [TRAILS_SOURCE, HEADS_SOURCE]) {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: emptyCollection() });
    }
    // Under the speed leaders, which are under the symbols.
    const beforeId = map.getLayer(LOWEST_TRACK_LAYER) ? LOWEST_TRACK_LAYER : undefined;
    for (const [id, source] of [
      [TRAILS_LAYER, TRAILS_SOURCE],
      [HEADS_LAYER, HEADS_SOURCE],
    ] as const) {
      if (map.getLayer(id)) continue;
      map.addLayer(
        {
          id,
          type: 'line',
          source,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: PAINT,
        },
        beforeId,
      );
    }
    this.renderTrails();
  }

  /** The tracks whose trails are visible in the current mode, and near enough the screen to draw. */
  private *visibleTracks(): Iterable<Track> {
    if (this.currentMode === 'all' && this.map.getZoom() >= SYMBOL_MIN_ZOOM) {
      const view = this.tracks.viewBox();
      for (const track of this.store.all()) {
        const pos = this.tracks.positionOf(track.id);
        if (track.id === this.selection.id || (pos && inViewBox(view, pos.lon, pos.lat))) yield track;
      }
    } else if (this.currentMode !== 'off' && this.selection.id) {
      const track = this.store.get(this.selection.id);
      if (track) yield track;
    }
  }

  private renderTrails(): void {
    const features: Feature<LineString>[] = [];
    for (const track of this.visibleTracks()) {
      const points = this.store.trail(track.id);
      if (points.length < 2) continue;
      features.push(line(track, this.selection.id, points.map(([lon, lat]) => [lon, lat])));
    }
    this.map.getSource<GeoJSONSource>(TRAILS_SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  private renderHeads(): void {
    const features: Feature<LineString>[] = [];
    for (const track of this.visibleTracks()) {
      const last = this.store.trail(track.id).at(-1);
      const pos = this.tracks.positionOf(track.id);
      if (!last || !pos) continue;
      features.push(
        line(track, this.selection.id, [
          [last[0], last[1]],
          [pos.lon, pos.lat],
        ]),
      );
    }
    this.map.getSource<GeoJSONSource>(HEADS_SOURCE)?.setData({ type: 'FeatureCollection', features });
  }
}

function line(track: Track, selectedId: string | null, coordinates: number[][]): Feature<LineString> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: { affiliation: track.affiliation, selected: track.id === selectedId ? 1 : 0 },
  };
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
