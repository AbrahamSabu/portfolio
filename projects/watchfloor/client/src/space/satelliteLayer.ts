import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { satelliteIntervalMs, shellScale, SHELL_MAX_ALTITUDE_KM } from './orbit';
import type { KeyframePair } from './keyframes';
import { cameraFromMatrix, type FrameProjection } from './projection';

export interface SatelliteLayerSource {
  /** The moment to draw: now, or the timeline's. */
  now(): number;
  /** The keyframes either side of `t` (asking the worker for more as time runs on), or null before the first arrives. */
  pairAt(t: number): KeyframePair | null;
}

/** Group colours, premultiplied in the shader. Pale and desaturated: identity colours stay the brightest things on the map. */
const VERTEX = `
precision highp float;
in vec3 a_pos0;
in vec3 a_pos1;
in float a_group;
uniform float u_t;
uniform float u_elevation_scale;
uniform float u_shell_max_km;
uniform float u_center_x;
uniform vec3 u_camera;
uniform float u_pixel_ratio;
uniform float u_zoom_dim;
uniform int u_hidden_mask;
uniform int u_mode;
out vec4 v_color;
out float v_size;
flat out int v_mode;

const vec4 COLORS[3] = vec4[3](
  vec4(0.85, 0.91, 0.97, 0.82),  // space stations
  vec4(0.62, 0.78, 0.92, 0.70),  // weather
  vec4(0.64, 0.71, 0.79, 0.50)   // Starlink
);
const float SIZES[3] = float[3](9.0, 7.0, 5.0);

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
}

void main() {
  int group = int(a_group + 0.5);
  bool selected = u_mode == 1;
  // Unplaced (decayed, bad elements), not ours to draw (a docked craft), or filtered out (the selected one always shows).
  if (group > 2 || a_pos0.x < -10.0 || a_pos1.x < -10.0 || (!selected && ((u_hidden_mask >> group) & 1) == 1)) {
    hide();
    return;
  }
  vec3 p = mix(a_pos0, a_pos1, u_t);
  // The world copy nearest the middle of the view, for the flat map near the antimeridian.
  vec2 merc = vec2(p.x + floor(u_center_x - p.x + 0.5), p.y);
  float elevation = p.z <= u_shell_max_km ? p.z * 1000.0 * u_elevation_scale : 0.0;
#ifdef GLOBE
  vec3 surface = projectToSphere(merc, merc);
  if (elevation > 0.0) {
    // Raised above the surface it can peek over the horizon: hidden only if the planet is in the way.
    vec3 point = surface * (1.0 + elevation / GLOBE_RADIUS);
    vec3 d = point - u_camera;
    float a = dot(d, d);
    float b = 2.0 * dot(u_camera, d);
    float c = dot(u_camera, u_camera) - 1.0;
    float disc = b * b - 4.0 * a * c;
    if (disc > 0.0) {
      float t = (-b - sqrt(disc)) / (2.0 * a);
      if (t > 0.0 && t < 0.9999) { hide(); return; }
    }
  } else if (dot(surface, u_projection_clipping_plane.xyz) + u_projection_clipping_plane.w < 0.0) {
    hide();
    return;
  }
#endif
  gl_Position = projectTileFor3D(merc, elevation);
  vec4 color = COLORS[group];
  color.a *= selected ? 1.0 : u_zoom_dim;
  v_color = color;
  v_size = (selected ? 22.0 : SIZES[group]) * u_pixel_ratio;
  v_mode = u_mode;
  gl_PointSize = v_size;
}
`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_size;
flat in int v_mode;
// Shared with the vertex shader, so it must be declared at the same precision.
uniform highp float u_pixel_ratio;
out vec4 fragColor;

