/**
 * A software renderer, so the scene can be looked at.
 *
 * The preview pane in this setup will not composite a WebGL frame — the canvas
 * sizes, the page runs, and every screenshot comes back black — so this whole
 * mechanism has been built without anyone being able to see it. Drawings in
 * plan and section got the geometry right and told us nothing about how it
 * reads: a machine can be correct in every dimension and still look like a
 * flat one that has been given thickness.
 *
 * So: z-buffer, flat shading, the same camera the scene uses, straight to PNG.
 * No WebGL, no canvas, nothing that needs a browser. Slow and completely
 * sufficient — it is a still, and stills are what was missing.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { EXPOSURE, hexToRgb, shininessFor, type Finish } from "./finish.ts";
import { GRAIN_TINT, grainAt, roughnessAt } from "./grain.ts";

export type Part = {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  finish: Finish;
};

export type Light = {
  /** direction the light travels FROM, in world space */
  dir: [number, number, number];
  colour: [number, number, number];
  intensity: number;
};

export type Scene = {
  parts: Part[];
  lights: Light[];
  ambient: number;
  /** environment: warm above, dark below \u2014 what the metals reflect */
  sky: [number, number, number];
  ground: [number, number, number];
  background: [number, number, number];
};

export type View = {
  width: number;
  height: number;
  /** camera position, world */
  from: [number, number, number];
  /** what it looks at */
  to: [number, number, number];
  fov: number;
  up?: [number, number, number];
};

/* ------------------------------------------------------------------- raster */

export function render(scene: Scene, view: View) {
  const { width: W, height: H } = view;
  const camera = new THREE.PerspectiveCamera(view.fov, W / H, 0.05, 100);
  camera.position.set(...view.from);
  camera.up.set(...(view.up ?? [0, 0, 1]));
  camera.lookAt(new THREE.Vector3(...view.to));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const viewProj = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );

  const colour = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) {
    colour[i * 3] = scene.background[0];
    colour[i * 3 + 1] = scene.background[1];
    colour[i * 3 + 2] = scene.background[2];
  }

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const v = new THREE.Vector4();

  const eye = new THREE.Vector3(...view.from);

  for (const part of scene.parts) {
    const pos = part.geometry.attributes.position;
    const uv = part.geometry.attributes.uv;
    const index = part.geometry.index;
    const count = index ? index.count : pos.count;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(part.matrix);

    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;

      a.fromBufferAttribute(pos, i0).applyMatrix4(part.matrix);
      b.fromBufferAttribute(pos, i1).applyMatrix4(part.matrix);
      c.fromBufferAttribute(pos, i2).applyMatrix4(part.matrix);

      e1.subVectors(b, a);
      e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      if (n.lengthSq() < 1e-20) continue;
      n.normalize().applyMatrix3(normalMatrix).normalize();

      /* Two-sided: an extruded profile's winding is not something to rely on,
         and a hole's cap faces the other way from the rim's. Flip the normal
         toward the eye rather than culling and losing half the part. */
      const toEye = e1.copy(eye).sub(a);
      if (n.dot(toEye) < 0) n.multiplyScalar(-1);

      /* Shaded at each corner and interpolated, not once for the whole face.
         The normal stays flat — the facets are the point, they are what makes
         a chamfer visible — but the *view* vector differs across a large
         polygon, and with it the specular. Shading a 0.52-radius disc cap from
         a single point gives its entire face one value, so a highlight that
         should be a hotspot covers the lot and the disc reads as a flat tan
         plate.

         The grain is sampled at the corners too. Per pixel would be better and
         is not worth three shading calls a fragment; at this triangle density
         the difference is invisible and the turning marks still read. */
      const uvs: [number, number][] = uv
        ? [
            [uv.getX(i0), uv.getY(i0)],
            [uv.getX(i1), uv.getY(i1)],
            [uv.getX(i2), uv.getY(i2)],
          ]
        : [
            [0, 0],
            [0, 0],
            [0, 0],
          ];

      // to clip space
      const tri: [number, number, number][] = [];
      let behind = false;
      for (const p of [a, b, c]) {
        v.set(p.x, p.y, p.z, 1).applyMatrix4(viewProj);
        if (v.w <= 0.001) { behind = true; break; }
        tri.push([
          ((v.x / v.w) * 0.5 + 0.5) * W,
          (1 - ((v.y / v.w) * 0.5 + 0.5)) * H,
          v.w, // view-space depth, linear — better for interpolation than z/w
        ]);
      }
      if (behind) continue;

      rasterise(
        tri,
        [a.clone(), b.clone(), c.clone()],
        uvs,
        n.clone(),
        part.finish,
        scene,
        eye,
        colour,
        depth,
        W,
        H,
      );
    }
  }

  return toPNG(colour, W, H);
}

