import { nodeStrength, sampleFlow, type FlowField, type FlowProbe } from './flowField';

/** Each frame's move of one particle, packed five floats: x0, y0, x1, y1 (CSS px), brightness (0..1). */
export const SEGMENT_STRIDE = 5;

export interface ParticleOptions {
  /**
   * A particle lives a random time in [min, max) seconds, then is reborn
   * somewhere else, so the picture never drains into a current's dead end.
   */
  life: readonly [min: number, max: number];
  /** Where the current is weaker than this, a particle has left the traffic: it is reborn. */
  minStrength: number;
  /** Display speed (px/s) drawn at full brightness; slower currents are dimmer. */
  fullSpeed: number;
}

/**
 * Particles adrift in a FlowField, in screen space: each frame they move
 * with the field's velocity where they are, and the move is handed back as a
 * line segment for the renderer, which keeps fading what it drew before. No
 * projection happens here, which is what makes thousands of them cheap: the
 * map's projection went into the field once, not into every particle every
 * frame.
 *
 * Births are drawn from the field: more where the current is stronger, none
 * where there is no traffic.
 */
export class Particles {
  /** The last step's segments; `step` returns how many. */
  readonly segments: Float32Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private n = 0;
  private field: FlowField | null = null;
  /** Nodes a particle may be born at, and their running total of strength (births are weighted by it). */
  private nodes = new Int32Array(0);
  private cumulative = new Float64Array(0);
  private total = 0;
  /** How far the camera has slid since the field was sampled (CSS px): the field is read that much back. */
  private offsetX = 0;
  private offsetY = 0;
  private readonly probe: FlowProbe = { vx: 0, vy: 0, strength: 0 };

  constructor(
    readonly capacity: number,
    private readonly options: ParticleOptions,
    private readonly random: () => number = Math.random,
  ) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.segments = new Float32Array(capacity * SEGMENT_STRIDE);
  }

  get count(): number {
    return this.n;
  }

  /** Screen area (px²) with traffic behind it, weighted by strength: what the particle budget scales with. */
  get flowingArea(): number {
    return this.field ? this.total * this.field.cell * this.field.cell : 0;
  }

  /**
   * A new field. Particles keep their places (call `scatter` if the camera
   * zoomed); births follow the new traffic. `offsetX/Y` is how far the camera
   * has slid since the field was sampled.
   */
  setField(field: FlowField | null, offsetX = 0, offsetY = 0): void {
    this.field = field;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.total = 0;
    if (!field) {
      this.nodes = new Int32Array(0);
      this.cumulative = new Float64Array(0);
      return;
    }
    const size = field.cols * field.rows;
    let strong = 0;
    for (let k = 0; k < size; k++) if (nodeStrength(field, k) >= this.options.minStrength) strong++;
    this.nodes = new Int32Array(strong);
    this.cumulative = new Float64Array(strong);
    let i = 0;
    for (let k = 0; k < size; k++) {
      const s = nodeStrength(field, k);
      if (s < this.options.minStrength) continue;
      this.total += s;
      this.nodes[i] = k;
      this.cumulative[i] = this.total;
      i++;
    }
  }

  /** How many particles to keep. New ones start part-way through their lives, so they don't all end together. */
  setCount(count: number): void {
    const n = Math.max(0, Math.min(this.capacity, Math.round(count)));
    for (let i = this.n; i < n; i++) this.spawn(i, true);
    this.n = n;
  }

  /** The camera zoomed or jumped: every particle is reborn now, at a random age. */
  scatter(): void {
    for (let i = 0; i < this.n; i++) this.spawn(i, true);
  }

  /** The camera slid by (dx, dy) px: particles and field move with the map. */
  shift(dx: number, dy: number): void {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.x[i]! + dx;
      this.y[i] = this.y[i]! + dy;
    }
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Moves every particle `dt` seconds through the field. Returns the number of segments written. */
  step(dt: number): number {
    const f = this.field;
    if (!f || this.total === 0) return 0;
    const { minStrength, fullSpeed } = this.options;
    const p = this.probe;
    const seg = this.segments;
    let s = 0;
    for (let i = 0; i < this.n; i++) {
      const x0 = this.x[i]!;
      const y0 = this.y[i]!;
      if (
        this.age[i]! >= this.life[i]! ||
        !sampleFlow(f, x0 - this.offsetX, y0 - this.offsetY, p) ||
        p.strength < minStrength
      ) {
        this.spawn(i, false);
        continue;
      }
      const x1 = x0 + p.vx * dt;
      const y1 = y0 + p.vy * dt;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy); // not Math.hypot: several times slower, every particle every frame
      const b = s * SEGMENT_STRIDE;
      seg[b] = x0;
      seg[b + 1] = y0;
      seg[b + 2] = x1;
      seg[b + 3] = y1;
      // Brighter where more traffic stands behind it and where it moves faster; the
      // square root keeps a lone track's current faint but visible.
      seg[b + 4] = Math.sqrt(p.strength) * (0.4 + 0.6 * Math.min(1, speed / fullSpeed));
      s++;
      this.x[i] = x1;
      this.y[i] = y1;
      this.age[i] = this.age[i]! + dt;
    }
    return s;
  }

  private spawn(i: number, randomAge: boolean): void {
    const [lo, hi] = this.options.life;
    const life = lo + (hi - lo) * this.random();
    this.life[i] = life;
    const f = this.field;
    if (!f || this.total === 0) {
      // Nowhere to be born: wait, already expired, for the next field.
      this.age[i] = life;
      return;
    }
    this.age[i] = randomAge ? life * this.random() : 0;
    const node = this.nodes[this.pick(this.random() * this.total)]!;
    const col = node % f.cols;
    const row = (node - col) / f.cols;
    // Anywhere in the node's cell, not on a lattice.
    this.x[i] = Math.max(0, (col + this.random() - 0.5) * f.cell) + this.offsetX;
    this.y[i] = Math.max(0, (row + this.random() - 0.5) * f.cell) + this.offsetY;
  }

  /** Index of the first node whose running total exceeds `r` (binary search). */
  private pick(r: number): number {
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid]! > r) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
}