void main() {
  // Pixels from the centre of the mark.
  vec2 p = (gl_PointCoord - 0.5) * v_size;
  float halfWidth = 0.6 * u_pixel_ratio;
  // A plus sign: aircraft are dots and ships rings when zoomed out, so space gets a shape of its own.
  float arm = (v_mode == 1 ? 4.5 * u_pixel_ratio : v_size * 0.5 - 0.5);
  float d = min(max(abs(p.x) - halfWidth, abs(p.y) - arm), max(abs(p.y) - halfWidth, abs(p.x) - arm));
  float cross = clamp(0.5 - d, 0.0, 1.0) * v_color.a;
  vec3 rgb = v_color.rgb * cross;
  float alpha = cross;
  if (v_mode == 1) {
    // The selection ring, in the accent orchid (#C9A0FF), over the mark.
    float ring = clamp(0.75 * u_pixel_ratio + 0.5 - abs(length(p) - 8.0 * u_pixel_ratio), 0.0, 1.0);
    rgb = vec3(0.788, 0.627, 1.0) * ring + rgb * (1.0 - ring);
    alpha = ring + alpha * (1.0 - ring);
  }
  if (alpha < 0.004) discard;
  fragColor = vec4(rgb, alpha);
}
`;

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

const ATTRIBUTES = ['a_pos0', 'a_pos1', 'a_group'] as const;

/**
 * Every satellite in one draw call: a MapLibre custom layer of WebGL points.
 * The worker hands over positions for two moments a couple of seconds apart,
 * and the vertex shader blends between them for the moment being drawn, so
 * the satellites glide while the CPU does nothing per frame. Positions go
 * through MapLibre's own projection code (the shader prelude it passes in),
 * which keeps them on the globe, and on the flat map once zoomed in.
 */
export class SatelliteLayer implements CustomLayerInterface {
  readonly id = 'satellites';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private readonly programs = new Map<string, Program | null>();
  private vao: WebGLVertexArrayObject | null = null;
  private vaoReady = false;
  private buffers: WebGLBuffer[] = [];
  private uploaded = -1;
  private groups: Float32Array = new Float32Array(0);
  private groupsDirty = false;
  private count = 0;
  private hiddenMask = 0;
  private selected = -1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private last: { projection: FrameProjection; pair: KeyframePair; t: number; elevationScale: number } | null = null;

  constructor(private readonly source: SatelliteLayerSource) {}

  /** Each satellite's group (0 stations, 1 weather, 2 Starlink; anything else is never drawn). */
  setGroups(groups: Uint8Array): void {
    this.groups = Float32Array.from(groups);
    this.count = groups.length;
    this.groupsDirty = true;
    this.uploaded = -1;
    this.map?.triggerRepaint();
  }

  setHiddenMask(mask: number): void {
    this.hiddenMask = mask;
    this.map?.triggerRepaint();
  }

  setSelected(index: number): void {
    this.selected = index;
    this.map?.triggerRepaint();
  }

  /** What the last frame was drawn with, for picking (see projection.ts). */
  get lastFrame() {
    return this.last;
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    // Created here, but only bound inside render(): MapLibre resets its own GL state after a
    // custom layer renders, not after onAdd, so binding now would leave it misinformed.
    this.buffers = ATTRIBUTES.map(() => gl.createBuffer()!);
    this.vao = gl.createVertexArray();
    this.vaoReady = false;
    this.groupsDirty = true;
    this.uploaded = -1;
  }

  private setUpVertexArray(gl: WebGL2RenderingContext): void {
    gl.bindVertexArray(this.vao);
    ATTRIBUTES.forEach((_, location) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[location]!);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, location === 2 ? 1 : 3, gl.FLOAT, false, 0, 0);
    });
    this.vaoReady = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    clearTimeout(this.timer);
    for (const p of this.programs.values()) if (p) gl.deleteProgram(p.program);
    this.programs.clear();
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = [];
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.vao = null;
    this.vaoReady = false;
    this.map = null;
    this.gl = null;
    this.last = null;
  }

  render(gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput): void {
    const map = this.map;
    if (!map || !this.vao || !('createVertexArray' in gl)) return;
    this.scheduleNext(map);
    const t = this.source.now();
    const pair = this.source.pairAt(t);
    if (!pair || this.count === 0 || pair.a.length !== this.count * 3) return;
    const program = this.programFor(gl, args);
    if (!program) return;
    if (!this.vaoReady) this.setUpVertexArray(gl);
    gl.bindVertexArray(null);
    this.upload(gl, pair);

    const projection = args.defaultProjectionData;
    const globe = args.shaderData.define.includes('GLOBE');
    const camera = globe ? cameraFromMatrix(projection.mainMatrix) : null;
    const zoom = map.getZoom();
    const elevationScale = globe ? shellScale(zoom) : 0;
    // Between keyframes the shader blends; a late keyframe is bridged by carrying on for one more interval.
    const u = pair.tb > pair.ta ? Math.min(2, Math.max(0, (t - pair.ta) / (pair.tb - pair.ta))) : 0;
    const centerX = (map.getCenter().wrap().lng + 180) / 360;

    gl.useProgram(program.program);
    const set = (name: string, fn: (loc: WebGLUniformLocation) => void) => {
      const loc = program.uniforms.get(name);
      if (loc) fn(loc);
    };
    set('u_projection_matrix', (l) => gl.uniformMatrix4fv(l, false, new Float32Array(projection.mainMatrix)));
    set('u_projection_fallback_matrix', (l) => gl.uniformMatrix4fv(l, false, new Float32Array(projection.fallbackMatrix)));
    set('u_projection_tile_mercator_coords', (l) => gl.uniform4f(l, ...projection.tileMercatorCoords));
    set('u_projection_clipping_plane', (l) => gl.uniform4f(l, ...projection.clippingPlane));
    set('u_projection_transition', (l) => gl.uniform1f(l, projection.projectionTransition));
    set('u_t', (l) => gl.uniform1f(l, u));
    set('u_elevation_scale', (l) => gl.uniform1f(l, elevationScale));
    set('u_shell_max_km', (l) => gl.uniform1f(l, SHELL_MAX_ALTITUDE_KM));
    set('u_center_x', (l) => gl.uniform1f(l, centerX));
    set('u_camera', (l) => gl.uniform3f(l, ...(camera ?? [0, 0, 0])));
    set('u_pixel_ratio', (l) => gl.uniform1f(l, map.getPixelRatio()));
    // Ten thousand Starlinks at world view would be a fog: fainter the further out.
    set('u_zoom_dim', (l) => gl.uniform1f(l, 0.6 + 0.4 * Math.min(1, Math.max(0, (zoom - 1) / 4))));
    set('u_hidden_mask', (l) => gl.uniform1i(l, this.hiddenMask));

    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    set('u_mode', (l) => gl.uniform1i(l, 0));
    gl.drawArrays(gl.POINTS, 0, this.count);
    if (this.selected >= 0 && this.selected < this.count) {
      set('u_mode', (l) => gl.uniform1i(l, 1));
      gl.drawArrays(gl.POINTS, this.selected, 1);
    }
    gl.bindVertexArray(null);

    const canvas = map.getCanvas();
    this.last = {
      pair,
      t,
      elevationScale,
      projection: {
        globe,
        main: projection.mainMatrix,
        fallback: projection.fallbackMatrix,
        transition: projection.projectionTransition,
        clippingPlane: projection.clippingPlane,
        camera,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      },
    };
  }

  /**
   * The satellites need a frame only when one could have moved half a pixel
   * (about once a second at world view). Any frame the map draws for its own
   * reasons moves them too, and pushes this one back. The wait is half as
   * long again, so that when the tracks are redrawing at the same pace (10
   * times a second zoomed in) their frames do the work, rather than this
   * timer slipping in just before each one and doubling the drawing.
   */
  private scheduleNext(map: MapLibreMap): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => map.triggerRepaint(), 1.5 * satelliteIntervalMs(map.getZoom(), map.getCenter().lat));
  }

  private upload(gl: WebGL2RenderingContext, pair: KeyframePair): void {
    if (this.groupsDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[2]!);
      gl.bufferData(gl.ARRAY_BUFFER, this.groups, gl.STATIC_DRAW);
      this.groupsDirty = false;
    }
    if (this.uploaded === pair.version) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]!);
    gl.bufferData(gl.ARRAY_BUFFER, pair.a, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[1]!);
    gl.bufferData(gl.ARRAY_BUFFER, unwrapAgainst(pair.a, pair.b), gl.DYNAMIC_DRAW);
    this.uploaded = pair.version;
  }

  /** One compiled program per projection variant MapLibre asks for (globe, Mercator). */
  private programFor(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): Program | null {
    const key = args.shaderData.variantName;
    if (this.programs.has(key)) return this.programs.get(key) ?? null;
    const vertex = `#version 300 es\n${args.shaderData.vertexShaderPrelude}\n${args.shaderData.define}\n${VERTEX}`;
    const program = link(gl, vertex, FRAGMENT);
    if (!program) {
      // Remembered, so a shader that can't build is reported once, not every frame.
      this.programs.set(key, null);
      return null;
    }
    const names = [
      'u_projection_matrix',
      'u_projection_fallback_matrix',
      'u_projection_tile_mercator_coords',
      'u_projection_clipping_plane',
      'u_projection_transition',
      'u_t',
      'u_elevation_scale',
      'u_shell_max_km',
      'u_center_x',
      'u_camera',
      'u_pixel_ratio',
      'u_zoom_dim',
      'u_hidden_mask',
      'u_mode',
    ];
    const entry = { program, uniforms: new Map(names.map((n) => [n, gl.getUniformLocation(program, n)])) };
    this.programs.set(key, entry);
    return entry;
  }
}

/**
 * The later keyframe's x moved by a whole world where a satellite crossed the
 * antimeridian between the two, so blending goes the short way, not back
 * across the whole map.
 */
function unwrapAgainst(a: Float32Array, b: Float32Array): Float32Array {
  const out = b.slice();
  for (let i = 0; i < out.length; i += 3) {
    const dx = out[i]! - a[i]!;
    if (dx > 0.5) out[i]! -= 1;
    else if (dx < -0.5) out[i]! += 1;
  }
  return out;
}

function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Satellite shader did not compile:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // The same attribute slots in every variant, so one vertex array serves them all.
  ATTRIBUTES.forEach((name, location) => gl.bindAttribLocation(program, location, name));
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Satellite shader did not link:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}
