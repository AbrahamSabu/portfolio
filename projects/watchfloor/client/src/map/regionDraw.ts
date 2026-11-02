import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { unwrapRing } from '../state/regions';

const SOURCE = 'region-draft';
const LINE = 'region-draft-line';
const POINTS = 'region-draft-points';
/** A click this close to the first corner closes the shape. */
const CLOSE_PX = 10;
/** A double-click's two clicks land on one spot: don't make two corners of it. */
const SAME_PX = 6;

let drawing = false;

/**
 * Whether an area is being drawn. Clicks then place corners, so the map's
 * other click handlers (select a track, open a news card or an airport)
 * stand down while it's true.
 */
export function isDrawing(): boolean {
  return drawing;
}

/**
 * Drawing a watch area: click to place corners, a click on the first corner,
 * a double-click or Enter to finish (three corners at least), Backspace to
 * take the last one back, Escape to give up. The map still pans and zooms
 * while drawing. A hint bar says all of this while it's on.
 */
export class RegionDraw {
  private corners: [number, number][] = [];
  private cursor: [number, number] | null = null;
  private readonly hint: HTMLElement;
  private onDone: ((ring: [number, number][]) => void) | null = null;

  constructor(private readonly map: MapLibreMap) {
    this.hint = document.createElement('div');
    this.hint.className = 'draw-hint';
    this.hint.hidden = true;
    this.hint.setAttribute('role', 'status');
    this.hint.textContent = 'Click to place corners · click the first corner, double-click or Enter to finish · Backspace undoes · Esc cancels';
    map.getContainer().append(this.hint);
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    map.on('click', (e) => this.click(e));
    map.on('dblclick', (e) => {
      if (!drawing) return;
      e.preventDefault();
      this.finish();
    });
    map.on('mousemove', (e) => {
      if (!drawing) return;
      this.cursor = [e.lngLat.lng, e.lngLat.lat];
      this.render();
    });
    // Capture phase, so these keys don't also reach the page's own shortcuts.
    document.addEventListener(
      'keydown',
      (event) => {
        if (!drawing) return;
        if (event.key === 'Escape') this.stop();
        else if (event.key === 'Enter') this.finish();
        else if (event.key === 'Backspace') {
          this.corners.pop();
          this.render();
        } else return;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
  }

  get active(): boolean {
    return drawing;
  }

  /** Start drawing; `onDone` gets the corners when the shape is finished. */
  start(onDone: (ring: [number, number][]) => void): void {
    this.corners = [];
    this.cursor = null;
    this.onDone = onDone;
    drawing = true;
    this.hint.hidden = false;
    this.map.getCanvas().style.cursor = 'crosshair';
    this.render();
  }

  stop(): void {
    drawing = false;
    this.corners = [];
    this.cursor = null;
    this.onDone = null;
    this.hint.hidden = true;
    this.map.getCanvas().style.cursor = '';
    this.render();
  }

  private click(e: MapMouseEvent): void {
    if (!drawing) return;
    const lngLat = e.lngLat.wrap();
    const first = this.corners[0];
    if (first && this.corners.length >= 3 && this.screenDistance(first, e.point) < CLOSE_PX) return this.finish();
    const last = this.corners.at(-1);
    if (last && this.screenDistance(last, e.point) < SAME_PX) return;
    this.corners.push([round(lngLat.lng), round(lngLat.lat)]);
    this.render();
  }

  private finish(): void {
    if (this.corners.length < 3) return;
    const ring = this.corners;
    const done = this.onDone;
    this.stop();
    done?.(ring);
  }

  private screenDistance(corner: [number, number], point: { x: number; y: number }): number {
    const p = this.map.project(corner);
    return Math.hypot(p.x - point.x, p.y - point.y);
  }

  private install(): void {
    const map = this.map;
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: LINE, type: 'line', source: SOURCE, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#a8e6ff', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
    map.addLayer({
      id: POINTS,
      type: 'circle',
      source: SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 4, 'circle-color': '#06121f', 'circle-stroke-color': '#a8e6ff', 'circle-stroke-width': 1.5 },
    });
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const path = unwrapRing(this.cursor ? [...this.corners, this.cursor] : this.corners);
    const features: Feature<LineString | Point>[] = this.corners.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
    if (path.length >= 2) {
      // Back to the first corner too, so the shape reads as closed while drawing.
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.length >= 3 ? [...path, path[0]!] : path } });
    }
    const data: FeatureCollection<LineString | Point> = { type: 'FeatureCollection', features };
    source.setData(data);
  }
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;
