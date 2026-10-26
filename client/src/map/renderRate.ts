/**
 * How often dead-reckoned positions need recomputing at a given zoom.
 *
 * Redrawing is only worth it when something could visibly move. At zoom 2 one
 * pixel is about 20 km, so even a fast jet takes over a minute to cross it, and
 * redrawing 7,000 aircraft ten times a second there is pure waste. Zoomed in to
 * a harbour, the same jet crosses a pixel in a fraction of a frame. So the
 * interval is set by the fastest plausible track moving half a pixel, within a
 * floor (smooth motion) and a ceiling (the picture never feels frozen).
 */
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
/** MapLibre's world is 512 px wide at zoom 0. */
const WORLD_PX_AT_ZOOM_0 = 512;
/** A fast jet. Anything slower moves less, so this is the worst case. */
export const FASTEST_TRACK_MPS = 300;
const MAX_PIXEL_STEP = 0.5;
export const MIN_RENDER_INTERVAL_MS = 100;
export const MAX_RENDER_INTERVAL_MS = 1000;

/** Ground metres per screen pixel (Web Mercator) at a zoom and latitude. */
export function metresPerPixel(zoom: number, latDeg: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((latDeg * Math.PI) / 180)) / (WORLD_PX_AT_ZOOM_0 * 2 ** zoom);
}

export function renderIntervalMs(zoom: number, latDeg: number): number {
  const ms = ((metresPerPixel(zoom, latDeg) * MAX_PIXEL_STEP) / FASTEST_TRACK_MPS) * 1000;
  return Math.min(MAX_RENDER_INTERVAL_MS, Math.max(MIN_RENDER_INTERVAL_MS, ms));
}
