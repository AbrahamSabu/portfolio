import { SEGMENT_STRIDE } from './flowParticles';

/** How one population's streaks look. Pale light, never an identity colour. */
export interface StreakStyle {
  /** 0..1 RGB. */
  rgb: readonly [number, number, number];
  /** Opacity laid down per pixel of travel at full brightness. */
  alpha: number;
  /** Line width in CSS pixels. */
  width: number;
}

export interface StreakBatch {
  /** Packed segments from `Particles.step`. */
  segments: Float32Array;
  count: number;
  style: StreakStyle;
}

const QUAD_VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FADE_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform float u_keep;
uniform vec2 u_shift;
uniform float u_seed;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv - u_shift;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // The texture has 8 bits a channel: rounding to nearest would leave faint
  // ghosts stuck forever (0.97 x 10/255 rounds back to 10/255), and rounding
  // down cuts every faint tail short (one step lost a frame, whatever u_keep
  // says). Rounding down after adding noise in [0, 1) keeps the fade right on
  // average and still lets every tail reach zero.
  float noise = fract(sin(dot(gl_FragCoord.xy + u_seed, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = floor(texture2D(u_tex, uv) * (255.0 * u_keep) + noise) / 255.0;
}`;

const COPY_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}`;

// One instance per segment, straight from Particles.segments: the six corners
// of a thin quad are built here, so the CPU uploads five floats a segment and
// loops over nothing. Opacity scales with the segment's length, so a slow
// particle (several frames a pixel) lays down as much light as a fast one.
const LINE_VERT = `
attribute vec2 a_corner;
attribute vec4 a_segment;
attribute float a_bright;
uniform vec2 u_size;
uniform float u_half;
uniform float u_alpha;
varying float v_alpha;
void main() {
  vec2 d = a_segment.zw - a_segment.xy;
  float len = length(d);
  vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
  vec2 p = mix(a_segment.xy, a_segment.zw, a_corner.x) + vec2(-dir.y, dir.x) * u_half * a_corner.y;
  vec2 clip = p / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_alpha = a_bright * u_alpha * min(1.0, len);
}`;

const LINE_FRAG = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;
void main() {
  gl_FragColor = vec4(u_color * v_alpha, v_alpha);
}`;

/** Vertex attribute slots, bound before linking so every program agrees. */
const POS = 0; // the full-screen quad's corners, and a streak quad's (along, across)
const SEGMENT = 1;
const BRIGHT = 2;
/** A streak quad's six corners as (along 0..1, across -1..1): two triangles. */
const CORNERS = [0, 1, 0, -1, 1, 1, 1, 1, 0, -1, 1, -1];

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

/**
 * Draws the currents on a WebGL canvas of its own, over the map. The streaks
 * persist in one of two textures that take turns: each frame the last
 * picture is copied into the other a little fainter (and slid with the
 * camera), this frame's moves are added as light, and the result is shown.
 * That fading persistence is what turns each particle's one-pixel step into
 * a comet tail, at the cost of two full-screen passes, whatever the number
 * of particles.
 *
 * Its own context, not a MapLibre custom layer: a custom layer would make
 * the whole map redraw every frame to animate, and the map deliberately
 * paces its redraws (renderRate.ts).
 */
export class FlowRenderer {
  private gl: WebGLRenderingContext | null = null;
  private fade: Program | null = null;
  private copy: Program | null = null;
  private line: Program | null = null;
  private instancing: ANGLE_instanced_arrays | null = null;
  private quad: WebGLBuffer | null = null;
  private corners: WebGLBuffer | null = null;
  private lines: WebGLBuffer | null = null;
  private targets: Target[] = [];
  /** Which target holds the latest picture. */
  private current = 0;
  private frame = 0;
  private cssWidth = 1;
  private cssHeight = 1;
  private lost = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); // so the browser may give it back
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init();
    });
    this.init();
  }

  /** False without WebGL, or while the context is lost: the layer then draws nothing. */
  get ready(): boolean {
    return this.gl !== null && !this.lost;
  }

  /** Size the canvas and its textures to the map, in device pixels; starts a fresh picture. */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * pixelRatio));
    this.makeTargets();
  }

  /** Wipe the picture: the camera jumped or the layer went away. */
  clear(): void {
    const gl = this.gl;
    if (!gl || this.lost) return;
    gl.clearColor(0, 0, 0, 0);
    for (const t of this.targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * One frame: fade what's there to `keep` of itself, slide it by
   * (shiftX, shiftY) CSS px (whole device pixels, or it would smear), add
   * these streaks, show the result.
   */
  draw(keep: number, batches: readonly StreakBatch[], shiftX = 0, shiftY = 0): void {
    const gl = this.gl;
    const [from, to] = [this.targets[this.current], this.targets[1 - this.current]];
    if (!gl || this.lost || !from || !to || !this.fade || !this.copy || !this.line) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);

    // 1. What was there, a little fainter (and slid with the camera).
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer);
    gl.useProgram(this.fade.program);
    this.bindQuad(gl);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    gl.uniform1i(this.fade.uniforms.u_tex!, 0);
    gl.uniform1f(this.fade.uniforms.u_keep!, keep);
    // Texture y runs up the screen, CSS y down it.
    gl.uniform2f(this.fade.uniforms.u_shift!, shiftX / this.cssWidth, -shiftY / this.cssHeight);
    // A new noise pattern every frame, so the dither never settles into a visible texture.
    gl.uniform1f(this.fade.uniforms.u_seed!, (this.frame = (this.frame + 1) % 997));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. This frame's moves, added as light: where currents overlap they glow.
    if (batches.some((b) => b.count > 0)) {
      const ext = this.instancing!;
      const u = this.line.uniforms;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.line.program);
      gl.uniform2f(u.u_size!, this.cssWidth, this.cssHeight);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
      gl.enableVertexAttribArray(POS);
      gl.vertexAttribPointer(POS, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(SEGMENT);
      gl.enableVertexAttribArray(BRIGHT);
      ext.vertexAttribDivisorANGLE(SEGMENT, 1);
      ext.vertexAttribDivisorANGLE(BRIGHT, 1);
      const stride = SEGMENT_STRIDE * 4;
      for (const b of batches) {
        if (b.count === 0) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lines);
        gl.bufferData(gl.ARRAY_BUFFER, b.segments.subarray(0, b.count * SEGMENT_STRIDE), gl.STREAM_DRAW);
        gl.vertexAttribPointer(SEGMENT, 4, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(BRIGHT, 1, gl.FLOAT, false, stride, 16);
        gl.uniform3f(u.u_color!, b.style.rgb[0], b.style.rgb[1], b.style.rgb[2]);
        gl.uniform1f(u.u_half!, b.style.width / 2);
        gl.uniform1f(u.u_alpha!, b.style.alpha);
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, b.count);
      }
      // Divisors are global state: leave them as the quad passes expect.
      ext.vertexAttribDivisorANGLE(SEGMENT, 0);
      ext.vertexAttribDivisorANGLE(BRIGHT, 0);
      gl.disableVertexAttribArray(SEGMENT);
      gl.disableVertexAttribArray(BRIGHT);
      gl.disable(gl.BLEND);
    }

    // 3. Show it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.copy.program);
    this.bindQuad(gl);
    gl.bindTexture(gl.TEXTURE_2D, to.texture);
    gl.uniform1i(this.copy.uniforms.u_tex!, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.current = 1 - this.current;
  }

  private bindQuad(gl: WebGLRenderingContext): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(POS);
    gl.vertexAttribPointer(POS, 2, gl.FLOAT, false, 0, 0);
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.gl = gl;
    if (!gl) return;
    // Instancing is an extension in WebGL 1, but one every implementation has.
    this.instancing = gl.getExtension('ANGLE_instanced_arrays');
    try {
      if (!this.instancing) throw new Error('no ANGLE_instanced_arrays');
      this.fade = link(gl, QUAD_VERT, FADE_FRAG, ['u_tex', 'u_keep', 'u_shift', 'u_seed']);
      this.copy = link(gl, QUAD_VERT, COPY_FRAG, ['u_tex']);
      this.line = link(gl, LINE_VERT, LINE_FRAG, ['u_size', 'u_color', 'u_half', 'u_alpha']);
    } catch (error) {
      console.warn('Traffic currents unavailable:', error);
      this.gl = null;
      return;
    }
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(CORNERS), gl.STATIC_DRAW);
    this.lines = gl.createBuffer();
    this.makeTargets();
  }

  private makeTargets(): void {
    const gl = this.gl;
    if (!gl || this.lost) return;
    for (const t of this.targets) {
      gl.deleteFramebuffer(t.framebuffer);
      gl.deleteTexture(t.texture);
    }
    this.targets = [];
    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      // Same size as the canvas, so NEAREST reads each texel exactly.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.targets.push({ texture, framebuffer });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.clear();
  }
}

function link(gl: WebGLRenderingContext, vertex: string, fragment: string, uniforms: readonly string[]): Program {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    gl.attachShader(program, shader);
  }
  // A program without one of these names just ignores it.
  gl.bindAttribLocation(program, POS, 'a_pos');
  gl.bindAttribLocation(program, POS, 'a_corner');
  gl.bindAttribLocation(program, SEGMENT, 'a_segment');
  gl.bindAttribLocation(program, BRIGHT, 'a_bright');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program');
  return { program, uniforms: Object.fromEntries(uniforms.map((u) => [u, gl.getUniformLocation(program, u)])) };
}
