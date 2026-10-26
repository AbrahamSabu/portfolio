import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
// MapLibre finds its web worker relative to its own file, which breaks once a
// bundler moves things around. Importing the worker as a URL makes Vite ship it
// and tells us exactly where it ended up.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);

const DEFAULT_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** No basemap at all: used offline, or if the basemap can't be reached. */
export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0E171C' } }],
};

export interface MapSetup {
  map: MapLibreMap;
  /** True once the operator has moved the map, so automatic framing stops. */
  userHasMoved: () => boolean;
}

/**
 * A north-up tactical map. Rotation and pitch are disabled: operators
 * expect north at the top, and a tilted COP makes distances hard to judge.
 */
export function createMap(container: HTMLElement): MapSetup {
  const configured = import.meta.env.VITE_MAP_STYLE_URL;
  const style = configured === 'offline' ? OFFLINE_STYLE : configured || DEFAULT_STYLE;

  const map = new MapLibreMap({
    container,
    style,
    center: [-0.85, 50.45],
    zoom: 6.5,
    minZoom: 3,
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