/**
 * Rasterise, shading per pixel.
 *
 * Per vertex was cheaper and useless. The grain in `lib/grain.ts` puts about
 * thirty-five turning marks across a 0.5-radius face, and an extruded cap is a
 * handful of very large triangles — so sampling the grain at the corners and
 * interpolating averaged every mark away and produced a perfectly smooth
 * surface. Marks finer than the mesh have to be evaluated where they are seen.
 *
 * The normal stays flat across the triangle. That is deliberate: the facets are
 * what make a chamfer visible, and smoothing them would cost more than the
 * grain gains.
 */
function rasterise(
  tri: [number, number, number][],
  world: THREE.Vector3[],
  uvs: [number, number][],
  n: THREE.Vector3,
  finish: Finish,
  scene: Scene,
  eye: THREE.Vector3,
  colour: Float32Array,
  depth: Float32Array,
  W: number,
  H: number,
) {
  const [p0, p1, p2] = tri;
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  if (minX > maxX || minY > maxY) return;

  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (Math.abs(area) < 1e-9) return;
  const inv = 1 / area;

  const at = new THREE.Vector3();

  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) * inv;
      const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2];
      const k = y * W + x;
      if (z >= depth[k]) continue;
      depth[k] = z;

      at.set(
        w0 * world[0].x + w1 * world[1].x + w2 * world[2].x,
        w0 * world[0].y + w1 * world[1].y + w2 * world[2].y,
        w0 * world[0].z + w1 * world[1].z + w2 * world[2].z,
      );
      const u = w0 * uvs[0][0] + w1 * uvs[1][0] + w2 * uvs[2][0];
      const vv = w0 * uvs[0][1] + w1 * uvs[1][1] + w2 * uvs[2][1];

      const s = shadeFace(n, at, eye, finish, scene, [u, vv]);
      colour[k * 3] = s[0];
      colour[k * 3 + 1] = s[1];
      colour[k * 3 + 2] = s[2];
    }
  }
}

/* ------------------------------------------------------------------ shading */

/**
 * sRGB to linear.
 *
 * Not a nicety. A hex colour is a *display* value: #191a18 is 0.098 on screen
 * but only 0.0068 of actual light. Light it as though it were linear and then
 * apply the output gamma on top and every surface is brightened twice — which
 * renders a near-black bed as mid grey, washes the whole machine to one beige
 * value, and destroys the only colour in it. Everything entering the shading
 * model gets converted; only the final result is encoded back.
 */
const toLinear = (c: [number, number, number]): [number, number, number] => [
  Math.pow(c[0], 2.2),
  Math.pow(c[1], 2.2),
  Math.pow(c[2], 2.2),
];

const _refl = new THREE.Vector3();
const _view = new THREE.Vector3();
const _half = new THREE.Vector3();
const _ldir = new THREE.Vector3();

/**
 * Flat-shaded metal, near enough to judge by.
 *
 * Lambert for the diffuse, Blinn-Phong for the highlight, a two-colour
 * hemisphere for the environment and a Schlick fresnel on top. It is not what
 * three.js will draw \u2014 that is a GGX lobe against a prefiltered map \u2014 and it
 * does not need to be. What it has to get right is *where the light lands*:
 * which chamfer catches, which tooth flank goes dark, whether a brass gear
 * reads as brass beside a steel plate. Those are the decisions being made, and
 * a model that puts a highlight in the wrong place would make the stills lie
 * about all three.
 *
 * The one thing it must not do is render metal black, which is what happens if
 * you give `metalness: 1` no environment at all.
 */
function hemisphere(
  n: THREE.Vector3,
  sky: [number, number, number],
  ground: [number, number, number],
): [number, number, number] {
  const k = Math.max(0, Math.min(1, n.z * 0.5 + 0.5));
  return [
    ground[0] + (sky[0] - ground[0]) * k,
    ground[1] + (sky[1] - ground[1]) * k,
    ground[2] + (sky[2] - ground[2]) * k,
  ];
}

