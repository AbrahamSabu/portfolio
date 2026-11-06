/**
 * Where the layer's shader puts a satellite on screen, worked out again on
 * the CPU for clicks and hovering. It mirrors MapLibre's own globe shader
 * (`projectToSphere` and `interpolateProjectionFor3D` in its prelude) with
 * the matrices of the last frame drawn, so what you click is what you see.
 */

/** MapLibre's planet: a sphere of this radius (its shaders' GLOBE_RADIUS), metres. */
export const GLOBE_RADIUS_M = 6_371_008.8;

export type Vec3 = [number, number, number];

/** What one frame was drawn with. Matrices are column-major 4×4. */
export interface FrameProjection {
  /** Globe shader variant (else plain Mercator). */
  globe: boolean;
  main: ArrayLike<number>;
  fallback: ArrayLike<number>;
  /** 1 = globe, 0 = flat Mercator; MapLibre blends between them as you zoom in. */
  transition: number;
  /** The horizon plane on the unit sphere: points with dot(p, n) + w < 0 are round the back. */
  clippingPlane: [number, number, number, number];
  /** The camera, in the unit sphere's frame (globe only). */
  camera: Vec3 | null;
  /** The canvas in CSS pixels. */
  width: number;
  height: number;
}

/** A Mercator position (0..1) on MapLibre's unit sphere, exactly as its shader does it. */
export function sphereOf(mx: number, my: number): Vec3 {
  const sx = mx * Math.PI * 2 + Math.PI;
  const t = Math.exp(Math.PI - my * Math.PI * 2);
  const t2 = t * t;
  const sinLat = (t2 - 1) / (t2 + 1);
  const cosLat = (2 * t) / (t2 + 1);
  return [Math.sin(sx) * cosLat, sinLat, Math.cos(sx) * cosLat];
}

function transform(m: ArrayLike<number>, x: number, y: number, z: number, w: number): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]! * w,
  ];
}

/**
 * The camera's position from a perspective view-projection matrix: the one
 * point it sends to clip x = y = w = 0. Three equations (rows 0, 1 and 3),
 * solved by Cramer's rule.
 */
export function cameraFromMatrix(m: ArrayLike<number>): Vec3 | null {
  const row = (r: number) => [m[r]!, m[4 + r]!, m[8 + r]!, m[12 + r]!] as const;
  const [a, b, c] = [row(0), row(1), row(3)];
  const det3 = (p: readonly number[], q: readonly number[], r: readonly number[]) =>
    p[0]! * (q[1]! * r[2]! - q[2]! * r[1]!) - p[1]! * (q[0]! * r[2]! - q[2]! * r[0]!) + p[2]! * (q[0]! * r[1]! - q[1]! * r[0]!);
  const d = det3(a, b, c);
  if (Math.abs(d) < 1e-20) return null;
  const rhs = [-a[3], -b[3], -c[3]];
  // Cramer: each unknown is the determinant with its column swapped for the right-hand side.
  const withRhs = (k: number) => {
    const rows = [a, b, c].map((r, i) => [0, 1, 2].map((j) => (j === k ? rhs[i]! : r[j]!)));
    return det3(rows[0]!, rows[1]!, rows[2]!);
  };
  return [withRhs(0) / d, withRhs(1) / d, withRhs(2) / d];
}

/**
 * Hidden behind the planet? A point above the surface can peek over the
 * horizon, so this asks whether the line from the camera meets the unit
 * sphere before reaching the point.
 */
export function behindPlanet(p: Vec3, camera: Vec3): boolean {
  const d: Vec3 = [p[0] - camera[0], p[1] - camera[1], p[2] - camera[2]];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const b = 2 * (camera[0] * d[0] + camera[1] * d[1] + camera[2] * d[2]);
  const c = camera[0] ** 2 + camera[1] ** 2 + camera[2] ** 2 - 1;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 && t < 0.9999;
}

/** A satellite's screen position in CSS pixels, or null when it isn't on screen or is round the back. */
export function projectSatellite(mx: number, my: number, elevationM: number, f: FrameProjection): { x: number; y: number } | null {
  let clip: [number, number, number, number];
  if (f.globe) {
    const surface = sphereOf(mx, my);
    const scale = 1 + elevationM / GLOBE_RADIUS_M;
    const p: Vec3 = [surface[0] * scale, surface[1] * scale, surface[2] * scale];
    if (elevationM > 0 && f.camera) {
      if (behindPlanet(p, f.camera)) return null;
    } else {
      const [nx, ny, nz, w] = f.clippingPlane;
      if (surface[0] * nx + surface[1] * ny + surface[2] * nz + w < 0) return null;
    }
    clip = transform(f.main, p[0], p[1], p[2], 1);
    if (f.transition < 0.999) {
      const flat = transform(f.fallback, mx, my, elevationM, 1);
      clip = clip.map((v, i) => flat[i]! + (v - flat[i]!) * f.transition) as typeof clip;
    }
  } else {
    clip = transform(f.main, mx, my, elevationM, 1);
  }
  if (clip[3] <= 0) return null;
  const nx = clip[0] / clip[3];
  const ny = clip[1] / clip[3];
  if (Math.abs(nx) > 1.2 || Math.abs(ny) > 1.2) return null;
  return { x: ((nx + 1) / 2) * f.width, y: ((1 - ny) / 2) * f.height };
}
