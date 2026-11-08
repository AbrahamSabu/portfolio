import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PictureFilter } from '../state/pictureFilter';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import type { ServerClock } from '../state/clock';
import { AltitudeHistory } from './altitudeHistory';
import { relockCamera, reducedMotion, unlockCamera } from './cameraLock';
import { Layer3d } from './layer3d';
import { dimLayers } from './paintDim';
import { mercatorX, mercatorY } from './project3d';
import { buildAircraft, buildTrails, liftTrail, pickAircraft, STACK_EXAGGERATION, type LiftedPoint, type StackAircraft, type TrailInput } from './stackBuffers';
import { SYMBOL_MIN_ZOOM, type TrackLayer } from './trackLayer';
import type { TrailMode } from './trailLayer';
import { inViewBox } from './viewBox';
import './stack.css';

/** About the angle of a window seat: enough to see heights, still a map. */
const TILT = 60;
const MAX_PITCH = 80;
/** The flat aircraft stay on the ground as faint shadows of their 3D selves. */
const SHADOW = 0.3;
/** The flat map's aircraft layers (trackLayer.ts names them by domain). */
export const AIR_LAYERS = ['track-leaders-air', 'track-glow-air', 'track-dots-air', 'track-symbols-air', 'track-labels-air'];

interface Trails {
  readonly mode: TrailMode;
  subscribe(listener: () => void): unknown;
}

/**
 * The Stack (E, or Layers › Display): the map tilts, and every aircraft is
 * drawn at its real altitude (exaggerated, and labelled so) with a thin line
 * down to where it is over the ground. Holding stacks read as corkscrews,
 * oceanic traffic as a layer at cruise height, helicopters skim the surface.
 * Ships stay on the sea, drawn as usual.
 *
 * The flat aircraft stay as dimmed shadows, so filters, staleness and the
 * selection reticle keep working underneath; this draws the 3D picture on
 * top from the same dead-reckoned positions, updated at the same rate.
 */