export function shadeFace(
  n: THREE.Vector3,
  point: THREE.Vector3,
  eye: THREE.Vector3,
  f: Finish,
  scene: Scene,
  uv: [number, number] = [0, 0],
): [number, number, number] {
  /* Grain first, because it changes the roughness and the roughness decides
     the shape of everything after it. */
  const kind = f.grain ?? "none";
  const g = grainAt(kind, uv[0], uv[1]);
  const base = toLinear(hexToRgb(f.colour));
  const tint = 1 + g * GRAIN_TINT[kind];
  const albedo: [number, number, number] = [
    base[0] * tint,
    base[1] * tint,
    base[2] * tint,
  ];
  const metal = f.metalness;
  const rough = roughnessAt(f.roughness, kind, uv[0], uv[1]);
  const shine = shininessFor(rough);

  _view.copy(eye).sub(point).normalize();
  const nDotV = Math.max(1e-4, n.dot(_view));

  /* A metal has no diffuse; a dielectric reflects 4% at normal incidence. The
     two blend by metalness, which is the whole of the metallic workflow. */
  const diffuseCol: [number, number, number] = [
    albedo[0] * (1 - metal),
    albedo[1] * (1 - metal),
    albedo[2] * (1 - metal),
  ];
  const f0: [number, number, number] = [
    0.04 + (albedo[0] - 0.04) * metal,
    0.04 + (albedo[1] - 0.04) * metal,
    0.04 + (albedo[2] - 0.04) * metal,
  ];

  /* Schlick, but roughness-aware: the grazing term climbs to (1 − roughness),
     not to 1. Plain Schlick gives every surface a mirror-bright rim at glancing
     angles, which on a matte bed seen almost edge-on means the bed becomes the
     brightest thing in the frame. A rough surface has no mirror rim to give. */
  const fres = Math.pow(1 - nDotV, 5);
  const ceil = Math.max(1 - rough, 0.04);
  const spec0: [number, number, number] = [
    f0[0] + (Math.max(ceil, f0[0]) - f0[0]) * fres,
    f0[1] + (Math.max(ceil, f0[1]) - f0[1]) * fres,
    f0[2] + (Math.max(ceil, f0[2]) - f0[2]) * fres,
  ];

  const out: [number, number, number] = [0, 0, 0];
  const sky = toLinear(scene.sky);
  const ground = toLinear(scene.ground);

  // ambient and environment
  const envDiff = hemisphere(n, sky, ground);
  _refl.copy(n).multiplyScalar(2 * nDotV).sub(_view).normalize();
  const envSpec = hemisphere(_refl, sky, ground);
  const gloss = 1 - rough;
  for (let i = 0; i < 3; i++) {
    out[i] += diffuseCol[i] * envDiff[i] * (1 + scene.ambient) * 2.2;
    out[i] += spec0[i] * envSpec[i] * (0.22 + gloss * 1.1);
  }

  for (const l of scene.lights) {
    const lc = toLinear(l.colour);
    _ldir.set(l.dir[0], l.dir[1], l.dir[2]).normalize();
    const nDotL = n.dot(_ldir);
    if (nDotL <= 0) continue;
    _half.copy(_ldir).add(_view).normalize();
    const nDotH = Math.max(0, n.dot(_half));
    const hi = Math.pow(nDotH, shine) * (shine + 8) / 25;
    for (let i = 0; i < 3; i++) {
      const e = lc[i] * l.intensity;
      out[i] += diffuseCol[i] * e * nDotL * 0.55;
      out[i] += spec0[i] * e * hi * nDotL;
    }
  }

  if (f.emissive) {
    const em = toLinear(hexToRgb(f.emissive));
    const k = f.emissiveIntensity ?? 0;
    for (let i = 0; i < 3; i++) out[i] += em[i] * k;
  }

  /* ACES-ish, so highlights roll off instead of clipping to white discs. */
  for (let i = 0; i < 3; i++) {
    const x = Math.max(0, out[i]) * EXPOSURE;
    out[i] = Math.pow(
      (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
      1 / 2.2,
    );
  }
  return out;
}

/* ---------------------------------------------------------------------- png */

function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Straight 8-bit RGB, one filter byte per scanline, deflated. */
function toPNG(colour: Float32Array, W: number, H: number) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const lin = colour[k + ch];
        raw[o++] = Math.max(0, Math.min(255, Math.round(lin * 255)));
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function write(path: URL | string, png: Buffer) {
  writeFileSync(path, png);
}

export { hexToRgb as rgb };
