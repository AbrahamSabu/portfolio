import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { mercatorPerMetre, translated, wrapDx, type MercatorRef, type ProjectionSnapshot } from './project3d';

/**
 * Coloured dots and lines at a height above the map: the one piece of WebGL
 * behind the Stack and Ride Along.
 *
 * Why a MapLibre custom layer: MapLibre's own layers are flat (they ignore
 * altitude), and its one 3D shape, fill-extrusion, can only stand prisms on
 * the ground, with every update copied through the GeoJSON worker (already
 * the app's biggest cost). deck.gl or three.js could do it, as large new
 * dependencies. A custom layer borrows MapLibre's own projection code (its
 * shader "prelude"), so the same buffer draws correctly on the globe, on the
 * flat map and in the blend between them as you zoom, and positions go
 * straight into a GPU buffer: one draw call per batch, no worker.
 *
 * Positions are stored relative to a reference point (see `MercatorRef`), and
 * the reference is folded into the matrix on the CPU in 64-bit floats.
 */

/** Per vertex: x, y (Mercator offset from the batch's reference), height (m), r, g, b, a, size (CSS px), look. */
export const FLOATS_PER_VERTEX = 9;

/** How a point is drawn: a dot, a dot ringed in the selection orchid, or a light (white-hot core, soft glow). */
export const LOOK = { dot: 0, selected: 1, light: 2 } as const;

export type Rgba = readonly [number, number, number, number];

export interface Batch {
  mode: 'lines' | 'points';
  /** May be longer than `count` vertices: only the start is drawn. */
  data: Float32Array;
  count: number;
  ref: MercatorRef;
}

/** Appends vertices to a growing buffer, relative to its reference point. */
export class VertexWriter {
  data = new Float32Array(FLOATS_PER_VERTEX * 1024);
  count = 0;

  constructor(readonly ref: MercatorRef) {}

