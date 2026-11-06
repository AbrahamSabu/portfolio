/** Two moments' positions (three floats per satellite, see propagate.ts) and the times they are for. */
export interface KeyframePair {
  a: Float32Array;
  b: Float32Array;
  ta: number;
  tb: number;
  /** Changes whenever a or b does, so the GPU copy is refreshed only then. */
  version: number;
}

interface Frame {
  t: number;
  data: Float32Array;
  /** A serial number: a frame recomputed for the same time is a new frame (the GPU copy must be refreshed). */
  n: number;
}

/**
 * The positions the worker has computed, by moment, and which to ask for
 * next. The layer draws between the two either side of the moment shown;
 * nothing here assumes the worker keeps up: a late frame is never thrown
 * away, the newest two are carried on from instead, and only a couple of
 * requests are ever outstanding, so a slow machine falls behind gracefully
 * rather than queueing work for moments already gone.
 */
export class Keyframes {
  private readonly frames = new Map<number, Frame>();
  private readonly inFlight = new Set<number>();
  private serial = 0;
  private version = 0;
  private key = '';
  private pair: KeyframePair | null = null;

  constructor(
    private readonly stepMs: number,
    private readonly request: (t: number) => void,
    private readonly maxInFlight = 2,
  ) {}

  clear(): void {
    this.frames.clear();
    this.inFlight.clear();
    this.pair = null;
    this.key = '';
  }

  add(t: number, data: Float32Array): void {
    this.inFlight.delete(t);
    this.frames.set(t, { t, data, n: ++this.serial });
  }

  /** Ask again for every moment held: the catalogue has finished setting up, and these frames lack some of it. */
  refresh(): void {
    for (const t of this.frames.keys()) this.want(t, true);
  }

  /** Live (or a fixed offset from it): moments on a regular grid, asked for ahead of need. */
  pairAt(t: number): KeyframePair | null {
    const k = Math.floor(t / this.stepMs) * this.stepMs;
    for (const want of [k, k + this.stepMs, k + 2 * this.stepMs]) this.want(want);
    return this.choose(t);
  }

  /** A fixed moment, such as the timeline's replay, which can jump hours: exactly that one, the newest wish winning. */
  exactAt(t: number): KeyframePair | null {
    if (!this.frames.has(t) && this.inFlight.size === 0) this.want(t);
    const frame = this.frames.get(t) ?? [...this.frames.values()].sort((a, b) => b.n - a.n)[0];
    if (!frame) return null;
    for (const time of this.frames.keys()) if (time !== frame.t) this.frames.delete(time);
    return this.pairOf(frame, frame);
  }

  private want(t: number, again = false): void {
    if ((!again && this.frames.has(t)) || this.inFlight.has(t) || this.inFlight.size >= this.maxInFlight) return;
    this.inFlight.add(t);
    this.request(t);
  }

  private choose(t: number): KeyframePair | null {
    const times = [...this.frames.keys()].sort((x, y) => x - y);
    if (times.length === 0) return null;
    let ai = -1;
    for (let i = 0; i < times.length; i++) if (times[i]! <= t) ai = i;
    let a: number;
    let b: number;
    if (ai < 0) {
      // Everything held is still to come (the clock went back): show the earliest, still.
      a = b = times[0]!;
    } else if (ai + 1 < times.length) {
      a = times[ai]!;
      b = times[ai + 1]!;
    } else if (ai >= 1) {
      // The worker is late: carry on along the last two (the layer extrapolates at most one step).
      a = times[ai - 1]!;
      b = times[ai]!;
    } else {
      a = b = times[ai]!;
    }
    for (const time of times) if (time < a) this.frames.delete(time);
    return this.pairOf(this.frames.get(a)!, this.frames.get(b)!);
  }

  private pairOf(fa: Frame, fb: Frame): KeyframePair {
    const key = `${fa.n}:${fb.n}`;
    if (key !== this.key || !this.pair) {
      this.key = key;
      this.pair = { a: fa.data, b: fb.data, ta: fa.t, tb: fb.t, version: ++this.version };
    }
    return this.pair;
  }
}
