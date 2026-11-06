/**
 * Traffic currents, the field: for every point on screen, the average
 * velocity of the traffic around it, built the way a wind map is drawn, but
 * from the tracks' own reported courses and speeds.
 *
 * The field lives in screen space. The layer projects each track (and a
 * point a few seconds along its course) through the map, so the globe's
 * curvature is already in every sample. What is left here is plain 2D maths:
 *
 * 1. Splat: each sample's velocity, with a weight of 1, is shared between the
 *    four grid nodes around it (bilinear), so nothing snaps to a node.
 * 2. Smooth: three box blurs along each axis, which is very close to a
 *    Gaussian, at a cost that doesn't grow with the radius.
 * 3. Average: blurred velocity over blurred weight is a kernel-weighted mean
 *    (Nadaraya-Watson regression). The blurred weight says how much traffic
 *    stands behind that mean: none, no current; a busy corridor, a strong one.
 *
 * Opposite flows average out to a slow, weak current. That is the honest
 * reading: there is no agreed direction there.
 */

/** Samples are packed four floats each: x, y (CSS px), vx, vy (display px per second). */
export const SAMPLE_STRIDE = 4;

export interface FieldOptions {
  /** Screen size in CSS pixels. */
  width: number;
  height: number;
  /** Pixels between grid nodes. */
  cell: number;
  /** Box blur radius in nodes: each of the three passes spans 2r + 1 nodes. */
  radius: number;
  /** How many tracks' worth of weight makes a full-strength current. */
  fullTracks: number;
}

export interface FlowField {
  readonly cols: number;
  readonly rows: number;
  /** Pixels between grid nodes; node (i, j) sits at (i * cell, j * cell). */
  readonly cell: number;
  /** Blurred velocity sums and blurred weights: the mean is their ratio, taken when sampled. */
  readonly sumX: Float32Array;
  readonly sumY: Float32Array;
  readonly weight: Float32Array;
  /** Weight to strength: one over (a lone track's weight at its own node times `fullTracks`). */
  readonly norm: number;
}

/** What the field says at one point. */
export interface FlowProbe {
  vx: number;
  vy: number;
  /** 0 (no traffic behind it) to 1 (a full-strength current). */
  strength: number;
}

export function buildFlowField(samples: Float32Array, count: number, o: FieldOptions): FlowField {
  const cols = Math.max(2, Math.ceil(o.width / o.cell) + 1);
  const rows = Math.max(2, Math.ceil(o.height / o.cell) + 1);
  const n = cols * rows;
  const sumX = new Float32Array(n);
  const sumY = new Float32Array(n);
  const weight = new Float32Array(n);
  const add = (node: number, w: number, vx: number, vy: number) => {
    sumX[node] = sumX[node]! + vx * w;
    sumY[node] = sumY[node]! + vy * w;
    weight[node] = weight[node]! + w;
  };
  for (let s = 0; s < count; s++) {
    const b = s * SAMPLE_STRIDE;
    const gx = samples[b]! / o.cell;
    const gy = samples[b + 1]! / o.cell;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) continue;
    const fx = gx - i;
    const fy = gy - j;
    const vx = samples[b + 2]!;
    const vy = samples[b + 3]!;
    const k = j * cols + i;
    add(k, (1 - fx) * (1 - fy), vx, vy);
    add(k + 1, fx * (1 - fy), vx, vy);
    add(k + cols, (1 - fx) * fy, vx, vy);
    add(k + cols + 1, fx * fy, vx, vy);
  }
  const scratch = new Float32Array(n);
  for (const channel of [sumX, sumY, weight]) blur(channel, scratch, cols, rows, o.radius);
  return { cols, rows, cell: o.cell, sumX, sumY, weight, norm: 1 / (kernelPeak(o.radius) * o.fullTracks) };
}

/**
 * The field at a screen point, bilinearly between the four nodes around it.
 * Sums and weights are interpolated before dividing, so the mean holds its
 * speed out to the fringe of a current instead of sagging towards zero.
 * False outside the grid.
 */
export function sampleFlow(f: FlowField, x: number, y: number, out: FlowProbe): boolean {
  const gx = x / f.cell;
  const gy = y / f.cell;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  if (i < 0 || j < 0 || i >= f.cols - 1 || j >= f.rows - 1) return false;
  const fx = gx - i;
  const fy = gy - j;
  const k = j * f.cols + i;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const k10 = k + 1;
  const k01 = k + f.cols;
  const k11 = k01 + 1;
  const w = f.weight[k]! * w00 + f.weight[k10]! * w10 + f.weight[k01]! * w01 + f.weight[k11]! * w11;
  if (w <= 1e-9) {
    out.vx = 0;
    out.vy = 0;
    out.strength = 0;
    return true;
  }
  out.vx = (f.sumX[k]! * w00 + f.sumX[k10]! * w10 + f.sumX[k01]! * w01 + f.sumX[k11]! * w11) / w;
  out.vy = (f.sumY[k]! * w00 + f.sumY[k10]! * w10 + f.sumY[k01]! * w01 + f.sumY[k11]! * w11) / w;
  out.strength = Math.min(1, w * f.norm);
  return true;
}

/** A node's strength (0..1): how much traffic stands behind its mean. */
export function nodeStrength(f: FlowField, node: number): number {
  return Math.min(1, f.weight[node]! * f.norm);
}

/**
 * Three box blurs along rows, then three along columns (separable, so the
 * order doesn't matter). Each pass is a running sum: add the node entering
 * the window, drop the one leaving, so the radius costs nothing. Outside the
 * grid counts as empty.
 */
function blur(a: Float32Array, tmp: Float32Array, cols: number, rows: number, r: number): void {
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, tmp, cols, rows, 1, cols, r); // along each row
    boxPass(tmp, a, 1, cols, cols, rows, r); // down each column
  }
}

/**
 * One box blur along `lines` lines of `len` nodes. `step` moves along a line,
 * `lineStep` from one line to the next.
 */
function boxPass(
  src: Float32Array,
  dst: Float32Array,
  lineStep: number,
  lines: number,
  step: number,
  len: number,
  r: number,
): void {
  const inv = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    let sum = 0;
    for (let i = 0; i <= r && i < len; i++) sum += src[base + i * step]!;
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = sum * inv;
      const enter = i + r + 1;
      if (enter < len) sum += src[base + enter * step]!;
      const leave = i - r;
      if (leave >= 0) sum -= src[base + leave * step]!;
    }
  }
}

/**
 * The weight a lone sample, sitting exactly on a node, leaves at that node
 * after the blur: the yardstick for "one track's worth".
 */
export function kernelPeak(r: number): number {
  const len = 6 * r + 1;
  const line = new Float32Array(len);
  const tmp = new Float32Array(len);
  line[3 * r] = 1;
  for (let pass = 0; pass < 3; pass++) {
    boxPass(line, tmp, len, 1, 1, len, r);
    line.set(tmp);
  }
  const peak1d = line[3 * r]!;
  return peak1d * peak1d;
}
