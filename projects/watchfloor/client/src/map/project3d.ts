/**
 * The arithmetic behind the 3D layer (layer3d.ts), kept pure so it can be
 * tested: Web Mercator coordinates, positions stored relative to a reference
 * point, and a CPU copy of the vertex shader's projection for hit-testing.
 */

/** MapLibre's sphere: its globe and its Mercator heights both use this radius. */
export const EARTH_RADIUS_M = 6371008.8;

const DEG = Math.PI / 180;
const MAX_LAT = 85.051129;

/** Web Mercator x in MapLibre's world units: 0 at 180° W, 1 at 180° E. */
export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

/** Web Mercator y in world units: 0 at the top (85° N), 1 at the bottom. */
export function mercatorY(lat: number): number {
  const s = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

/**
 * World units per metre of height on the flat map. MapLibre scales heights
 * with the latitude of the view's centre, so this does too.
 */
export function mercatorPerMetre(lat: number): number {
  return 1 / (2 * Math.PI * EARTH_RADIUS_M * Math.cos(lat * DEG));
}

/**
 * The point a buffer's positions are stored relative to. GPUs work in 32-bit
 * floats, which can only place a whole-world coordinate to about 2 m: enough
 * for the Stack, visible jitter when another aircraft is 500 m away in Ride
 * Along. Small offsets from a nearby reference keep millimetres.
 */
export interface MercatorRef {
  x: number;
  y: number;
}

/** The shortest way across the antimeridian: an x offset folded into [-0.5, 0.5]. */
export function wrapDx(dx: number): number {
  return dx - Math.round(dx);
}

/**
 * `m × translate(x, y, 0)` for a column-major 4×4 matrix, in 64-bit floats:
 * applying the reference point here, on the CPU, is what keeps the precision.
 */
export function translated(m: ArrayLike<number>, x: number, y: number): Float64Array {
  const out = Float64Array.from({ length: 16 }, (_, i) => m[i]!);
  for (let row = 0; row < 4; row++) out[12 + row] = m[row]! * x + m[4 + row]! * y + m[12 + row]!;
  return out;
}

/** What the last frame was drawn with, so the CPU can project exactly as the shader did. */
export interface ProjectionSnapshot {
  /** Drawn as a sphere (MapLibre's globe shader variant) rather than flat Mercator. */
  globe: boolean;
  main: ArrayLike<number>;
  fallback: ArrayLike<number>;
  /** 1 = all globe, 0 = all Mercator: MapLibre blends the two as you zoom. */
  transition: number;
  /** Heights in metres are multiplied by this: the exaggeration, times Mercator's units when flat. */
  altScale: number;
  /** The globe's horizon plane: ground on the far side of it can't be seen. */
  clippingPlane?: ArrayLike<number>;
}

/** Whether ground at this point faces the camera; always on the flat map. Mirrors the vertex shader. */
export function facesCamera(p: ProjectionSnapshot, mx: number, my: number): boolean {
  if (!p.globe || !p.clippingPlane || p.transition <= 0.5) return true;
  const sx = mx * Math.PI * 2 + Math.PI;
  const t = Math.exp(Math.PI - my * Math.PI * 2);
  const sinLat = (t * t - 1) / (t * t + 1);
  const cosLat = (2 * t) / (t * t + 1);
  const c = p.clippingPlane;
  return Math.sin(sx) * cosLat * c[0]! + sinLat * c[1]! + Math.cos(sx) * cosLat * c[2]! + c[3]! >= 0;
}

function transform(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]!,
  ];
}

/** Clip-space position, mirroring `projectTileFor3D` in MapLibre's globe and Mercator preludes. */
export function clipPosition(p: ProjectionSnapshot, mx: number, my: number, altM: number): [number, number, number, number] {
  const elevation = altM * p.altScale;
  if (!p.globe) return transform(p.main, mx, my, elevation);
  const sx = mx * Math.PI * 2 + Math.PI;
  const t = Math.exp(Math.PI - my * Math.PI * 2);
  const sinLat = (t * t - 1) / (t * t + 1);
  const cosLat = (2 * t) / (t * t + 1);
  const k = 1 + elevation / EARTH_RADIUS_M;
  const globe = transform(p.main, Math.sin(sx) * cosLat * k, sinLat * k, Math.cos(sx) * cosLat * k);
  if (p.transition > 0.999) return globe;
  const flat = transform(p.fallback, mx, my, elevation);
  return globe.map((g, i) => flat[i]! + (g - flat[i]!) * p.transition) as [number, number, number, number];
}

/** Where a point at a height lands on screen (CSS pixels), or null if it's behind the camera. */
export function projectPoint(
  p: ProjectionSnapshot,
  mx: number,
  my: number,
  altM: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!facesCamera(p, mx, my)) return null;
  const [x, y, , w] = clipPosition(p, mx, my, altM);
  if (w <= 0) return null;
  return { x: ((x / w + 1) / 2) * width, y: ((1 - y / w) / 2) * height };
}
