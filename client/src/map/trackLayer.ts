import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { DataDrivenPropertyValueSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { deadReckon, destination, ruleFor, type Domain, type LatLon } from '@watchfloor/shared';
import type { ServerClock } from '../state/clock';
import type { PictureFilter } from '../state/pictureFilter';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { renderIntervalMs } from './renderRate';
import { inViewBox, padViewBox, type ViewBox } from './viewBox';
import { parseSymbolImageId, renderSymbol, sidcFor, symbolImageId } from './symbols';

/**
 * Each domain has its own sources and layers, so aircraft and ships can be
 * redrawn on their own schedules (renderRate.ts): every update copies a
 * source's whole feature list to MapLibre's worker. Ships are drawn first, so
 * aircraft sit on top.
 */
const DOMAINS: readonly Domain[] = ['sea', 'air'];
const ids = (domain: Domain) => ({
  source: `tracks-${domain}`,
  leaders: `track-leaders-${domain}`,
  /** Small dots for the zoomed-out view, where thousands of full symbols would just be a smear. */
  dots: `track-dots-${domain}`,
  symbols: `track-symbols-${domain}`,
});
/** The lowest of the track layers, so trails can go under all of them. */
export const LOWEST_TRACK_LAYER = ids('sea').leaders;

/** Speed leaders show where a track will be after this long. Ships are slow, so theirs look further ahead. */
const LEADER_SECONDS: Record<Domain, number> = { air: 60, sea: 600 };
/** Margin around the screen, as a fraction of its size, within which tracks are still drawn. */
const VIEW_MARGIN = 0.5;
/** Full symbols and speed leaders from this zoom in; dots below it. */
export const SYMBOL_MIN_ZOOM = 5;
/**
 * Below this zoom, features carry only what the dots need. Zoomed out to the
 * world, every track in view is copied to MapLibre's worker on each update
 * (36,000 at once, measured, Oct 2026), so symbol ids nobody draws are pure
 * cost. One level of margin above it, so symbols are ready while a zoom-in
 * animation crosses SYMBOL_MIN_ZOOM, before moveend rebuilds.
 */
const ICON_PROPS_MIN_ZOOM = SYMBOL_MIN_ZOOM - 1;
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
  private readonly positions: Record<Domain, Map<string, DisplayPosition>> = { air: new Map(), sea: new Map() };
  private readonly lastRender: Record<Domain, number> = { air: 0, sea: 0 };
  /** Set to redraw a domain on the next frame, whatever its interval says. */
  private readonly forced: Record<Domain, boolean> = { air: true, sea: true };
  private readonly frameListeners = new Set<() => void>();

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly selection: Selection,
    private readonly filter: PictureFilter,
  ) {
    map.setMissingStyleImageResolver((id) => this.resolveImage(id));
    // Re-add sources and layers whenever the style is (re)loaded, e.g. after the offline fallback.
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    this.bindInteraction();
    // New reports show at once for aircraft. Ships wait for their own
    // interval: zoomed out, a ship's new report moves it far less than a
    // pixel, and AIS changes the store every second.
    store.subscribe(() => (this.forced.air = true));
    selection.subscribe(() => this.forceAll());
    filter.subscribe(() => this.forceAll());
    // Crossing the symbol zoom changes whether leaders are computed, and a
    // finished pan or zoom brings new tracks into the drawn area.
    map.on('moveend', () => this.forceAll());
    requestAnimationFrame(this.loop);
  }

  /** Where a track is currently drawn (dead-reckoned), for the reticle, follow mode and details. */
  positionOf(id: string): DisplayPosition | undefined {
    return this.positions.air.get(id) ?? this.positions.sea.get(id);
  }

  private forceAll(): void {
    for (const domain of DOMAINS) this.forced[domain] = true;
  }

  /** The screen plus a margin: tracks outside it are positioned but not drawn. */
  viewBox(): ViewBox {
    const b = this.map.getBounds();
    return padViewBox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, VIEW_MARGIN);
  }

  /** Called after each render, once positions are up to date. */
  onFrame(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  private install(): void {
    const map = this.map;
    for (const domain of DOMAINS) {
      const id = ids(domain);
      if (!map.getSource(id.source)) map.addSource(id.source, { type: 'geojson', data: emptyCollection() });
      if (!map.getSource(id.leaders)) map.addSource(id.leaders, { type: 'geojson', data: emptyCollection() });
    }
    // All leaders under all dots and symbols; within each kind, ships under aircraft.
    for (const domain of DOMAINS) {
      const id = ids(domain);
      if (map.getLayer(id.leaders)) continue;
      map.addLayer({
        id: id.leaders,
        type: 'line',
        source: id.leaders,
        minzoom: SYMBOL_MIN_ZOOM,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': AFFILIATION_LINE_COLOR,
          'line-width': 1.5,
          'line-opacity': 0.7,
        },
      });
    }
    for (const domain of DOMAINS) {
      const id = ids(domain);
      if (map.getLayer(id.dots)) continue;
      map.addLayer({
        id: id.dots,
        type: 'circle',
        source: id.source,
        maxzoom: SYMBOL_MIN_ZOOM,
        paint: {
          'circle-color': AFFILIATION_LINE_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.5, SYMBOL_MIN_ZOOM, 3],
          'circle-opacity': ['case', ['==', ['get', 'stale'], 1], 0.35, 0.9],
        },
      });
    }
    for (const domain of DOMAINS) {
      const id = ids(domain);
      if (map.getLayer(id.symbols)) continue;
      map.addLayer({
        id: id.symbols,
        type: 'symbol',
        source: id.source,
        minzoom: SYMBOL_MIN_ZOOM,
        layout: {
          'icon-image': ['step', ['zoom'], ['get', 'icon'], LABEL_MIN_ZOOM, ['get', 'iconLabeled']],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Higher keys draw on top: the selected track over the rest of its layer.
          'symbol-sort-key': ['get', 'sortKey'],
        },
        paint: {
          'icon-opacity': ['case', ['==', ['get', 'stale'], 1], 0.4, 1],
        },
      });
    }
    for (const domain of DOMAINS) this.render(domain);
    this.notifyFrame();
  }

  private resolveImage(id: string): void {
    const parsed = parseSymbolImageId(id);
    if (!parsed || this.map.hasImage(id)) return;
    const rendered = renderSymbol(parsed.sidc, parsed.label, Math.min(window.devicePixelRatio || 1, 3));
    if (rendered) this.map.addImage(id, rendered.image, { pixelRatio: rendered.pixelRatio });
  }

  private bindInteraction(): void {
    const map = this.map;
    const layers = DOMAINS.flatMap((d) => [ids(d).symbols, ids(d).dots]);
    map.on('click', (event) => {
      if (!layers.every((layer) => map.getLayer(layer))) return;
      const { x, y } = event.point;
      const pad = 6; // forgiving hit area, especially on touch screens
      const hits = map.queryRenderedFeatures(
        [
          [x - pad, y - pad],
          [x + pad, y + pad],
        ],
        { layers },
      );
      // Prefer whatever is drawn on top.
      hits.sort((a, b) => Number(b.properties.sortKey) - Number(a.properties.sortKey));
      const id = hits[0]?.properties.id;
      this.selection.select(typeof id === 'string' ? id : null);
    });
    for (const layer of layers) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }
  }

  private readonly loop = (time: number): void => {
    requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const zoom = this.map.getZoom();
    const lat = this.map.getCenter().lat;
    let rendered = false;
    for (const domain of DOMAINS) {
      if (!this.forced[domain] && time - this.lastRender[domain] < renderIntervalMs(zoom, lat, domain)) continue;
      this.lastRender[domain] = time;
      this.forced[domain] = false;
      this.render(domain);
      rendered = true;
    }
    if (rendered) this.notifyFrame();
  };

  private notifyFrame(): void {
    for (const listener of this.frameListeners) listener();
  }

  /** Dead-reckon one domain's tracks and hand them to its sources. */
  private render(domain: Domain): void {
    const now = this.clock.now();
    const positions = this.positions[domain];
    const selectedId = this.selection.id;
    const points: Feature<Point>[] = [];
    const leaders: Feature<LineString>[] = [];
    const seen = new Set<string>();
    // Leaders aren't drawn below the symbol zoom, so don't compute thousands of them.
    const zoom = this.map.getZoom();
    const withLeaders = zoom >= SYMBOL_MIN_ZOOM;
    const withIcons = zoom >= ICON_PROPS_MIN_ZOOM;
    const view = this.viewBox();

    for (const track of this.store.all()) {
      if (track.domain !== domain) continue;
      const rule = ruleFor(track, this.store.staleness);
      const age = now - track.observedAt;
      const stale = age > rule.staleAfterMs;
      // Dead-reckon up to the stale threshold, then hold the last estimate.
      const pos = deadReckon(track, track.courseDeg, track.speedMps, Math.min(age, rule.staleAfterMs));
      positions.set(track.id, { lat: pos.lat, lon: pos.lon, stale });
      seen.add(track.id);
      // Everything gets a position (reticle, follow, details); only what's near the screen gets a feature.
      // The selected track stays drawn even if the filter would hide it.
      if (track.id !== selectedId && (!this.filter.passes(track, stale) || !inViewBox(view, pos.lon, pos.lat))) continue;

      const properties: Record<string, string | number> = {
        id: track.id,
        affiliation: track.affiliation,
        stale: stale ? 1 : 0,
        // Hit-testing compares across layers too, preferring aircraft over ships.
        sortKey: (track.id === selectedId ? 10 : 0) + (track.domain === 'air' ? 1 : 0),
      };
      if (withIcons) {
        const sidc = sidcFor(track);
        properties.icon = symbolImageId(sidc);
        properties.iconLabeled = track.callsign ? symbolImageId(sidc, track.callsign) : properties.icon;
      }
      points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] }, properties });

      if (withLeaders && !stale && track.speedMps > 0.5) {
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

    for (const id of positions.keys()) {
      if (!seen.has(id)) positions.delete(id);
    }

    const id = ids(domain);
    const trackSource = this.map.getSource<GeoJSONSource>(id.source);
    const leaderSource = this.map.getSource<GeoJSONSource>(id.leaders);
    if (trackSource && leaderSource) {
      trackSource.setData({ type: 'FeatureCollection', features: points });
      leaderSource.setData({ type: 'FeatureCollection', features: leaders });
    }
  }
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
