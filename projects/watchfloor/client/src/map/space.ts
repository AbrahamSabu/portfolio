import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Space behind the globe. Outside the globe the map's canvas is transparent,
 * so this element, behind the map, is what's around the planet: a Milky Way
 * with its dust lanes, faint nebulae in the display's blues, and three
 * depths of stars that drift at different speeds as the globe turns (near
 * ones slide past far ones). It moves only when the map does, which is the
 * operator's doing (or the tour they started): the motion rule holds, and
 * reduced motion keeps it still.
 *
 * One screen-sized canvas, redrawn from pre-rendered tiles only on a map
 * move, at most once a frame, and not at all once you're zoomed in and the
 * map covers space (big moving CSS layers would cost tens of MB of GPU
 * memory each on a high-DPI screen; this costs one canvas).
 */
export class SpaceBackdrop {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ratio = Math.min(window.devicePixelRatio || 1, 2);
  private readonly tiles: { image: HTMLCanvasElement; speed: number }[];
  private readonly deep: HTMLCanvasElement;
  /** The globe's turn so far, unwrapped (degrees of longitude), and its tilt (latitude). */
  private lng = 0;
  private lat = 0;
  private lastLng: number | null = null;
  private queued = false;
  private readonly still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    private readonly element: HTMLElement,
    private readonly map: MapLibreMap,
  ) {
    this.ctx = this.canvas.getContext('2d')!;
    element.append(this.canvas);
    const random = seeded(0x9e3779b9);
    // All soft glow: drawn at 1x even on a high-DPI screen (sharpness buys nothing, 4x the memory costs).
    this.deep = milkyWay(random, 1);
    // Near and middle stars in large tiles: in small ones the bright few repeated in a visible grid.
    this.tiles = [
      { image: starTile(random, this.ratio, 512, 520, [0.3, 0.75], [0.12, 0.42], false), speed: 0.35 },
      { image: starTile(random, this.ratio, 1024, 380, [0.6, 1.05], [0.3, 0.7], false), speed: 0.8 },
      { image: starTile(random, this.ratio, 1536, 70, [0.9, 1.6], [0.55, 0.95], true), speed: 1.5 },
    ];
    map.on('move', () => this.onMove());
    window.addEventListener('resize', () => this.draw());
    this.onMove();
    this.draw();
  }

  private onMove(): void {
    if (this.still) return;
    const c = this.map.getCenter();
    if (this.lastLng !== null) {
      let d = c.lng - this.lastLng;
      if (d > 180) d -= 360; // across the antimeridian: keep turning, don't jump
      if (d < -180) d += 360;
      this.lng += d;
    }
    this.lastLng = c.lng;
    this.lat = c.lat;
    // Zoomed in, the map covers space: nothing to draw.
    if (this.map.getZoom() > 7 || this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  private draw(): void {
    const w = this.element.clientWidth;
    const h = this.element.clientHeight;
    if (w === 0 || h === 0) return;
    const pw = Math.round(w * this.ratio);
    const ph = Math.round(h * this.ratio);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    const ctx = this.ctx;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // The Milky Way: wider than the screen, it drifts a little and never wraps.
    const dw = w * 1.3;
    const dh = h * 1.3;
    const dx = clamp(-this.lng * 0.12, -w * 0.15, w * 0.15) - w * 0.15;
    const dy = clamp(this.lat * 0.12, -h * 0.15, h * 0.15) - h * 0.15;
    ctx.drawImage(this.deep, dx, dy, dw, dh);

    // Three depths of stars, tiled, each turning at its own speed.
    for (const { image, speed } of this.tiles) {
      const size = image.width / this.ratio;
      const ox = mod(-this.lng * speed * 4, size) - size;
      const oy = mod(this.lat * speed * 4, size) - size;
      for (let y = oy; y < h; y += size) {
        for (let x = ox; x < w; x += size) ctx.drawImage(image, x, y, size, size);
      }
    }
  }
}

/** A square of stars that tiles seamlessly: stars near an edge are drawn on the far side too. */
function starTile(
  random: () => number,
  ratio: number,
  TILE: number,
  count: number,
  radius: [number, number],
  alpha: [number, number],
  bright: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(TILE * ratio);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);
  for (let i = 0; i < count; i++) {
    const x = random() * TILE;
    const y = random() * TILE;
    const k = random() ** 2.5;
    const r = radius[0] + (radius[1] - radius[0]) * k;
    const a = alpha[0] + (alpha[1] - alpha[0]) * k;
    const colour = starColour(random());
    for (const ox of [-TILE, 0, TILE]) {
      for (const oy of [-TILE, 0, TILE]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -20 || py < -20 || px > TILE + 20 || py > TILE + 20) continue;
        // Only the brightest handful flare: about one in twelve of the near stars.
        star(ctx, px, py, r, a, colour, bright && k > 0.8);
      }
    }
  }
  return canvas;
}

