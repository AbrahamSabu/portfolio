import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * The map is north-up and flat on purpose (createMap.ts): operators expect
 * north at the top, and a tilted picture makes distances hard to judge. The
 * 3D modes lift that lock only while they're on, and `relockCamera` puts back
 * exactly what createMap set. Keep the two in step.
 */
export function unlockCamera(map: MapLibreMap, maxPitch: number): void {
  map.setMaxPitch(maxPitch);
  // Right-drag (or Ctrl-drag) turns the map; with createMap's pitchWithRotate
  // off it doesn't tilt it, which Shift + arrow keys and two fingers do.
  map.dragRotate.enable();
  map.touchPitch.enable();
  map.touchZoomRotate.enableRotation();
  map.keyboard.enableRotation();
}

/** createMap's lock: no pitch, and no turning by mouse, touch or keyboard. */
export function relockCamera(map: MapLibreMap): void {
  map.setMaxPitch(0);
  map.dragRotate.disable();
  map.touchPitch.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
}

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
