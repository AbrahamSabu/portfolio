import type { IControl, Map as MapLibreMap, RasterTileSource } from 'maplibre-gl';
import type { StoredToggle } from '../state/storedToggle';
import { formatNewsTime } from '../ui/format';

const FRAMES_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const SOURCE = 'radar';
const LAYER = 'radar';
/** Frames are ten minutes apart; checking as often finds each new one. */
const REFRESH_MS = 10 * 60_000;
/** RainViewer's free tiles stop at zoom 7: MapLibre stretches them beyond. */
const MAX_ZOOM = 7;
/** 512 px tiles: a quarter of the requests of 256 px, inside the 100 a minute per IP. */
const TILE_PX = 512;
/** Universal Blue, the one scheme left on the free API (others answer with it anyway). Smoothed, no snow colours. */
const COLOUR = 2;
const OPTIONS = '1_0';
const ATTRIBUTION = 'Radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>';

export interface RadarFrame {
  /** When the radar picture is from (ms). */
  time: number;
  /** Tile URL template for MapLibre. */
  tiles: string;
}

/**
 * The newest past frame from RainViewer's weather-maps.json, as a tile
 * template; null if the file isn't as expected. Paths are opaque ids
 * (hashes since March 2026), so they're taken as given, checked only for
 * shape, and the host must be RainViewer's.
 */
export function latestRadarFrame(body: unknown): RadarFrame | null {
  if (typeof body !== 'object' || body === null) return null;
  const { host, radar } = body as { host?: unknown; radar?: { past?: unknown } };
  if (typeof host !== 'string' || !/^https:\/\/[a-z0-9.-]+\.rainviewer\.com$/.test(host)) return null;
  const past = Array.isArray(radar?.past) ? (radar.past as { time?: unknown; path?: unknown }[]) : [];
  const frame = past.filter((f) => typeof f?.time === 'number' && typeof f.path === 'string' && /^\/v2\/radar\/[A-Za-z0-9]+$/.test(f.path)).at(-1);
  if (!frame) return null;
  return { time: (frame.time as number) * 1000, tiles: `${host}${frame.path as string}/${TILE_PX}/{z}/{x}/{y}/${COLOUR}/${OPTIONS}.png` };
}

/**
 * Weather radar from RainViewer (free for personal use, credited on the
 * map): the latest frame only, never animated (thirteen frames would be
 * thirteen times the tile requests). Drawn in grey, not RainViewer's
 * colours: their blue-green-yellow-red scale would read as identity
 * colours on a map where colour means friend or foe; the terms allow
 * recolouring. Under the basemap's labels and everything of ours. Off by
 * default: R or the cloud button.
 */
export class RadarLayer {
  private frame: RadarFrame | null = null;
  private timer: number | undefined;
  private readonly listeners = new Set<() => void>();
  /**
   * Tracked from the style's own events, as DataCredits does: a frame
   * arrives at any time, and map.isStyleLoaded() is false whenever tiles
   * are loading, which would skip the install for good.
   */
  private styleReady: boolean;

  constructor(
    private readonly map: MapLibreMap,
    private readonly shown: StoredToggle,
  ) {
    this.styleReady = map.isStyleLoaded() === true;
    map.on('styledataloading', () => (this.styleReady = false));
    map.on('style.load', () => {
      this.styleReady = true;
      this.install();
    });
    shown.subscribe(() => this.apply());
    this.apply();
  }

  /** The time of the frame on the map, for the button's title. */
  get frameTime(): number | null {
    return this.frame?.time ?? null;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private apply(): void {
    window.clearInterval(this.timer);
    if (this.shown.value) {
      void this.refresh();
      this.timer = window.setInterval(() => void this.refresh(), REFRESH_MS);
    }
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', this.shown.value ? 'visible' : 'none');
    for (const listener of this.listeners) listener();
  }

  /** Only while shown: a hidden radar costs RainViewer nothing. */
  private async refresh(): Promise<void> {
    try {
      const res = await fetch(FRAMES_URL);
      if (!res.ok) return;
      const frame = latestRadarFrame(await res.json());
      if (!frame || frame.tiles === this.frame?.tiles) return;
      this.frame = frame;
      this.install();
      for (const listener of this.listeners) listener();
    } catch {
      // No radar is a drier-looking map, not a broken one.
    }
  }

  private install(): void {
    const map = this.map;
    if (!this.frame || !this.styleReady) return;
    const source = map.getSource<RasterTileSource>(SOURCE);
    if (source) {
      source.setTiles([this.frame.tiles]);
      return;
    }
    map.addSource(SOURCE, { type: 'raster', tiles: [this.frame.tiles], tileSize: TILE_PX, maxzoom: MAX_ZOOM, attribution: ATTRIBUTION });
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(
      {
        id: LAYER,
        type: 'raster',
        source: SOURCE,
        layout: { visibility: this.shown.value ? 'visible' : 'none' },
        paint: { 'raster-saturation': -1, 'raster-opacity': 0.55, 'raster-brightness-min': 0.15, 'raster-fade-duration': 0 },
      },
      firstSymbol,
    );
  }
}

/** A cloud button under the watch-area one: radar on or off (R). */
export class RadarControl implements IControl {
  private button: HTMLButtonElement | null = null;

  constructor(
    private readonly radar: RadarLayer,
    private readonly shown: StoredToggle,
  ) {
    radar.onChange(() => this.update());
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5a2.7 2.7 0 0 1 .3-5.4 3.6 3.6 0 0 1 6.9 1.1 2.2 2.2 0 0 1-.2 4.3z"/><path d="M6 12.5l-.6 1.2M9 12.5l-.6 1.2"/></svg>';
    button.addEventListener('click', () => this.shown.toggle());
    container.append(button);
    this.button = button;
    this.update();
    return container;
  }

  onRemove(): void {
    this.button?.parentElement?.remove();
    this.button = null;
  }

  private update(): void {
    const button = this.button;
    if (!button) return;
    const time = this.radar.frameTime;
    const label = this.shown.value ? `Weather radar${time ? `, ${formatNewsTime(time)}` : ''}` : 'Weather radar (off)';
    button.title = `${label} (R)`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(this.shown.value));
  }
}
