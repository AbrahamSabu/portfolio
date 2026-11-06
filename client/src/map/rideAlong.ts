import { deadReckon, distanceM, ruleFor, type Track } from '@watchfloor/shared';
import type { LightSpecification, Map as MapLibreMap, ProjectionSpecification, SkySpecification } from 'maplibre-gl';
import type { PictureFilter } from '../state/pictureFilter';
import type { SelectedDetails } from '../state/selectedDetails';
import type { Selection } from '../state/selection';
import type { ServerClock } from '../state/clock';
import type { TrackStore } from '../state/trackStore';
import { parseRoute, RideHud, routeLookupFor } from '../ui/rideHud';
import { reducedMotion } from './cameraLock';
import { Layer3d, LOOK, VertexWriter } from './layer3d';
import { LIGHT_RANGE_M, LIGHT_RGB, lightLook, lightsFor } from './navLights';
import { dimLayers } from './paintDim';
import { mercatorX, mercatorY } from './project3d';
import { PoseSmoother, type Pose } from './ridePose';
import { addTerrain, removeTerrain, shadeTerrain } from './rideTerrain';
import { shapeFor } from './shapes';
import { AIR_LAYERS } from './stackMode';
import { skyLook, sunAt } from './sunSky';
import type { TrackLayer } from './trackLayer';
import './ride.css';

/** Eight degrees below the horizon: the ground ahead, the sky above. */
const PITCH = 82;
/** A cockpit sees wider than MapLibre's default 37° (vertical). */
const FOV = 60;
const MAX_PITCH = 85;
/** Never put the camera into the ground: terrain tiles are coarser than a runway. */
const CLEARANCE_M = 30;
/** The flat map's trails (trailLayer.ts): lines on the ground make no sense from a cockpit. */
const TRAIL_LAYERS = ['track-trails', 'track-trail-heads', 'track-trail-blips'];
/** The sun moves a degree in four minutes: relight once a minute. */
const RELIGHT_MS = 60_000;
const FLY_IN_MS = 3_000;

/** An aircraft reporting an altitude: anything less can't be ridden. */
export function canRide(track: Track | undefined): track is Track & { altitudeM: number } {
  return track !== undefined && track.domain === 'air' && track.altitudeM !== undefined;
}

/** Everything a ride changes, so leaving puts back exactly this. */
interface SavedMap {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  roll: number;
  fov: number;
  maxPitch: number;
  clamped: boolean;
  projection: ProjectionSpecification | undefined;
  sky: SkySpecification | undefined;
  light: LightSpecification | undefined;
  follow: boolean;
}

type CameraMethod = 'flyTo' | 'easeTo' | 'fitBounds' | 'panTo' | 'zoomTo';

/**
 * Ride Along (J, or the button in an aircraft's details): the camera drops
 * into the selected aircraft, at its position, altitude and heading, pitched
 * towards the horizon, and follows it by dead reckoning. Real terrain below,
 * a sky lit from the sun's true position, and every other aircraft as its
 * navigation lights. Esc, J, any pan or zoom, choosing another track, or the
 * aircraft vanishing puts the map back exactly as it was.
 */
