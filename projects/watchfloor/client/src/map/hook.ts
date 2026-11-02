import type { Feature, LineString } from 'geojson';
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { approach, type Track } from '@watchfloor/shared';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatCourse, formatDuration, formatSpeed } from '../ui/format';
import type { TrackLayer } from './trackLayer';

const SOURCE = 'hook';
const LAYER = 'hook';

/** While arming, map clicks hook instead of selecting: TrackLayer stands down, like it does for drawing. */
let arming = false;
export const isHooking = (): boolean => arming;

/**
 * The hook (X): pick a second track from the selected one and read the pair
 * like a CIC console would — range, true bearing, closing speed and the
 * closest point of approach on present courses. A dashed HUD line joins the
 * pair with the readout at its middle, dead-reckoned like everything else.
 * X arms it, the next click on a track completes it, X or Escape clears it;
 * losing either track clears it too.
 */
export class HookTool {
  private pair: [string, string] | null = null;
  private label: Marker | null = null;
  private readonly el = document.createElement('div');
  private lastText = 0;
  private styleReady: boolean;

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
    private readonly selection: Selection,
  ) {
    this.el.className = 'hook-label';
    this.styleReady = map.isStyleLoaded() === true;
    map.on('styledataloading', () => (this.styleReady = false));
    map.on('style.load', () => {
      this.styleReady = true;
      this.install();
    });
    this.install();
    map.on('click', (event) => {
      if (!arming) return;
      const id = this.layer.trackAt(event.point);
      if (id && id !== this.selection.id) this.hook(id);
    });
    layer.onFrame(() => this.update());
    // A hook to a track that left the picture answers nothing: let it go.
    store.subscribe(() => {
      if (this.pair && (!store.get(this.pair[0]) || !store.get(this.pair[1]))) this.clear();
    });
  }

  get armed(): boolean {
    return arming;
  }

  get active(): boolean {
    return this.pair !== null;
  }

  /** The X key: arm from a selection, else clear whatever the hook holds. */
  toggle(): void {
    if (this.pair || arming) this.clear();
    else if (this.selection.id) {
      arming = true;
      this.map.getCanvas().style.cursor = 'crosshair';
    }
  }

  clear(): void {
    arming = false;
    this.map.getCanvas().style.cursor = '';
    this.pair = null;
    this.label?.remove();
    this.label = null;
    this.setLine([]);
  }

  private hook(id: string): void {
    if (!this.selection.id) return;
    this.pair = [this.selection.id, id];
    arming = false;
    this.map.getCanvas().style.cursor = '';
    this.update(true);
  }

  private install(): void {
    if (!this.styleReady) return;
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer(LAYER)) {
      map.addLayer({
        id: LAYER,
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': '#3FB6FF', 'line-width': 1.25, 'line-dasharray': [3, 2], 'line-opacity': 0.9 },
      });
    }
  }

  private setLine(coordinates: number[][]): void {
    const features: Feature<LineString>[] =
      coordinates.length < 2 ? [] : [{ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }];
    this.map.getSource<GeoJSONSource>(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }

  private update(force = false): void {
    if (!this.pair) return;
    const [aId, bId] = this.pair;
    const a = this.store.get(aId);
    const b = this.store.get(bId);
    const aPos = this.layer.positionOf(aId) ?? a;
    const bPos = this.layer.positionOf(bId) ?? b;
    if (!a || !b || !aPos || !bPos) return;
    this.setLine([
      [aPos.lon, aPos.lat],
      [bPos.lon, bPos.lat],
    ]);
    // Short ranges only, so the flat midpoint is fine.
    const mid: [number, number] = [(aPos.lon + bPos.lon) / 2, (aPos.lat + bPos.lat) / 2];
    if (!this.label) this.label = new Marker({ element: this.el, opacityWhenCovered: '0', offset: [0, -16] }).setLngLat(mid).addTo(this.map);
    else this.label.setLngLat(mid);
    const now = this.clock.now();
    if (!force && now - this.lastText < 1_000) return;
    this.lastText = now;
    this.el.textContent = readout(moving(a, aPos), moving(b, bPos));
  }
}

const moving = (track: Track, pos: { lon: number; lat: number }) => ({
  lat: pos.lat,
  lon: pos.lon,
  courseDeg: track.courseDeg,
  speedMps: track.speedMps,
});

/** "27.4 km · 087° · closing 18 kn · CPA 1.2 km in 24 min", or "opening" past the closest point. */
function readout(a: Parameters<typeof approach>[0], b: Parameters<typeof approach>[1]): string {
  const r = approach(a, b);
  const range = r.rangeM >= 10_000 ? `${(r.rangeM / 1000).toFixed(0)} km` : `${(r.rangeM / 1000).toFixed(1)} km`;
  const head = `${range} · ${formatCourse(r.bearingDeg)}`;
  if (r.closingMps <= 0.1 || r.tcpaS <= 0) return `${head} · opening`;
  return `${head} · closing ${formatSpeed(r.closingMps)} · CPA ${(r.cpaM / 1000).toFixed(1)} km in ${formatDuration(r.tcpaS * 1000)}`;
}
