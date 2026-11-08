import { destination, normalizeLon, type Track } from '@watchfloor/shared';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import { buildFlowField, clipToDisc, directionBands, SAMPLE_STRIDE, type BandShare, type FieldOptions } from './flowField';
import { Particles, type ParticleOptions } from './flowParticles';
import { FlowRenderer, type StreakBatch, type StreakStyle } from './flowRenderer';
import { FrameGovernor } from './frameGovernor';
import { metresPerPixel } from './renderRate';
import type { TrackLayer } from './trackLayer';
import type { StoredToggle } from '../state/storedToggle';

/**
 * One medium's currents. Air and sea are separate fields: aircraft cruise
 * about 30 times faster than ships, and every shipping lane lies under an
 * air route, so one average would be the aircraft's with the ships drowned
 * out. Apart, each also gets its own pace, and shipping lanes read as the
 * slower currents they are.
 */
interface Medium {
  /** Slower than this isn't part of a current (taxiing, at anchor). */
  minMps: number;
  /** This real speed is drawn at `pxPerS` at any zoom: a time-lapse, so the motion is visible. */
  refMps: number;
  pxPerS: number;
  field: Pick<FieldOptions, 'cell' | 'radius' | 'fullTracks'>;
  particles: ParticleOptions;
  /** One particle per this much flowing screen area (px²), up to `max`. */
  areaPerParticle: number;
  max: number;
  style: StreakStyle;
}

const AIR: Medium = {
  minMps: 40, // about 80 kt: flying, not taxiing
  refMps: 230, // about 450 kt, a cruising airliner
  pxPerS: 55,
  field: { cell: 8, radius: 2, fullTracks: 2 },
  particles: { life: [1.5, 3.5], minStrength: 0.04, fullSpeed: 55 },
  areaPerParticle: 200,
  max: 5000,
  style: { rgb: [0.9, 0.95, 1], alpha: 0.42, width: 1.1 },
};

const SEA: Medium = {
  minMps: 1, // about 2 kt: under way (the chokepoints' "under way" line)
  refMps: 7.7, // 15 kt, a cargo ship
  // Sped up about 13 times more than aircraft (24 / 7.7 against 55 / 230): the map key says so.
  pxPerS: 24,
  field: { cell: 8, radius: 2, fullTracks: 2 },
  particles: { life: [3, 7], minStrength: 0.04, fullSpeed: 24 },
  areaPerParticle: 240,
  max: 3000,
  style: { rgb: [0.62, 0.78, 0.88], alpha: 0.55, width: 1.6 },
};

/**
 * Direction bands per medium, 45° apart on screen: a lane used both ways
 * keeps both currents, and a heading is only ever averaged with ones within
 * 45° of it. Four bands (90° apart) blended neighbouring flows and pulled
 * currents towards east, south, west and north, directions few aircraft
 * fly: measured on 2,734 live aircraft over western Europe, the current
 * nearest each aircraft's heading was a median 10° off (31° for the worst
 * tenth); with eight, 5° (13°). The particle budget is per medium, so more
 * bands don't mean more particles.
 */
const BANDS = 8;
/** A new field every few seconds while the camera holds still: traffic moves slowly. */
const REFRESH_MS = 3000;
/**
 * Sampling runs in the main thread's idle time, never more than this at a
 * go, so a big picture can't stall a frame; if the page is never idle, it
 * still gets a short slice every IDLE_TIMEOUT_MS.
 */
const MAX_SLICE_MS = 12;
const MIN_SLICE_MS = 3;
const IDLE_TIMEOUT_MS = 100;
/** After a fresh start (page load, a zoom) frame times aren't judged for this long. */
const HOLD_MS = 3000;
/** Trails fade with this time constant (seconds). */
const TRAIL_S = 0.5;
/** Each track's direction is measured over a step this long on screen (px), through the projection. */
const STEP_PX = 4;
/** Below this zoom a pan turns the globe rather than sliding the picture... */
const SLIDE_MIN_ZOOM = 4;
/** ...so only nudges this small (follow mode's) are slid there; anything more starts afresh. */
const GLOBE_NUDGE_PX = 12;
/** After a slide this long, a new field at once, to fill in the uncovered edge. */
const REFILL_PX = 40;
/** Crisp streaks without 4K-sized textures to fade every frame. */
const MAX_PIXEL_RATIO = 1.5;
/** Most tracks per medium projected for one field (see fairShare). */
const MAX_PICKS = 3000;
/** The field stops this far (px) inside the globe's rim. */
const RIM_MARGIN_PX = 3;
const DEG = Math.PI / 180;

