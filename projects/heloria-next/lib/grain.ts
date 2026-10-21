/**
 * Surface grain: the marks a process leaves.
 *
 * A perfectly uniform roughness is the reason untextured CG metal looks like
 * plastic. Real metal carries the history of how it was made — a turned face
 * has concentric tool marks, a cast one has a pebbled skin, a ground shaft has
 * fine parallel lines — and those marks are what a raking light catches. They
 * do more for the look than the base colour does.
 *
 * ── Why this is a function and not an image ──────────────────────────────────
 *
 * Two renderers have to agree: the page uses three.js, the stills use the
 * software rasteriser. A texture file would mean one of them sampling an image
 * and the other guessing. So the grain is defined here as arithmetic, and the
 * two consume it differently — three.js bakes it into a `roughnessMap` once,
 * the rasteriser calls it per pixel — from the same source.
 *
 * ── The coordinates ──────────────────────────────────────────────────────────
 *
 * `ExtrudeGeometry` gives its caps the model's own x and y as UVs, which is
 * exactly what turning marks want: the radius is `hypot(u, v)` and the rings
 * fall where a lathe would have left them. The side walls get contour length
 * and depth instead, so the same rings arrive as fine lines along the edge —
 * which is also what a machined edge looks like. Nothing had to be unwrapped.
 */

/** Deterministic hash → [0, 1). No seeding, no state, same answer everywhere. */
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Value noise with smooth interpolation. */
function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * f, y * f) * amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return sum;
}

export type Grain = "turned" | "cast" | "ground" | "none";

/**
 * How much to add to the roughness at a point, in −1..1.
 *
 * Kept as a signed deviation rather than an absolute so a finish's own
 * roughness stays the thing that decides what it is; the grain only says how
 * consistent it is about it.
 */
export function grainAt(kind: Grain, u: number, v: number): number {
  switch (kind) {
    case "turned": {
      /* Concentric tool marks, plus a little wander so they are not a moire
         pattern. A lathe leaves a spiral, but at any believable feed rate the
         difference between a spiral and rings is invisible.

         The wander has to be a FRACTION of the ring period. The first version
         used 0.012 against a period of 0.0017, which shifts the phase by more
         than two whole rings and scrambles the pattern into noise that happens
         to contain a stripe — the variation round a circle came out as large
         as the variation along a radius, which is the opposite of concentric. */
      const FREQ = 600;
      const PERIOD = (Math.PI * 2) / FREQ;
      const r = Math.hypot(u, v);
      const wobble = (noise(u * 9, v * 9) - 0.5) * PERIOD * 0.35;
      const rings = Math.sin((r + wobble) * FREQ);
      const scuff = fbm(u * 34, v * 34, 3) - 0.5;
      return rings * 0.72 + scuff * 0.32;
    }
    case "cast": {
      /* Sand-cast skin: coarse, irregular, no direction to it at all. */
      const coarse = fbm(u * 14, v * 14, 4) - 0.5;
      const fine = fbm(u * 60, v * 60, 2) - 0.5;
      return coarse * 1.5 + fine * 0.5;
    }
    case "ground": {
      /* Surface-ground: fine parallel lines, one direction, very shallow. */
      const lines = Math.sin(v * 900 + noise(u * 4, v * 4) * 3);
      const dirt = fbm(u * 40, v * 40, 2) - 0.5;
      return lines * 0.4 + dirt * 0.5;
    }
    default:
      return 0;
  }
}

/**
 * Peak-to-peak roughness swing, per kind.
 *
 * Small on purpose. Grain that reads as grain in a still is usually far too
 * strong in motion, where the marks swim across a turning face and the part
 * stops looking solid.
 */
export const GRAIN_DEPTH: Record<Grain, number> = {
  turned: 0.05,
  cast: 0.11,
  ground: 0.055,
  none: 0,
};

/** Albedo is touched far less than roughness; metal varies in sheen, not hue. */
export const GRAIN_TINT: Record<Grain, number> = {
  turned: 0.022,
  cast: 0.055,
  ground: 0.02,
  none: 0,
};

/** Roughness at a point, clamped to something a shading model can use. */
export function roughnessAt(base: number, kind: Grain, u: number, v: number) {
  const d = grainAt(kind, u, v) * GRAIN_DEPTH[kind];
  return Math.min(0.99, Math.max(0.03, base + d));
}

/**
 * Bake the grain into a square roughness map, for three.js.
 *
 * `span` is how many model units the texture covers before it repeats — the
 * marks have to be the same size on a 0.3 flywheel and a 0.7 cross, so it is a
 * length rather than a UV scale.
 */
export function bakeRoughness(
  kind: Grain,
  base: number,
  size = 512,
  span = 1.6,
): Uint8Array {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x / size) - 0.5) * span;
      const v = ((y / size) - 0.5) * span;
      data[y * size + x] = Math.round(roughnessAt(base, kind, u, v) * 255);
    }
  }
  return data;
}
