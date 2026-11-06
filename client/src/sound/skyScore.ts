import type { Track } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { facesViewer, inViewBox } from '../map/viewBox';
import type { PictureFilter } from '../state/pictureFilter';
import { StoredToggle } from '../state/storedToggle';
import type { TrackStore } from '../state/trackStore';
import { ClimbRates } from './climb';
import { Conductor, type CueKind } from './conductor';
import { ScoreEngine } from './engine';
import { summarise, type ScreenView } from './picture';
import { StoredLevel } from './storedLevel';

export type { CueKind };

/** Where the score reads the picture from. */
export interface ScoreSource {
  tracks(): Iterable<Track>;
  /** Live (not stale) and shown by the filter: what is drawn is what is heard. */
  counts(track: Track, now: number): boolean;
  view(): ScreenView;
  /** Server time, ms. */
  now(): number;
}

/** The map's picture, as the score hears it. */
export function mapSource(map: MapLibreMap, store: TrackStore, filter: PictureFilter, clock: { now(): number }): ScoreSource {
  return {
    tracks: () => store.all(),
    counts: (track, now) => store.status(track, now) === 'live' && filter.passes(track, false),
    view: () => screenOf(map),
    now: () => clock.now(),
  };
}

function screenOf(map: MapLibreMap): ScreenView {
  const b = map.getBounds();
  const box = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  const centre = map.getCenter();
  const zoom = map.getZoom();
  const width = map.getCanvas().clientWidth || 1;
  return {
    // Zoomed out, the bounds take in the far side of the globe: what's there can't be heard either.
    contains: (lon, lat) => inViewBox(box, lon, lat) && facesViewer({ lat: centre.lat, lon: centre.lng }, { lat, lon }, zoom),
    across: (lon, lat) => (map.project([lon, lat]).x / width) * 2 - 1,
  };
}

/** Notes are booked this far ahead on the audio clock, so a late timer never makes a late note. */
const LOOKAHEAD_S = 0.4;
/** A hidden tab's timers can run a second late: book further ahead there. */
const HIDDEN_LOOKAHEAD_S = 1.6;
/** Events that count as the touch browsers wait for before a page may make sound. */
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/** What the score is hearing, in words for the Layers menu; listeners hear when that changes. */
export class ScoreHearing {
  private readonly listeners = new Set<() => void>();
  private text = '';

  describe(): string {
    return this.text;
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * The sky score: ambient music played by the picture on screen (ships hum,
 * aircraft ring their notes, alerts call over the top). Off by default and
 * remembered. Browsers let a page make sound only after it has been
 * touched, and opening the audio device can hold the page for a moment, so
 * a score left on starts at the first click or key press, not while the
 * map is loading. Screensaver mode (`eager`) tries at once instead: no one
 * is there to touch it, and a kiosk can allow autoplay.
 */
export class SkyScore {
  readonly on = new StoredToggle('watchfloor.score', false);
  readonly volume = new StoredLevel('watchfloor.scoreVolume', 0.6);
  readonly hearing = new ScoreHearing();
  private ctx: AudioContext | null = null;
  private engine: ScoreEngine | null = null;
  private readonly conductor = new Conductor(Math.random);
  private readonly climbs = new ClimbRates();
  private listenTimer: number | undefined;
  private planTimer: number | undefined;
  private suspendTimer: number | undefined;
  private plannedTo = 0;

  constructor(
    private readonly source: ScoreSource,
    { eager = false }: { eager?: boolean } = {},
  ) {
    this.on.subscribe(() => (this.on.value ? this.start() : this.stop()));
    this.volume.subscribe(() => {
      if (this.ctx && this.engine) this.engine.setVolume(this.volume.value, this.ctx.currentTime);
    });
    if (!this.on.value) return;
    if (eager) this.start();
    else this.waitForGesture();
  }

  /** On, and the browser has let it make sound. */
  get playing(): boolean {
    return this.on.value && this.ctx?.state === 'running';
  }

  toggle(): void {
    // Left on but still waiting to be allowed to play: this press is the
    // go-ahead, not a request for silence.
    if (this.on.value && !this.playing) this.start();
    else this.on.toggle();
  }

  /**
   * An alert's call, played in the score. False when the score isn't
   * playing, so the caller can ping instead: one sound per alert.
   */
  cue(kind: CueKind): boolean {
    if (!this.playing || !this.ctx || !this.engine) return false;
    const cue = this.conductor.cue(kind, this.ctx.currentTime + 0.05);
    if (cue) this.engine.playCue(cue);
    return true;
  }

  private start(): void {
    window.clearTimeout(this.suspendTimer);
    let ctx: AudioContext;
    let engine: ScoreEngine;
    try {
      ctx = this.ctx ??= new AudioContext({ latencyHint: 'playback' });
      engine = this.engine ??= new ScoreEngine(ctx, ctx.destination, this.volume.value);
    } catch {
      return; // No Web Audio: a quieter watchfloor, not a broken one.
    }
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => {});
      this.waitForGesture();
    }
    engine.setVolume(this.volume.value, ctx.currentTime);
    engine.fadeIn(ctx.currentTime);
    this.plannedTo = ctx.currentTime;
    this.listen();
    this.listenTimer ??= window.setInterval(() => this.listen(), 1_000);
    this.planTimer ??= window.setInterval(() => this.plan(), 100);
  }