interface Disc {
  x: number;
  y: number;
  r: number;
}

/**
 * An average flow doesn't need every aircraft. Past MAX_PICKS, every k-th
 * candidate is projected, counted as the k it stands for, so the field's
 * densities stay right and a 10,000-aircraft picture costs no more to sample
 * than a 3,000 one. (The store's order has nothing to do with place, so the
 * share is fair across the screen.)
 */
function fairShare(candidates: Candidate[]): Candidate[] {
  if (candidates.length <= MAX_PICKS) return candidates;
  const k = candidates.length / MAX_PICKS;
  const picks: Candidate[] = [];
  for (let i = 0; i < MAX_PICKS; i++) picks.push({ ...candidates[Math.floor(i * k)]!, weight: k });
  return picks;
}

/** Dot product of two places as unit vectors: the cosine of the angle between them at the earth's centre. */
function dotFromCentre(a: LngLat, b: LngLat): number {
  const [φ1, λ1, φ2, λ2] = [a.lat * DEG, a.lng * DEG, b.lat * DEG, b.lng * DEG];
  return Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ1 - λ2) + Math.sin(φ1) * Math.sin(φ2);
}

/** Runs `work` in the main thread's idle time (or soon, where browsers can't say when that is). */
function whenIdle(work: (idleMs: number) => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback((deadline) => work(deadline.timeRemaining()), { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(() => work(MIN_SLICE_MS), 0);
  }
}

/** Samples for one field, packed as `buildFlowField` reads them. */
class SampleBuffer {
  data = new Float32Array(1024 * SAMPLE_STRIDE);
  count = 0;

  push(x: number, y: number, vx: number, vy: number, weight: number): void {
    if ((this.count + 1) * SAMPLE_STRIDE > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const b = this.count * SAMPLE_STRIDE;
    this.data[b] = x;
    this.data[b + 1] = y;
    this.data[b + 2] = vx;
    this.data[b + 3] = vy;
    this.data[b + 4] = weight;
    this.count++;
  }
}

/** One medium's samples, one buffer per direction band. */
function bandBuffers(): SampleBuffer[] {
  return Array.from({ length: BANDS }, () => new SampleBuffer());
}

const total = (buffers: readonly SampleBuffer[]) => buffers.reduce((sum, b) => sum + b.count, 0);

/** One field's sampling, done a slice at a time, for the camera as it was when it began. */
/** A track that could be on screen, where it's drawn, and how many tracks it stands for. */
interface Candidate {
  track: Track;
  lat: number;
  lon: number;
  weight: number;
}

interface Job {
  tracks: readonly Track[];
  /** Tracks looked at so far (first pass), then picks projected so far (second). */
  next: number;
  /** First pass: what could be on screen. Second: a fair share of it, to project. */
  candidates: { air: Candidate[]; sea: Candidate[] };
  picks: Candidate[] | null;
  /** Main-thread time spent sampling so far. */
  ms: number;
  air: SampleBuffer[];
  sea: SampleBuffer[];
  /** The place at the screen's centre, to measure any slide of the camera since. */
  anchor: LngLat;
  centre: { x: number; y: number };
  zoom: number;
  width: number;
  height: number;
  /** Metres for a STEP_PX step at the centre. */
  stepM: number;
  /**
   * The map's centre as a unit vector, and the least dot product with it that
   * can be on screen: the horizon zoomed out, the farthest corner zoomed in.
   */
  cx: number;
  cy: number;
  cz: number;
  minFacing: number;
  /** The globe's outline on screen, when it doesn't fill the screen. */
  disc: Disc | null;
}

/**
 * Traffic currents (I, Layers → Display): particles drift with the average
 * direction and speed of the tracks around them, like a wind map whose wind
 * is the traffic. Air and sea are separate fields (see Medium).
 *
 * Every few seconds each live, moving track that passes the filter is put
 * through the map's own projection, with a point a few pixels along its
 * course: the difference is its velocity on screen, with the globe's
 * curvature in it. Those samples make a screen-space field (flowField.ts),
 * and particles move through it with no projection per frame
 * (flowParticles.ts), drawn on their own WebGL canvas (flowRenderer.ts).
 *
 * The camera: a pan slides particles and trails with the map (follow
 * mode's one-pixel nudges included); a zoom, or a pan that turns the globe,
 * starts the picture afresh once the camera stops — the long exposure's
 * rule. It sleeps while off, while the tab is hidden and while main.ts hides
 * it (the timeline's replay: the currents are the present's; a ride: its
 * canvas would paint over the cockpit view), and a FrameGovernor
 * trims the particles on machines that can't keep up.
 */
export class FlowLayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: FlowRenderer;
  /** One particle set per direction band, per medium. */
  private readonly air = Array.from({ length: BANDS }, () => new Particles(AIR.max, AIR.particles));
  private readonly sea = Array.from({ length: BANDS }, () => new Particles(SEA.max, SEA.particles));
  private readonly all = [...this.sea, ...this.air];
  /** Sea first, so aircraft streaks are laid over ships'. Counts are refilled each frame. */
  private readonly batches: StreakBatch[] = [
    ...this.sea.map((p) => ({ segments: p.segments, count: 0, style: SEA.style })),
    ...this.air.map((p) => ({ segments: p.segments, count: 0, style: AIR.style })),
  ];
  private readonly share: BandShare = { a: 0, wa: 0, b: 0, wb: 0 };
  private readonly governor = new FrameGovernor();
  private readonly deviceScale = window.matchMedia('(pointer: coarse)').matches ? 0.5 : 1;
  private raf = 0;
  private last = 0;
  private job: Job | null = null;
  /** The job whose fields are being installed band by band (install()). */
  private installing: Job | null = null;
  /** When the next field is due (rAF time, ms). */
  private due = 0;
  /** A field matches the camera and particles are out. */
  private settled = false;
  /** The camera zoomed or turned the globe: nothing until it stops. */
  private jumping = false;
  private hidden = false;
  /** The installed field's anchor, where it was last seen on screen, and how far it has slid in all. */
  private anchor: LngLat | null = null;
  private anchorAt = { x: 0, y: 0 };
  private anchorZoom = 0;
  private slid = 0;
  /** Slide the trails haven't taken yet: they move by whole device pixels only. */
  private pendingX = 0;
  private pendingY = 0;
  private pixelRatio = 1;

  constructor(
    private readonly map: MapLibreMap,
    private readonly tracks: TrackLayer,
    private readonly live: () => readonly Track[],
    private readonly shown: StoredToggle,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flow';
    this.canvas.setAttribute('aria-hidden', 'true');
    // Right over the map's own canvas, under its markers (tags, reticle, rings): the HUD stays on top.
    map.getCanvasContainer().insertBefore(this.canvas, map.getCanvas().nextSibling);
    this.renderer = new FlowRenderer(this.canvas);
    map.on('move', () => this.onMove());
    map.on('moveend', () => this.onMoveEnd());
    map.on('resize', () => this.fit());
    document.addEventListener('visibilitychange', () => this.apply());
    shown.subscribe(() => this.apply());
    this.fit();
    this.apply();
  }

  /** Hidden whatever the switch says: during the timeline's replay and during a ride (main.ts). */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.apply();
  }

  private get active(): boolean {
    return this.shown.value && !this.hidden && !document.hidden && this.renderer.ready;
  }

  private apply(): void {
    this.canvas.style.display = this.shown.value && !this.hidden ? '' : 'none';
    if (this.active) {
      if (this.raf) return;
      this.restart();
      this.last = 0;
      this.raf = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.restart();
    }
  }

  /** No field, nothing drawn, and a new field as soon as the camera is still. */
  private restart(): void {
    // The map is about to load tiles for the new view: that's not this machine being slow.
    this.governor.hold(HOLD_MS);
    this.job = null;
    this.installing = null;
    this.settled = false;
    this.due = 0;
    this.anchor = null;
    this.slid = 0;
    this.pendingX = 0;
    this.pendingY = 0;
    this.renderer.clear();
  }

  private fit(): void {
    const container = this.map.getContainer();
    this.pixelRatio = this.wantedPixelRatio();
    this.renderer.resize(container.clientWidth, container.clientHeight, this.pixelRatio);
    this.restart();
  }

  /** A struggling machine draws at 1x: fewer pixels to fade every frame. */
  private wantedPixelRatio(): number {
    return this.governor.scale < 0.5 ? 1 : Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  }

  private onMove(): void {
    if (!this.raf) return;
    if (this.job) {
      // Half-sampled for the old camera: sample again once it's still.
      this.job = null;
      this.installing = null;
      this.due = 0;
    }
    if (this.jumping || !this.anchor) return;
    const zoom = this.map.getZoom();
    const at = this.map.project(this.anchor);
    const dx = at.x - this.anchorAt.x;
    const dy = at.y - this.anchorAt.y;
    if (dx === 0 && dy === 0 && zoom === this.anchorZoom) return;
    const slid = this.slid + Math.hypot(dx, dy);
    if (zoom !== this.anchorZoom || (zoom < SLIDE_MIN_ZOOM && slid > GLOBE_NUDGE_PX)) {
      // Nothing on screen moves as one: start afresh when the camera stops.
      this.jumping = true;
      this.restart();
      return;
    }
    this.slid = slid;
    this.anchorAt = { x: at.x, y: at.y };
    for (const p of this.all) p.shift(dx, dy);
    this.pendingX += dx;
    this.pendingY += dy;
  }

  private onMoveEnd(): void {
    if (this.jumping) {
      this.jumping = false;
      this.due = 0;
    } else if (this.slid > REFILL_PX) {
      this.due = 0;
    }
  }

  private readonly tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dtMs = this.last ? now - this.last : 0;
    this.last = now;
    if (this.jumping) return;
    if (!this.job && now >= this.due && !this.map.isMoving()) {
      this.job = this.startJob();
      this.work(this.job);
    }
    if (!this.settled) return;
    if (this.governor.observe(dtMs)) {
      if (this.wantedPixelRatio() !== this.pixelRatio) {
        this.fit(); // starts afresh at the new resolution
        return;
      }
      this.budget();
    }
    const dt = Math.min(0.1, dtMs / 1000);
    this.all.forEach((p, i) => (this.batches[i]!.count = p.step(dt)));
    const shiftX = Math.round(this.pendingX * this.pixelRatio) / this.pixelRatio;
    const shiftY = Math.round(this.pendingY * this.pixelRatio) / this.pixelRatio;
    this.pendingX -= shiftX;
    this.pendingY -= shiftY;
    this.renderer.draw(Math.exp(-dt / TRAIL_S), this.batches, shiftX, shiftY);
  };

  private startJob(): Job {
    const container = this.map.getContainer();
    const width = container.clientWidth;
    const height = container.clientHeight;
    const centre = { x: width / 2, y: height / 2 };
    const anchor = this.map.unproject([centre.x, centre.y]);
    const zoom = this.map.getZoom();
    const middle = this.map.getCenter();
    const lat = middle.lat * DEG;
    const lon = middle.lng * DEG;
    return {
      ...this.horizon(width, height),
      tracks: this.live(),
      next: 0,
      candidates: { air: [], sea: [] },
      picks: null,
      ms: 0,
      air: bandBuffers(),
      sea: bandBuffers(),
      anchor,
      centre,
      zoom,
      width,
      height,
      stepM: metresPerPixel(zoom, anchor.lat) * STEP_PX,
      cx: Math.cos(lat) * Math.cos(lon),
      cy: Math.cos(lat) * Math.sin(lon),
      cz: Math.sin(lat),
    };
  }

  /**
   * How far from the centre a track can be and still be on screen, and the
   * globe's outline when it doesn't fill the screen. Zoomed in, the screen's
   * corners are on the globe and the farthest of them sets the limit, so the
   * first pass can drop nearly everything without projecting it. Zoomed
   * out, it's the horizon: found by walking out from the centre to the rim,
   * the first pixel a projection round trip no longer comes back to. Public
   * API only; at most about 30 round trips per field.
   */
  private horizon(width: number, height: number): { minFacing: number; disc: Disc | null } {
    const centre = this.map.getCenter();
    const c = this.map.project(centre);
    const onGlobe = (x: number, y: number) => {
      const back = this.map.project(this.map.unproject([x, y]));
      return Math.abs(back.x - x) < 0.5 && Math.abs(back.y - y) < 0.5;
    };
    const corners: Array<[number, number]> = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    if (corners.every(([x, y]) => onGlobe(x, y))) {
      const facing = corners.map(([x, y]) => dotFromCentre(this.map.unproject([x, y]), centre));
      return { minFacing: Math.min(...facing) - 1e-9, disc: null };
    }
    // The rim is on screen somewhere: it lies closer than the farthest corner.
    let lo = 0;
    let hi = Math.hypot(Math.max(c.x, width - c.x), Math.max(c.y, height - c.y));
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (onGlobe(c.x + mid, c.y)) lo = mid;
      else hi = mid;
    }
    const rim = this.map.unproject([c.x + lo, c.y]);
    return {
      minFacing: dotFromCentre(rim, centre) + 1e-4,
      disc: { x: c.x, y: c.y, r: lo - RIM_MARGIN_PX },
    };
  }

  /** Samples a slice of the job in idle time, and installs the field when it's done. */
  private work(job: Job): void {
    whenIdle((idleMs) => {
      if (this.job !== job) return; // cancelled: the camera moved, or the layer went away
      const start = performance.now();
      const done = this.sampleSome(job, start + Math.min(MAX_SLICE_MS, Math.max(MIN_SLICE_MS, idleMs)));
      job.ms += performance.now() - start;
      if (!done) return this.work(job);
      this.job = null;
      this.installing = null;
      this.install(job);
      this.due = performance.now() + REFRESH_MS;
    });
  }

  /** Samples until the deadline. True when the job is done. */
  private sampleSome(job: Job, deadline: number): boolean {
    // First pass: which tracks could be on screen? A dot product each, no projection.
    while (!job.picks) {
      const end = Math.min(job.tracks.length, job.next + 256);
      for (; job.next < end; job.next++) this.consider(job, job.tracks[job.next]!);
      if (job.next >= job.tracks.length) {
        job.picks = [...fairShare(job.candidates.air), ...fairShare(job.candidates.sea)];
        job.next = 0;
      } else if (performance.now() > deadline) {
        return false;
      }
    }
    // Second pass: project the picks.
    while (job.next < job.picks.length) {
      const end = Math.min(job.picks.length, job.next + 64);
      for (; job.next < end; job.next++) this.sample(job, job.picks[job.next]!);
      if (performance.now() > deadline) break;
    }
    return job.next >= job.picks.length;
  }

  private consider(job: Job, t: Track): void {
    if (!(t.speedMps >= (t.domain === 'air' ? AIR : SEA).minMps)) return;
    // Where the symbol is drawn (dead-reckoned), not the last report.
    const at = this.tracks.positionOf(t.id) ?? t;
    // The copy of the world nearest the view, so the antimeridian can't fling a track a world away.
    const lon = job.anchor.lng + normalizeLon(at.lon - job.anchor.lng);
    const lat = at.lat;
    const cosLat = Math.cos(lat * DEG);
    // Beyond the horizon, or beyond the screen's farthest corner. The far side of the globe
    // projects into the disc too (behind the near side), so this is decided on the sphere.
    const facing =
      cosLat * Math.cos(lon * DEG) * job.cx + cosLat * Math.sin(lon * DEG) * job.cy + Math.sin(lat * DEG) * job.cz;
    if (facing < job.minFacing) return;
    job.candidates[t.domain].push({ track: t, lat, lon, weight: 1 });
  }

  private sample(job: Job, pick: Candidate): void {
    const { track: t, lat, lon, weight } = pick;
    const medium = t.domain === 'air' ? AIR : SEA;
    const p = this.map.project([lon, lat]);
    if (!(p.x >= 0 && p.y >= 0 && p.x < job.width && p.y < job.height)) return;
    // Direction and local scale come from the projection (the globe foreshortens towards its rim).
    const ahead = destination({ lat, lon }, t.courseDeg, job.stepM);
    const q = this.map.project([lon + normalizeLon(ahead.lon - lon), ahead.lat]);
    const k = ((t.speedMps / medium.refMps) * medium.pxPerS) / STEP_PX;
    const vx = (q.x - p.x) * k;
    const vy = (q.y - p.y) * k;
    // Shared between the two direction bands either side of its heading on screen.
    const s = directionBands(Math.atan2(vy, vx), BANDS, this.share);
    const buffers = t.domain === 'air' ? job.air : job.sea;
    if (s.wa > 1e-3) buffers[s.a]!.push(p.x, p.y, vx, vy, s.wa * weight);
    if (s.wb > 1e-3) buffers[s.b]!.push(p.x, p.y, vx, vy, s.wb * weight);
  }

  /**
   * Builds and installs the job's fields, one band per idle slice: all
   * sixteen at once (each three blurred 20k-cell planes) was a 60-150 ms
   * stall every refresh (measured), while the sampling before it was sliced.
   * A field arrives band by band over a few frames, which nobody sees.
   */
  private install(job: Job): void {
    const size = { width: job.width, height: job.height };
    // Should the camera have slid since sampling began, the field is read that much back.
    const at = this.map.project(job.anchor);
    const offsetX = at.x - job.centre.x;
    const offsetY = at.y - job.centre.y;
    const bands: Array<[Particles, SampleBuffer, Medium]> = [
      ...this.air.map((p, i): [Particles, SampleBuffer, Medium] => [p, job.air[i]!, AIR]),
      ...this.sea.map((p, i): [Particles, SampleBuffer, Medium] => [p, job.sea[i]!, SEA]),
    ];
    this.installing = job;
    const next = () =>
      whenIdle(() => {
        // A newer sampling job, or the layer going away, drops the rest of this field.
        if (this.installing !== job || this.job !== null) return;
        const band = bands.shift();
        if (band) {
          const [particles, buffer, medium] = band;
          const field = buildFlowField(buffer.data, buffer.count, { ...medium.field, ...size });
          // The blur spreads tracks near the rim out into space: currents stay on the globe.
          if (job.disc) clipToDisc(field, job.disc.x, job.disc.y, job.disc.r);
          particles.setField(field, offsetX, offsetY);
          next();
          return;
        }
        this.installing = null;
        this.installed(job, at, offsetX, offsetY);
      });
    next();
  }

  /** The whole field is in: the anchor it was sampled from, the figures the headless checks read, the budget. */
  private installed(job: Job, at: { x: number; y: number }, offsetX: number, offsetY: number): void {
    this.anchor = job.anchor;
    this.anchorAt = { x: at.x, y: at.y };
    this.anchorZoom = job.zoom;
    this.slid = Math.hypot(offsetX, offsetY);
    // Read by the headless checks: band-weighted samples per medium, and what sampling cost.
    this.canvas.dataset.samples = `${total(job.air)} ${total(job.sea)}`;
    this.canvas.dataset.candidates = `${job.candidates.air.length} ${job.candidates.sea.length}`;
    this.canvas.dataset.sampleMs = job.ms.toFixed(1);
    this.canvas.dataset.disc = job.disc ? `${job.disc.x.toFixed(0)} ${job.disc.y.toFixed(0)} ${job.disc.r.toFixed(0)}` : 'none';
    this.budget();
    if (!this.settled) {
      for (const p of this.all) p.scatter();
      this.settled = true;
    }
  }

  /**
   * Particles in proportion to the flowing area, shared between a medium's
   * bands by their own areas, up to the medium's cap; trimmed by the
   * governor (and halved on phones).
   */
  private budget(): void {
    const scale = this.governor.scale * this.deviceScale;
    const spread = (sets: readonly Particles[], medium: Medium): number => {
      const area = sets.reduce((sum, p) => sum + p.flowingArea, 0);
      const count = Math.min(medium.max, area / medium.areaPerParticle) * scale;
      for (const p of sets) p.setCount(area > 0 ? (count * p.flowingArea) / area : 0);
      return sets.reduce((sum, p) => sum + p.count, 0);
    };
    // Read by the headless checks: how many of each are out, at what share of the budget.
    this.canvas.dataset.particles = `${spread(this.air, AIR)} ${spread(this.sea, SEA)}`;
    this.canvas.dataset.scale = this.governor.scale.toFixed(2);
  }
}