export class RideAlong {
  private readonly lights = new Layer3d('ride-lights');
  private readonly hud: RideHud;
  private readonly listeners = new Set<() => void>();
  /** Routes by callsign (null: looked up, none known), fetched once each. */
  private readonly routes = new Map<string, string | null>();
  private readonly smoother = new PoseSmoother();
  private active = false;
  private rideId: string | null = null;
  private saved: SavedMap | null = null;
  private flying = false;
  private frameRequest = 0;
  private lastFrame = 0;
  private lastLight = 0;
  private lastHud = 0;
  private undim: (() => void) | null = null;
  private unhook: (() => void) | null = null;
  /** The camera methods as MapLibre wrote them, for the ride's own fly-in. */
  private flyTo: MapLibreMap['flyTo'];
  /** Called before a ride starts, so another camera mode (the Stack) can step aside first. */
  beforeStart: () => void = () => {};

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly tracks: TrackLayer,
    private readonly selection: Selection,
    private readonly filter: PictureFilter,
    private readonly details: SelectedDetails,
  ) {
    this.flyTo = map.flyTo.bind(map);
    this.lights.depthTest = true; // hills hide the lights behind them
    this.lights.set('lights', null);
    this.hud = new RideHud(map.getContainer());

    selection.subscribe((id) => {
      if (this.active && id !== this.rideId) this.stop();
    });
    // Any pan, zoom or turn by the operator hands the map back.
    for (const type of ['dragstart', 'wheel', 'touchstart', 'boxzoomstart'] as const) {
      map.on(type, () => {
        if (this.active) this.stop();
      });
    }
    map.on('movestart', (event) => {
      if (this.active && event.originalEvent) this.stop(); // keyboard pans and the like
    });
    // Esc leaves the ride, before the page's own Escape (which would also clear the selection).
    window.addEventListener(
      'keydown',
      (event) => {
        if (!this.active || event.key !== 'Escape') return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
        if (document.querySelector('dialog[open]')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.stop();
      },
      true,
    );
  }

  get value(): boolean {
    return this.active;
  }

  get riding(): string | null {
    return this.rideId;
  }

  set(on: boolean): void {
    if (on) this.start();
    else this.stop();
  }

  toggle(): void {
    this.set(!this.active);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Ride along with an aircraft (the selected one by default). */
  start(id: string | null = this.selection.id): void {
    if (this.active || !id) return;
    const track = this.store.get(id);
    if (!canRide(track)) return;
    this.beforeStart();
    const map = this.map;
    const center = map.getCenter();
    this.saved = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      roll: map.getRoll(),
      fov: map.getVerticalFieldOfView(),
      maxPitch: map.getMaxPitch(),
      clamped: map.getCenterClampedToGround(),
      projection: map.getProjection(),
      sky: map.getSky(),
      light: map.getLight(),
      follow: this.selection.follow,
    };
    this.active = true;
    this.rideId = id;
    this.selection.setFollow(false); // follow mode would fight the camera
    this.unhook = this.handBackOnCameraMoves();

    // Flat Mercator: MapLibre's terrain and haze aren't fully supported on
    // the globe, and from an aircraft the globe is flat anyway.
    map.setProjection({ type: 'mercator' });
    map.setMaxPitch(MAX_PITCH);
    map.setCenterClampedToGround(false);
    map.setVerticalFieldOfView(FOV);
    const look = skyLook(sunAt(this.clock.now(), track.lat, track.lon));
    addTerrain(map, look);
    map.setSky(look.sky);
    map.setLight(look.light);
    this.lastLight = performance.now();
    if (!map.getLayer(this.lights.id)) map.addLayer(this.lights);
    // The flat aircraft and trails would lie on the ground like decals: the lights replace them.
    this.undim = dimLayers(map, [...AIR_LAYERS, ...TRAIL_LAYERS], 0);
    map.getContainer().classList.add('riding');
    this.hud.show();
    this.lookUpRoute(track);

    const now = this.clock.now();
    const pose = this.estimate(track, now);
    const camera = this.cameraAt(pose);
    this.flying = true;
    const arrive = () => {
      if (!this.active || !this.flying) return;
      this.flying = false;
      const current = this.store.get(id);
      if (canRide(current)) this.smoother.startFrom(pose, this.estimate(current, this.clock.now()), current.observedAt);
    };
    if (reducedMotion()) {
      map.jumpTo(camera);
      arrive();
    } else {
      map.once('moveend', arrive);
      this.flyTo({ ...camera, duration: FLY_IN_MS, essential: true });
    }
    this.lastFrame = performance.now();
    this.frameRequest = requestAnimationFrame(this.frame);
    this.notify();
  }

  /** Hand the map back exactly as it was. */
  stop(): void {
    if (!this.active) return;
    const map = this.map;
    const saved = this.saved!;
    this.active = false;
    this.rideId = null;
    this.flying = false;
    cancelAnimationFrame(this.frameRequest);
    this.unhook?.();
    this.unhook = null;
    if (map.getLayer(this.lights.id)) map.removeLayer(this.lights.id);
    this.lights.set('lights', null);
    this.undim?.();
    this.undim = null;
    removeTerrain(map);
    map.setSky(saved.sky ?? {});
    if (saved.light) map.setLight(saved.light);
    map.setVerticalFieldOfView(saved.fov);
    map.setCenterClampedToGround(saved.clamped);
    map.setProjection(saved.projection ?? { type: 'mercator' });
    map.jumpTo({ center: saved.center, zoom: saved.zoom, bearing: saved.bearing, pitch: saved.pitch, roll: saved.roll });
    map.setMaxPitch(saved.maxPitch);
    map.getContainer().classList.remove('riding');
    this.hud.hide();
    if (saved.follow) this.selection.setFollow(true);
    this.saved = null;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * While riding, anything else that moves the camera (a search pick, an
   * alert's Show, the tour, Fit path) first ends the ride, so it starts from
   * the map as it was. MapLibre has no hook for that, so the camera methods
   * are wrapped on this map for the length of the ride, and put back after.
   */
  private handBackOnCameraMoves(): () => void {
    const map = this.map as unknown as Record<CameraMethod, (...args: unknown[]) => unknown>;
    const originals = new Map<CameraMethod, (...args: unknown[]) => unknown>();
    for (const method of ['flyTo', 'easeTo', 'fitBounds', 'panTo', 'zoomTo'] as const) {
      const original = map[method];
      originals.set(method, original);
      map[method] = (...args: unknown[]) => {
        this.stop();
        return original.apply(this.map, args);
      };
    }
    return () => {
      for (const [method, original] of originals) map[method] = original;
    };
  }

  /** Where the aircraft is now by dead reckoning, held at the stale threshold like the flat map. */
  private estimate(track: Track & { altitudeM: number }, now: number): Pose {
    const rule = ruleFor(track, this.store.staleness);
    const p = deadReckon(track, track.courseDeg, track.speedMps, Math.min(now - track.observedAt, rule.staleAfterMs));
    return { lat: p.lat, lon: p.lon, altM: track.altitudeM, bearing: track.courseDeg };
  }

  private cameraAt(pose: Pose) {
    // Keep clear of the ground where the terrain is loaded (null where it isn't yet).
    const ground = this.map.queryTerrainElevation([pose.lon, pose.lat]) ?? -Infinity;
    const alt = Math.max(pose.altM, ground + CLEARANCE_M);
    return this.map.calculateCameraOptionsFromCameraLngLatAltRotation([pose.lon, pose.lat], alt, pose.bearing, PITCH);
  }

  private readonly frame = (time: number) => {
    if (!this.active || !this.rideId) return;
    this.frameRequest = requestAnimationFrame(this.frame);
    const track = this.store.get(this.rideId);
    if (!canRide(track) || this.tracks.isHidden) {
      this.stop();
      return;
    }
    const dt = (time - this.lastFrame) / 1000;
    this.lastFrame = time;
    const now = this.clock.now();
    const estimate = this.estimate(track, now);
    const pose = this.flying ? estimate : this.smoother.next(estimate, track.observedAt, Math.min(dt, 0.25));
    if (!this.flying) this.map.jumpTo(this.cameraAt(pose));
    this.drawLights(pose, now);

    if (time - this.lastHud > 250) {
      this.lastHud = time;
      const stale = now - track.observedAt > ruleFor(track, this.store.staleness).staleAfterMs;
      const route = track.callsign ? (this.routes.get(track.callsign.trim()) ?? undefined) : undefined;
      this.hud.update(track, stale, this.isPrivate(track), route);
    }
    if (time - this.lastLight > RELIGHT_MS) {
      this.lastLight = time;
      const look = skyLook(sunAt(now, pose.lat, pose.lon));
      this.map.setSky(look.sky);
      this.map.setLight(look.light);
      shadeTerrain(this.map, look);
    }
  };

  /** Every other aircraft within range, as the lights a pilot here would see. */
  private drawLights(eye: Pose, now: number): void {
    const writer = new VertexWriter({ x: mercatorX(eye.lon), y: mercatorY(eye.lat) });
    const steady = reducedMotion();
    const wallClock = performance.now();
    // A cheap box test before measuring distances: 150 km is under 1.4° of latitude.
    const dLat = LIGHT_RANGE_M / 111_000;
    const dLon = dLat / Math.max(0.05, Math.cos((eye.lat * Math.PI) / 180));
    for (const track of this.store.all()) {
      if (track.domain !== 'air' || track.id === this.rideId || track.altitudeM === undefined) continue;
      if (Math.abs(track.lat - eye.lat) > dLat + 0.5 || Math.abs(((track.lon - eye.lon + 540) % 360) - 180) > dLon + 0.5) continue;
      const rule = ruleFor(track, this.store.staleness);
      const age = now - track.observedAt;
      const stale = age > rule.staleAfterMs;
      if (!this.filter.passes(track, stale)) continue;
      const at = deadReckon(track, track.courseDeg, track.speedMps, Math.min(age, rule.staleAfterMs));
      const ground = distanceM(eye, at);
      if (ground > LIGHT_RANGE_M) continue;
      const { size, alpha } = lightLook(Math.hypot(ground, track.altitudeM - eye.altM));
      const other = { id: track.id, platform: track.platform, heavy: shapeFor(track).scale === 1, lat: at.lat, lon: at.lon, altM: track.altitudeM, courseDeg: track.courseDeg };
      for (const light of lightsFor(other, eye, wallClock, steady)) {
        const [r, g, b] = LIGHT_RGB[light.color];
        // An estimate (no recent report) shows dimmer.
        const a = alpha * light.intensity * (stale ? 0.5 : 1);
        writer.push(mercatorX(light.lon), mercatorY(light.lat), light.altM, [r, g, b, a], size, LOOK.light);
      }
    }
    this.lights.set('lights', writer.batch('points'));
  }

  private isPrivate(track: Track): boolean {
    return this.details.id === track.id && this.details.details?.private === true;
  }

  /** The route, from hexdb.io, for a live aircraft's callsign: once per callsign, quietly. */
  private lookUpRoute(track: Track): void {
    const url = routeLookupFor(track, this.isPrivate(track));
    const callsign = track.callsign?.trim();
    if (!url || !callsign || this.routes.has(callsign)) return;
    this.routes.set(callsign, null);
    void fetch(url)
      .then((res) => (res.ok ? res.json() : undefined))
      .then((json: unknown) => this.routes.set(callsign, parseRoute(json) ?? null))
      .catch(() => {
        // Unavailable: the HUD shows what Watchfloor knows.
      });
  }
}