export class StackMode {
  private readonly layer = new Layer3d('stack-3d');
  /** Recorded from page load, so trails have their heights when the Stack opens. */
  private readonly altitudes = new AltitudeHistory();
  private readonly listeners = new Set<() => void>();
  private readonly chip: HTMLElement;
  private active = false;
  private undim: (() => void) | null = null;
  /** The camera's angles before the Stack: given back on leaving. */
  private saved: { bearing: number; pitch: number } | null = null;
  /** The angles an exit is still levelling back to; a re-entry meanwhile keeps them. */
  private relocking: { bearing: number; pitch: number } | null = null;
  /** What the last frame drew, for hit-testing. */
  private drawn: StackAircraft[] = [];
  private trailEnds = new Map<string, LiftedPoint>();
  private trailsStale = true;
  /** Called before the Stack opens, so another camera mode (Ride Along) can hand the map back first. */
  beforeEnter: () => void = () => {};

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly tracks: TrackLayer,
    private readonly selection: Selection,
    private readonly filter: PictureFilter,
    private readonly trails: Trails,
  ) {
    this.layer.exaggeration = STACK_EXAGGERATION;
    // Draw order: trails, then drop lines, then dots on top.
    for (const name of ['trails', 'drops', 'aircraft']) this.layer.set(name, null);

    this.chip = document.createElement('div');
    this.chip.className = 'stack-chip';
    this.chip.hidden = true;
    this.chip.textContent = `The Stack · altitude ×${STACK_EXAGGERATION}`;
    map.getContainer().append(this.chip);

    store.subscribe(() => {
      this.altitudes.recordAll(store.all());
      this.altitudes.prune(clock.now(), (id) => store.get(id) !== undefined);
      this.trailsStale = true;
    });
    const restale = () => (this.trailsStale = true);
    selection.subscribe(restale);
    filter.subscribe(restale);
    trails.subscribe(restale);
    map.on('moveend', restale);
    tracks.onFrame(() => {
      if (this.active) this.frame();
    });
    // A new style drops custom layers and restyles ours: put both back.
    map.on('style.load', () => {
      if (this.active) this.install();
    });
    tracks.setPicker((point, pad) => (this.active ? this.pick(point, pad) : null));
  }

  get value(): boolean {
    return this.active;
  }

  set(on: boolean): void {
    if (on) this.enter();
    else this.exit();
  }

  toggle(): void {
    this.set(!this.active);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Leave at once, without levelling out gently: for another mode taking the camera. */
  leaveNow(): void {
    this.exit(true);
  }

  private enter(): void {
    if (this.active) return;
    this.beforeEnter();
    this.active = true;
    // Re-entered while still levelling out of the last visit: the angles to go back to are
    // the ones first saved, not the mid-ease ones (which left the map locked rotated).
    this.saved = this.relocking ?? { bearing: this.map.getBearing(), pitch: this.map.getPitch() };
    this.relocking = null;
    unlockCamera(this.map, MAX_PITCH);
    this.install();
    this.chip.hidden = false;
    this.trailsStale = true;
    this.frame();
    const tilt = () => {
      if (!this.active) return;
      if (reducedMotion()) this.map.jumpTo({ pitch: TILT });
      else this.map.easeTo({ pitch: TILT, duration: 900 });
    };
    // Tilting now would cut short a flight (or a drag) in progress: tilt when it lands.
    if (this.map.isMoving()) this.map.once('moveend', tilt);
    else tilt();
    this.notify();
  }

  private exit(instant = false): void {
    if (!this.active) return;
    this.active = false;
    if (this.map.getLayer(this.layer.id)) this.map.removeLayer(this.layer.id);
    this.undim?.();
    this.undim = null;
    this.drawn = [];
    this.chip.hidden = true;
    const { bearing, pitch } = this.saved ?? { bearing: 0, pitch: 0 };
    this.saved = null;
    this.relocking = { bearing, pitch };
    // Level out where the operator is looking, then lock again: back to
    // exactly the angles the map had, north-up and flat.
    const relock = () => {
      if (this.active) return; // pressed E again while levelling
      this.relocking = null;
      relockCamera(this.map);
      if (this.map.getBearing() !== bearing || this.map.getPitch() !== pitch) this.map.jumpTo({ bearing, pitch });
    };
    if (instant || reducedMotion() || (this.map.getBearing() === bearing && this.map.getPitch() === pitch)) {
      relock();
    } else {
      this.map.once('moveend', relock);
      this.map.easeTo({ bearing, pitch, duration: 700 });
    }
    this.notify();
  }

  private install(): void {
    if (!this.map.getLayer(this.layer.id)) this.map.addLayer(this.layer);
    this.undim?.();
    this.undim = dimLayers(this.map, AIR_LAYERS, SHADOW);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** After each flat-map render: the aircraft in view, at their heights. */
  private frame(): void {
    // The timeline is showing another moment: so must we (nothing live).
    if (this.tracks.isHidden) {
      for (const name of ['trails', 'drops', 'aircraft']) this.layer.set(name, null);
      this.drawn = [];
      return;
    }
    const view = this.tracks.viewBox();
    const selectedId = this.selection.id;
    const drawn: StackAircraft[] = [];
    for (const track of this.store.all()) {
      if (track.domain !== 'air') continue;
      const pos = this.tracks.positionOf(track.id);
      if (!pos) continue;
      const selected = track.id === selectedId;
      if (!selected && (!this.filter.passes(track, pos.stale) || !inViewBox(view, pos.lon, pos.lat))) continue;
      drawn.push({ id: track.id, affiliation: track.affiliation, lon: pos.lon, lat: pos.lat, altM: track.altitudeM, stale: pos.stale, selected });
    }
    const center = this.map.getCenter();
    const ref = { x: mercatorX(center.lng), y: mercatorY(center.lat) };
    if (this.trailsStale) this.rebuildTrails(drawn, ref);
    for (const a of drawn) {
      const end = this.trailEnds.get(a.id);
      if (end) a.trailEnd = end;
    }
    const { lines, points } = buildAircraft(drawn, ref);
    this.layer.set('drops', lines);
    this.layer.set('aircraft', points);
    this.drawn = drawn;
  }

  /** Trails change only when reports arrive (or the view, selection or trail setting changes). */
  private rebuildTrails(drawn: readonly StackAircraft[], ref: { x: number; y: number }): void {
    this.trailsStale = false;
    this.trailEnds.clear();
    const mode = this.trails.mode;
    const inputs: TrailInput[] = [];
    // Zoomed out a trail at altitude is a squiggle under a pixel (the flat map
    // stops drawing speed leaders there too), so only the selected one is drawn.
    const all = mode === 'all' && this.map.getZoom() >= SYMBOL_MIN_ZOOM;
    if (mode !== 'off') {
      for (const a of drawn) {
        if (!all && !a.selected) continue;
        const since = this.altitudes.since(a.id);
        if (since === undefined) continue;
        const points = liftTrail(this.store.trail(a.id), (t) => this.altitudes.at(a.id, t), undefined, since);
        const end = points.at(-1);
        if (!end) continue;
        this.trailEnds.set(a.id, end);
        inputs.push({ affiliation: a.affiliation, stale: a.stale, selected: a.selected, points });
      }
    }
    this.layer.set('trails', buildTrails(inputs, ref));
  }

  private pick(point: { x: number; y: number }, pad: number): string | null {
    const projection = this.layer.projection;
    if (!projection) return null;
    const canvas = this.map.getCanvas();
    return pickAircraft(projection, this.drawn, point, pad, canvas.clientWidth, canvas.clientHeight);
  }
}