/** Most stars blue-white; some warm, some bluer: the spread a real sky has, kept faint. */
function starColour(roll: number): [number, number, number] {
  if (roll < 0.12) return [255, 236, 214];
  if (roll < 0.2) return [170, 202, 255];
  return [220, 232, 255];
}

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a: number,
  [cr, cg, cb]: [number, number, number],
  flare: boolean,
): void {
  if (flare) {
    // The brightest few: a soft halo and the faint four-point spikes of a telescope's optics.
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
    halo.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${(a * 0.4).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(a * 0.28).toFixed(3)})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - r * 7, y);
    ctx.lineTo(x + r * 7, y);
    ctx.moveTo(x, y - r * 7);
    ctx.lineTo(x, y + r * 7);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${a.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The deep layer: a diagonal band of the galaxy (a glow, thousands of dust
 * stars thick at its spine, darker lanes through it) and a few nebulae in
 * deep blue and teal, never the selection's orchid. Painted once.
 */
function milkyWay(random: () => number, ratio: number): HTMLCanvasElement {
  const W = 1600;
  const H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);

  // The band runs corner to corner, bottom left to top right.
  const ax = -0.05 * W;
  const ay = 0.9 * H;
  const bx = 1.05 * W;
  const by = 0.12 * H;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const along = (t: number, across: number): [number, number] => [ax + ux * t * len - uy * across, ay + uy * t * len + ux * across];

  const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb}, ${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // Nebulae first, furthest back.
  const nebulae: [string, number][] = [
    ['22, 70, 140', 0.11],
    ['12, 96, 120', 0.09],
    ['34, 58, 128', 0.08],
  ];
  for (const [rgb, a] of nebulae) {
    const cx = random() * W;
    const cy = random() * H;
    const size = 220 + random() * 260;
    // A cloud is many overlapping puffs, smaller towards its edges.
    for (let i = 0; i < 60; i++) {
      const angle = random() * Math.PI * 2;
      const dist = random() ** 1.6 * size;
      blob(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist * 0.7, size * (0.25 + random() * 0.4), rgb, a * (0.3 + random() * 0.7));
    }
  }

  // The galaxy's glow: soft puffs along its spine, brighter towards the middle.
  for (let i = 0; i < 140; i++) {
    const t = random();
    const across = gaussian(random) * 70;
    const [x, y] = along(t, across);
    const core = 1 - Math.abs(t - 0.5) * 1.2;
    blob(x, y, 60 + random() * 120, '120, 160, 220', 0.05 + 0.07 * core * random());
  }

  // Dust: thousands of faint stars, densest at the spine.
  for (let i = 0; i < 7000; i++) {
    const t = random();
    const across = gaussian(random) * 55;
    const [x, y] = along(t, across);
    const a = 0.07 + random() ** 3 * 0.4;
    ctx.fillStyle = `rgba(210, 225, 255, ${a.toFixed(3)})`;
    ctx.fillRect(x, y, 0.6 + random() * 0.7, 0.6 + random() * 0.7);
  }

  // Dark lanes of dust down the middle, as the real one has.
  // Kept light: heavier lanes turned the whole band into a dark smudge.
  for (let i = 0; i < 45; i++) {
    const t = 0.1 + random() * 0.8;
    const [x, y] = along(t, gaussian(random) * 14 + 6);
    blob(x, y, 16 + random() * 34, '2, 6, 12', 0.1 + random() * 0.12);
  }
  return canvas;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mod = (v: number, m: number) => ((v % m) + m) % m;