  /** `mx`, `my` are absolute Mercator; x is folded across the antimeridian towards the reference. */
  push(mx: number, my: number, altM: number, color: Rgba, size = 0, look = 0): void {
    if ((this.count + 1) * FLOATS_PER_VERTEX > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const d = this.data;
    const o = this.count * FLOATS_PER_VERTEX;
    d[o] = wrapDx(mx - this.ref.x);
    d[o + 1] = my - this.ref.y;
    d[o + 2] = altM;
    d[o + 3] = color[0];
    d[o + 4] = color[1];
    d[o + 5] = color[2];
    d[o + 6] = color[3];
    d[o + 7] = size;
    d[o + 8] = look;
    this.count++;
  }

  batch(mode: Batch['mode']): Batch {
    return { mode, data: this.data, count: this.count, ref: this.ref };
  }
}

const ATTRIBUTES = ['a_pos', 'a_alt', 'a_color', 'a_size', 'a_look'] as const;

const vertexSource = (prelude: string, define: string) => `#version 300 es
${prelude}
${define}
in vec2 a_pos;
in float a_alt;
in vec4 a_color;
in float a_size;
in float a_look;
uniform float u_alt_scale;
uniform float u_pixel_ratio;
out vec4 v_color;
out float v_look;
void main() {
  gl_Position = projectTileFor3D(a_pos, a_alt * u_alt_scale);
  gl_PointSize = a_size * u_pixel_ratio;
  v_color = a_color;
  v_look = a_look;
#ifdef GLOBE
  // MapLibre's 3D projection doesn't clip the far side of the globe (its flat
  // layers do), so hide what stands on ground beyond the horizon.
  vec3 ground = projectToSphere(a_pos, a_pos);
  if (u_projection_transition > 0.5 && dot(ground, u_projection_clipping_plane.xyz) + u_projection_clipping_plane.w < 0.0) {
    v_color = vec4(0.0);
  }
#endif
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision mediump float;
uniform float u_points;
in vec4 v_color;
in float v_look;
out vec4 fragColor;
const vec3 ORCHID = vec3(0.788, 0.627, 1.0);
void main() {
  vec3 rgb = v_color.rgb;
  float a = 1.0;
  if (u_points > 0.5) {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0) discard;
    if (v_look > 1.5) {
      // A light: a solid core, white-hot at its centre, in a soft halo of its colour.
      float core = 1.0 - smoothstep(0.22, 0.4, r);
      a = clamp(core + pow(1.0 - r, 1.4) * 0.7, 0.0, 1.0);
      rgb = mix(rgb, vec3(1.0), (1.0 - smoothstep(0.0, 0.22, r)) * 0.5);
    } else {
      a = max(1.0 - smoothstep(0.4, 0.52, r), (1.0 - r) * 0.28);
      if (v_look > 0.5) {
        float ring = smoothstep(0.66, 0.74, r) * (1.0 - smoothstep(0.86, 0.96, r));
        rgb = mix(rgb, ORCHID, ring);
        a = max(a, ring);
      }
    }
  }
  a *= v_color.a;
  fragColor = vec4(rgb * a, a);
}`;

const UNIFORMS = [
  'u_projection_matrix',
  'u_projection_fallback_matrix',
  'u_projection_tile_mercator_coords',
  'u_projection_clipping_plane',
  'u_projection_transition',
  'u_alt_scale',
  'u_pixel_ratio',
  'u_points',
] as const;

interface Program {
  program: WebGLProgram;
  u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
}

interface Slot {
  batch: Batch | null;
  dirty: boolean;
  vao?: WebGLVertexArrayObject;
  buffer?: WebGLBuffer;
}

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`layer3d shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  ATTRIBUTES.forEach((name, i) => gl.bindAttribLocation(program, i, name));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`layer3d link: ${gl.getProgramInfoLog(program)}`);
  return program;
}

export class Layer3d implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  /** Heights are multiplied by this: the Stack's exaggeration, 1 in Ride Along. */
  exaggeration = 1;
  /** Test against the depth buffer: on over terrain, so a hill hides the lights behind it. */
  depthTest = false;

  private map?: MapLibreMap;
  private readonly programs = new Map<string, Program>();
  /** Drawn in insertion order: lines first, then points on top, is the caller's job. */
  private readonly slots = new Map<string, Slot>();
  private snapshot: ProjectionSnapshot | null = null;

  constructor(readonly id: string) {}

  /** Replace what one named batch draws. */
  set(name: string, batch: Batch | null): void {
    let slot = this.slots.get(name);
    if (!slot) this.slots.set(name, (slot = { batch: null, dirty: false }));
    slot.batch = batch;
    slot.dirty = true;
    this.map?.triggerRepaint();
  }

  /** How the last frame was projected, for hit-testing on the CPU; null before the first frame. */
  get projection(): ProjectionSnapshot | null {
    return this.snapshot;
  }

  onAdd(map: MapLibreMap): void {
    this.map = map;
    // A fresh GL context (or a re-added layer) needs every buffer uploaded again.
    for (const slot of this.slots.values()) slot.dirty = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl2 = gl as WebGL2RenderingContext;
    for (const slot of this.slots.values()) {
      if (slot.vao) gl2.deleteVertexArray(slot.vao);
      if (slot.buffer) gl2.deleteBuffer(slot.buffer);
      delete slot.vao;
      delete slot.buffer;
    }
    for (const p of this.programs.values()) gl2.deleteProgram(p.program);
    this.programs.clear();
    this.snapshot = null;
    delete this.map;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const map = this.map;
    if (!map) return;
    const gl2 = gl as WebGL2RenderingContext;
    const program = this.program(gl2, args.shaderData);
    const globe = args.shaderData.define.includes('GLOBE');
    const pd = args.defaultProjectionData;
    // On the globe heights go in metres; flat, in Mercator world units.
    const altScale = this.exaggeration * (globe ? 1 : mercatorPerMetre(map.getCenter().lat));
    this.snapshot = {
      globe,
      main: pd.mainMatrix,
      fallback: pd.fallbackMatrix,
      transition: pd.projectionTransition,
      altScale,
      clippingPlane: pd.clippingPlane as ArrayLike<number>,
    };

    gl2.useProgram(program.program);
    const u = program.u;
    gl2.uniform4f(u.u_projection_clipping_plane, ...(pd.clippingPlane as unknown as [number, number, number, number]));
    gl2.uniform1f(u.u_projection_transition, pd.projectionTransition);
    gl2.uniform1f(u.u_alt_scale, altScale);
    gl2.uniform1f(u.u_pixel_ratio, map.getPixelRatio());
    gl2.enable(gl2.BLEND);
    gl2.blendFunc(gl2.ONE, gl2.ONE_MINUS_SRC_ALPHA); // the fragment shader premultiplies
    if (this.depthTest) {
      gl2.enable(gl2.DEPTH_TEST);
      gl2.depthFunc(gl2.LEQUAL);
    } else {
      gl2.disable(gl2.DEPTH_TEST);
    }
    gl2.depthMask(false); // translucent glows shouldn't hide each other

    for (const slot of this.slots.values()) {
      const batch = slot.batch;
      if (!batch || batch.count === 0) continue;
      this.upload(gl2, slot, batch);
      const { x, y } = batch.ref;
      const main = globe ? pd.mainMatrix : translated(pd.mainMatrix, x, y);
      gl2.uniformMatrix4fv(u.u_projection_matrix, false, Float32Array.from(main as ArrayLike<number>));
      gl2.uniformMatrix4fv(u.u_projection_fallback_matrix, false, Float32Array.from(translated(pd.fallbackMatrix, x, y)));
      gl2.uniform4f(u.u_projection_tile_mercator_coords, x, y, 1, 1);
      gl2.uniform1f(u.u_points, batch.mode === 'points' ? 1 : 0);
      gl2.bindVertexArray(slot.vao!);
      gl2.drawArrays(batch.mode === 'points' ? gl2.POINTS : gl2.LINES, 0, batch.count);
    }
    gl2.bindVertexArray(null);
  }

  /** One program per projection variant (globe or Mercator), compiled on first use. */
  private program(gl: WebGL2RenderingContext, shaderData: CustomRenderMethodInput['shaderData']): Program {
    const cached = this.programs.get(shaderData.variantName);
    if (cached) return cached;
    const program = compile(gl, vertexSource(shaderData.vertexShaderPrelude, shaderData.define), FRAGMENT_SOURCE);
    const u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Program['u'];
    const created = { program, u };
    this.programs.set(shaderData.variantName, created);
    return created;
  }

  private upload(gl: WebGL2RenderingContext, slot: Slot, batch: Batch): void {
    if (!slot.vao || !slot.buffer) {
      slot.vao = gl.createVertexArray()!;
      slot.buffer = gl.createBuffer()!;
      gl.bindVertexArray(slot.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, slot.buffer);
      const stride = FLOATS_PER_VERTEX * 4;
      const layout: Array<[size: number, offset: number]> = [
        [2, 0],
        [1, 8],
        [4, 12],
        [1, 28],
        [1, 32],
      ];
      layout.forEach(([size, offset], i) => {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, size, gl.FLOAT, false, stride, offset);
      });
      slot.dirty = true;
    }
    if (!slot.dirty) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.data.subarray(0, batch.count * FLOATS_PER_VERTEX), gl.DYNAMIC_DRAW);
    slot.dirty = false;
  }
}