  private stop(): void {
    window.clearInterval(this.listenTimer);
    window.clearInterval(this.planTimer);
    this.listenTimer = this.planTimer = undefined;
    this.hearing.set('');
    const ctx = this.ctx;
    if (!ctx || !this.engine) return;
    this.engine.fadeOut(ctx.currentTime);
    // Once it has faded, let the audio device sleep: a suspended context costs nothing.
    this.suspendTimer = window.setTimeout(() => {
      if (!this.on.value) void ctx.suspend().catch(() => {});
    }, 800);
  }

  /** Start (or resume) at the first touch: the moment the browser allows sound. */
  private waitForGesture(): void {
    this.hearing.set('starts at your next click or key press');
    const wake = (event: Event) => {
      // Y is the score's own key: toggle() starts it (unless the Y was typed
      // into a box), so leave that press to it and keep waiting.
      if (event instanceof KeyboardEvent && (event.key === 'y' || event.key === 'Y')) return;
      for (const type of GESTURES) document.removeEventListener(type, wake, true);
      if (this.on.value && !this.playing) this.start();
    };
    for (const type of GESTURES) document.addEventListener(type, wake, true);
  }

  /** Once a second: what's on screen now, and where each layer should glide. */
  private listen(): void {
    // Held silent by the browser, the audio clock stands still: nothing to glide yet.
    if (!this.ctx || !this.engine || this.ctx.state !== 'running') return;
    const now = this.source.now();
    const picture = summarise(this.source.tracks(), (t) => this.source.counts(t, now), this.source.view(), this.climbs, now, Math.random);
    this.conductor.listen(picture, this.ctx.currentTime);
    this.engine.apply(this.conductor.mix(), this.ctx.currentTime);
    this.hearing.set(hearingOf(picture.aircraft, picture.ships));
  }

  /** Ten times a second: book the next stretch of notes on the audio clock. */
  private plan(): void {
    const ctx = this.ctx;
    if (!ctx || !this.engine || ctx.state !== 'running') return;
    const from = Math.max(this.plannedTo, ctx.currentTime + 0.02);
    const to = ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD_S : LOOKAHEAD_S);
    if (to <= from) return;
    for (const note of this.conductor.notes(from, to)) this.engine.play(note);
    this.plannedTo = to;
  }
}

/** "hearing 312 aircraft and 40 ships", or why it's quiet. */
export function hearingOf(aircraft: number, ships: number): string {
  if (aircraft === 0 && ships === 0) return 'nothing live in view, so quiet';
  const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
  const parts = [aircraft ? count(aircraft, 'aircraft', 'aircraft') : '', ships ? count(ships, 'ship', 'ships') : ''];
  return `hearing ${parts.filter(Boolean).join(' and ')}`;
}
