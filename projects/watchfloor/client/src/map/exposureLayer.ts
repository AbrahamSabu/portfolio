import type { Track } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { AFFILIATION_COLOR } from './colors';
import type { StoredToggle } from '../state/storedToggle';
import type { TrackLayer } from './trackLayer';

/** How often a frame of the exposure is laid down. */
const EXPOSE_MS = 500;
/** Each pass is faint; the picture is the accumulation. */
const ALPHA = 0.16;
/** Enough resolution for crisp threads without 4K-sized buffers. */
const MAX_DPR = 1.5;

/**
 * Long exposure: a canvas over the map that is never cleared while the camera
 * holds still, so every aircraft and ship burns its route in as a glowing
 * thread — the night-photography view of the picture, in the same identity
 * colours. A pan or zoom starts a fresh exposure (the film moved), and the
 * layer sleeps entirely while its switch is off, the page is hidden, or
 * main.ts hides it (the timeline's replay, a ride).
 */
export class ExposureLayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private timer: number | undefined;
  private hidden = false;

  constructor(
    private readonly map: MapLibreMap,
    private readonly tracks: TrackLayer,
    private readonly live: () => readonly Track[],
    private readonly shown: StoredToggle,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'exposure';
    this.canvas.setAttribute('aria-hidden', 'true');
    map.getContainer().append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    // The film moved: start over.
    map.on('movestart', () => this.clear());
    map.on('resize', () => this.fit());
    document.addEventListener('visibilitychange', () => this.apply());
    shown.subscribe(() => this.apply());
    this.fit();
    this.apply();
  }

  /** Hidden whatever the switch says: its dots are the live picture's, so not during a replay or a ride. */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.apply();
  }

  private apply(): void {
    const shown = this.shown.value && !this.hidden;
    const on = shown && !document.hidden;
    this.canvas.style.display = shown ? '' : 'none';
    window.clearInterval(this.timer);
    this.timer = undefined;
    if (on) this.timer = window.setInterval(() => this.expose(), EXPOSE_MS);
    if (!shown) this.clear();
  }

  private fit(): void {
    const container = this.map.getContainer();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.max(1, Math.round(container.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(container.clientHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** One pass: a faint dot where everything is drawn right now. */
  private expose(): void {
    const width = this.map.getContainer().clientWidth;
    const height = this.map.getContainer().clientHeight;
    // On the globe, a point behind the horizon can still project into the
    // viewport: the bounds check keeps the far side off the film.
    const bounds = this.map.getBounds();
    const ctx = this.ctx;
    ctx.globalAlpha = ALPHA;
    for (const t of this.live()) {
      // Dots land where the symbols are drawn (dead-reckoned), not at the last report.
      const pos = this.tracks.positionOf(t.id) ?? t;
      if (!bounds.contains([pos.lon, pos.lat])) continue;
      const p = this.map.project([pos.lon, pos.lat]);
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
      ctx.fillStyle = AFFILIATION_COLOR[t.affiliation];
      ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}
