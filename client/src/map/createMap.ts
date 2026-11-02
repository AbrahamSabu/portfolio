import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
// MapLibre finds its web worker relative to its own file, which breaks once a
// bundler moves things around. Importing the worker as a URL makes Vite ship it
// and tells us exactly where it ended up.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { applyHoloBasemap } from './holoBasemap';

setWorkerUrl(workerUrl);

const DEFAULT_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** No basemap at all: used offline, or if the basemap can't be reached. */
export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#04111F' } }],
};

export interface MapSetup {
  map: MapLibreMap;
  /** True once the operator has moved the map, so automatic framing stops. */
  userHasMoved: () => boolean;
}

/**
 * A north-up tactical map, drawn as a globe when zoomed out. Rotation and pitch are disabled: operators
 * expect north at the top, and a tilted COP makes distances hard to judge.
 */
export function createMap(container: HTMLElement, options: { pixelRatio?: number } = {}): MapSetup {
  const configured = import.meta.env.VITE_MAP_STYLE_URL;
  const style = configured === 'offline' ? OFFLINE_STYLE : configured || DEFAULT_STYLE;

  const map = new MapLibreMap({
    container,
    style,
    // The screensaver passes 1: on a scaled-up display that's half the
    // pixels or fewer for a picture watched from across the room.
    ...(options.pixelRatio ? { pixelRatio: options.pixelRatio } : {}),
    center: [-0.85, 50.45],
    zoom: 6.5,
    // Low enough to pull back and see the whole globe.
    minZoom: 0.5,
    maxZoom: 16,
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // Top-left keeps the right side clear for the details panel.
  map.addControl(new NavigationControl({ showCompass: false }), 'top-left');

  // If the basemap style itself can't load (offline, blocked), fall back to a
  // plain background so tracks still draw. Tile errors after load are ignored.
  let styleLoaded = false;
  let fellBack = style === OFFLINE_STYLE;
  map.once('style.load', () => (styleLoaded = true));
  // First, so it runs before the track layers are added on the same event.
  map.on('style.load', () => {
    // A globe: zoomed out it's a sphere, and MapLibre flattens it into the
    // usual map as you zoom in (fully flat by about zoom 12). Set on every
    // style load, since a style carries its own projection.
    map.setProjection({ type: 'globe' });
    applyHoloBasemap(map);
  });
  map.on('error', (event) => {
    if (styleLoaded || fellBack) return;
    fellBack = true;
    console.warn('Basemap unavailable, continuing without it:', event.error?.message);
    map.setStyle(OFFLINE_STYLE);
  });

  let moved = false;
  for (const type of ['dragstart', 'wheel', 'touchstart', 'boxzoomstart'] as const) {
    map.on(type, () => (moved = true));
  }

  return { map, userHasMoved: () => moved };
}
