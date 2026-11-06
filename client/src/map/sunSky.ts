import { bearingDeg } from '@watchfloor/shared';
import { solarElevation, subsolarPoint } from './sun';

/** Where the sun stands for someone at a place: height above the horizon, and compass direction. */
export interface SunAt {
  elevationDeg: number;
  azimuthDeg: number;
}

/** The sun as seen from a place at a moment (the same Almanac sun as the day/night shading). */
export function sunAt(timeMs: number, lat: number, lon: number): SunAt {
  const sun = subsolarPoint(timeMs);
  // The sun lies along the great circle towards the point where it's overhead.
  return { elevationDeg: solarElevation(sun, lat, lon), azimuthDeg: bearingDeg({ lat, lon }, sun) };
}

type Rgb = readonly [number, number, number];

/**
 * Sky and horizon colours by the sun's elevation (°). Night is the app's own
 * space navy; dusk goes violet-rose low down; sunrise and sunset get a pale
 * peach horizon, never amber (amber means an emergency here); day is blue.
 */
const KEYS: ReadonlyArray<readonly [elevation: number, sky: Rgb, horizon: Rgb]> = [
  [-18, [1, 5, 11], [7, 20, 38]],
  [-10, [3, 11, 24], [16, 32, 58]],
  [-5, [12, 26, 56], [52, 56, 96]],
  [-1, [28, 46, 92], [128, 106, 134]],
  [3, [52, 92, 152], [214, 168, 146]],
  [12, [58, 118, 190], [170, 202, 232]],
  [30, [44, 110, 196], [188, 216, 240]],
];

const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as unknown as Rgb;

/** Colours between the keyframes, blended linearly by elevation. */
function colorsAt(elevation: number): { sky: Rgb; horizon: Rgb } {
  const first = KEYS[0]!;
  const last = KEYS[KEYS.length - 1]!;
  if (elevation <= first[0]) return { sky: first[1], horizon: first[2] };
  if (elevation >= last[0]) return { sky: last[1], horizon: last[2] };
  for (let i = 1; i < KEYS.length; i++) {
    const [e1, sky1, horizon1] = KEYS[i]!;
    if (elevation > e1) continue;
    const [e0, sky0, horizon0] = KEYS[i - 1]!;
    const t = (elevation - e0) / (e1 - e0);
    return { sky: mix(sky0, sky1, t), horizon: mix(horizon0, horizon1, t) };
  }
  return { sky: last[1], horizon: last[2] };
}

export interface SkyLook {
  sky: { 'sky-color': string; 'horizon-color': string; 'fog-color': string; 'sky-horizon-blend': number; 'horizon-fog-blend': number; 'fog-ground-blend': number };
  /** MapLibre light: anchored to the map, so its azimuth is a compass bearing. Polar 0° is overhead. */
  light: { anchor: 'map'; position: [number, number, number]; color: string; intensity: number };
  /** Hillshade lit from the sun: where it is, how high, and how strongly the relief shows. */
  shade: { direction: number; altitude: number; exaggeration: number; highlight: string; shadow: string };
}

/**
 * Everything Ride Along lights from the sun: sky colours, MapLibre's light,
 * and the terrain's hillshade. Below the horizon there's no sunlight to cast
 * shadows, so the relief fades to a faint, even shading.
 */
export function skyLook(sun: SunAt): SkyLook {
  const { sky, horizon } = colorsAt(sun.elevationDeg);
  // 0 in darkness, 1 once the sun is 10° up.
  const daylight = Math.min(1, Math.max(0, (sun.elevationDeg + 6) / 16));
  return {
    sky: {
      'sky-color': hex(sky),
      'horizon-color': hex(horizon),
      // Distant ground fades into the horizon's haze.
      'fog-color': hex(mix(horizon, sky, 0.35)),
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.55,
    },
    light: {
      anchor: 'map',
      position: [1.5, ((sun.azimuthDeg % 360) + 360) % 360, Math.min(90, Math.max(0, 90 - sun.elevationDeg))],
      color: '#ffffff',
      intensity: 0.15 + 0.35 * daylight,
    },
    shade: {
      direction: ((sun.azimuthDeg % 360) + 360) % 360,
      altitude: Math.min(80, Math.max(8, sun.elevationDeg)),
      exaggeration: 0.12 + 0.43 * daylight,
      highlight: `rgba(255, 248, 235, ${(0.04 + 0.3 * daylight).toFixed(3)})`,
      shadow: `rgba(0, 6, 16, ${(0.35 + 0.4 * daylight).toFixed(3)})`,
    },
  };
}
