import type { Map as MapLibreMap } from 'maplibre-gl';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface CameraTarget {
  center: [number, number];
  zoom?: number;
}

/**
 * The one cinematic camera move for everything that takes the view somewhere
 * (alert Show buttons, briefing picks, search, the tour): MapLibre's flyTo
 * arc, which pulls back, crosses the globe and settles, instead of a flat
 * pan that drags the world past. `slow` is the tour's pace. Reduced motion
 * cuts straight there.
 */
export function fly(map: MapLibreMap, target: CameraTarget, slow = false): void {
  const zoom = target.zoom ?? map.getZoom();
  if (reducedMotion()) {
    map.jumpTo({ center: target.center, zoom });
    return;
  }
  map.flyTo({ center: target.center, zoom, speed: slow ? 0.45 : 0.9, curve: 1.6, maxDuration: slow ? 9_000 : 5_000 });
}

/**
 * Event data the ride passes with its per-frame jumpTo. A jump fires
 * moveend, and the listeners that rebuild the picture after a finished pan
 * (track and trail layers, satellite passes, news cards) would otherwise run
 * sixty times a second for the whole ride.
 */
export const RIDE_MOVE = { ride: true } as const;

export function isRideMove(event: unknown): boolean {
  return typeof event === 'object' && event !== null && (event as { ride?: unknown }).ride === true;
}
