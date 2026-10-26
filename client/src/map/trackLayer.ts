import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { DataDrivenPropertyValueSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { deadReckon, destination, ruleFor, type Domain, type LatLon } from '@watchfloor/shared';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { parseSymbolImageId, renderSymbol, sidcFor, symbolImageId } from './symbols';

const TRACKS_SOURCE = 'tracks';
const LEADERS_SOURCE = 'track-leaders';
export const SYMBOL_LAYER = 'track-symbols';
export const LEADER_LAYER = 'track-leaders';

/** Positions are recomputed at 10 Hz: smooth enough, cheap enough. */
const RENDER_INTERVAL_MS = 100;
/** Speed leaders show where a track will be after this long. Ships are slow, so theirs look further ahead. */
const LEADER_SECONDS: Record<Domain, number> = { air: 60, sea: 600 };
/** Callsign labels appear from this zoom level in. */
const LABEL_MIN_ZOOM = 8;

/** Matches milsymbol's "Light" fills, so leader lines share their symbol's colour. */
export const AFFILIATION_COLOR = {
  friend: '#80E0FF',
  hostile: '#FF8080',
  neutral: '#AAFFAA',
  unknown: '#FFFF80',
  pending: '#FFFF80',
} as const;

/** Line colour from a feature's `affiliation` property. Shared by leaders and trails. */
export const AFFILIATION_LINE_COLOR: DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'affiliation'],
  'friend', AFFILIATION_COLOR.friend,
  'hostile', AFFILIATION_COLOR.hostile,
  'neutral', AFFILIATION_COLOR.neutral,
  AFFILIATION_COLOR.unknown,
];

export interface DisplayPosition extends LatLon {
  stale: boolean;
}

/**
 * Draws every track on the map and keeps it moving.
 *
 * Reports arrive every few seconds, but symbols shouldn't sit still and then
 * jump. Each frame, every live track is dead-reckoned from its last report
 * using its course and speed. Once a track goes stale, it stops moving and
 * fades, so the operator can see it's no longer reliable.
 */
export class TrackLayer {
  private readonly positions = new Map<string, DisplayPosition>();
  private lastRender = 0;
  private readonly frameListeners = new Set<() => void>();

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly selection: Selection,
  ) {
    map.setMissingStyleImageResolver((id) => this.resolveImage(id));
    // Re-add sources and layers whenever the style is (re)loaded, e.g. after the offline fallback.
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    this.bindInteraction();
    requestAnimationFrame(this.loop);
  }

  /** Where a track is currently drawn (dead-reckoned), for the reticle, follow mode and details. */
  positionOf(id: string): DisplayPosition | undefined {
    return this.positions.get(id);
  }

  /** Called after each render, once positions are up to date. */
  onFrame(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(TRACKS_SOURCE)) {
      map.addSource(TRACKS_SOURCE, { type: 'geojson', data: emptyCollection() });
    }
    if (!map.getSource(LEADERS_SOURCE)) {
      map.addSource(LEADERS_SOURCE, { type: 'geojson', data: emptyCollection() });
    }
    if (!map.getLayer(LEADER_LAYER)) {
      map.addLayer({
        id: LEADER_LAYER,
        type: 'line',
        source: LEADERS_SOURCE,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': AFFILIATION_LINE_COLOR,
          'line-width': 1.5,
          'line-opacity': 0.7,
        },
      });
    }
    if (!map.getLayer(SYMBOL_LAYER)) {
      map.addLayer({
        id: SYMBOL_LAYER,
        type: 'symbol',
        source: TRACKS_SOURCE,
        layout: {
          'icon-image': ['step', ['zoom'], ['get', 'icon'], LABEL_MIN_ZOOM, ['get', 'iconLabeled']],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Higher keys draw on top: selected track first, then aircraft over ships.
          'symbol-sort-key': ['get', 'sortKey'],
        },
        paint: {
          'icon-opacity': ['case', ['==', ['get', 'stale'], 1], 0.4, 1],
        },
      });
    }
    this.render();
  }

  private resolveImage(id: string): void {
    const parsed = parseSymbolImageId(id);
    if (!parsed || this.map.hasImage(id)) return;
    const rendered = renderSymbol(parsed.sidc, parsed.label, Math.min(window.devicePixelRatio || 1, 3));
    if (rendered) this.map.addImage(id, rendered.image, { pixelRatio: rendered.pixelRatio });
  }

  private bindInteraction(): void {
    const map = this.map;
    map.on('click', (event) => {
      if (!map.getLayer(SYMBOL_LAYER)) return;
      const { x, y } = event.point;
      const pad = 6; // forgiving hit area, especially on touch screens
      const hits = map.queryRenderedFeatures(
        [
          [x - pad, y - pad],
          [x + pad, y + pad],
        ],
        { layers: [SYMBOL_LAYER] },
      );
      // Prefer whatever is drawn on top.
      hits.sort((a, b) => Number(b.properties.sortKey) - Number(a.properties.sortKey));
      const id = hits[0]?.properties.id;
      this.selection.select(typeof id === 'string' ? id : null);
    });
    map.on('mouseenter', SYMBOL_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', SYMBOL_LAYER, () => (map.getCanvas().style.cursor = ''));
  }

  private readonly loop = (time: number): void => {
    requestAnimationFrame(this.loop);
    if (document.hidden || time - this.lastRender < RENDER_INTERVAL_MS) return;
    this.lastRender = time;
    this.render();
  };

  private render(): void {
    const now = this.clock.now();
    const selectedId = this.selection.id;
    const points: Feature<Point>[] = [];
    const leaders: Feature<LineString>[] = [];
    const seen = new Set<string>();

    for (const track of this.store.all()) {
      const rule = ruleFor(track, this.store.staleness);
      const age = now - track.observedAt;
      const stale = age > rule.staleAfterMs;
      // Dead-reckon up to the stale threshold, then hold the last estimate.
      const pos = deadReckon(track, track.courseDeg, track.speedMps, Math.min(age, rule.staleAfterMs));
      this.positions.set(track.id, { lat: pos.lat, lon: pos.lon, stale });
      seen.add(track.id);

      const sidc = sidcFor(track);
      const icon = symbolImageId(sidc);
      points.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] },
        properties: {
          id: track.id,
          icon,
          iconLabeled: track.callsign ? symbolImageId(sidc, track.callsign) : icon,
          stale: stale ? 1 : 0,
          sortKey: (track.id === selectedId ? 10 : 0) + (track.domain === 'air' ? 1 : 0),
        },
      });

      if (!stale && track.speedMps > 0.5) {
        const tip = destination(pos, track.courseDeg, track.speedMps * LEADER_SECONDS[track.domain]);
        leaders.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [pos.lon, pos.lat],
              [tip.lon, tip.lat],
            ],
          },
          properties: { affiliation: track.affiliation },
        });
      }
    }

    for (const id of this.positions.keys()) {
      if (!seen.has(id)) this.positions.delete(id);
    }

    const trackSource = this.map.getSource<GeoJSONSource>(TRACKS_SOURCE);
    const leaderSource = this.map.getSource<GeoJSONSource>(LEADERS_SOURCE);
    if (trackSource && leaderSource) {
      trackSource.setData({ type: 'FeatureCollection', features: points });
      leaderSource.setData({ type: 'FeatureCollection', features: leaders });
    }
    for (const listener of this.frameListeners) listener();
  }
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
