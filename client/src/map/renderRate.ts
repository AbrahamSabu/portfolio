import type { Domain } from '@watchfloor/shared';

/**
 * How often dead-reckoned positions need recomputing at a given zoom.
 *
 * Redrawing is only worth it when something could visibly move. At zoom 2 one
 * pixel is about 20 km, so even a fast jet takes over a minute to cross it, and
 * redrawing 7,000 aircraft ten times a second there is pure waste. Zoomed in to
 * a harbour, the same jet crosses a pixel in a fraction of a frame. So the
 * interval is set by the fastest plausible track moving half a pixel, within a
 * floor (smooth motion) and a ceiling (the picture never feels frozen).
 *
 * Aircraft and ships are paced apart. A ship at 25 m/s takes about 20 minutes
 * to cross a pixel at world zoom, so redrawing 25,000 of them every second
 * there (measured, Oct 2026) was most of the main thread's work for nothing
 * anyone could see. Aircraft keep a 1 s ceiling; ships may wait up to 5 s.
 */
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
/** MapLibre's world is 512 px wide at zoom 0. */
const WORLD_PX_AT_ZOOM_0 = 512;
const MAX_PIXEL_STEP = 0.5;
export const MIN_RENDER_INTERVAL_MS = 100;

/** Per domain: the fastest plausible track (the worst case) and the longest wait between redraws. */
export const PACE: Record<Domain, { fastestMps: number; maxIntervalMs: number }> = {
  air: { fastestMps: 300, maxIntervalMs: 1000 }, // a fast jet
  sea: { fastestMps: 25, maxIntervalMs: 5000 }, // about 50 knots: fast ferries, patrol boats
};

/** Ground metres per screen pixel (Web Mercator) at a zoom and latitude. */
export function metresPerPixel(zoom: number, latDeg: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((latDeg * Math.PI) / 180)) / (WORLD_PX_AT_ZOOM_0 * 2 ** zoom);
}

/** A whole-picture slowdown: the screensaver sets 2 (one-pixel steps, halved ceilings' pace). */
let paceScale = 1;

export function setPaceScale(scale: number): void {
  paceScale = scale;
}

export function renderIntervalMs(zoom: number, latDeg: number, domain: Domain = 'air'): number {
  const { fastestMps, maxIntervalMs } = PACE[domain];
  const ms = ((metresPerPixel(zoom, latDeg) * MAX_PIXEL_STEP) / fastestMps) * 1000;
  return paceScale * Math.min(maxIntervalMs, Math.max(MIN_RENDER_INTERVAL_MS, ms));
}
