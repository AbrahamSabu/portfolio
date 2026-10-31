import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import type { TourStop } from '../state/tourStops';

/** How long each stop holds after the camera settles (a stop can ask for more). */
const DWELL_MS = 8_000;
/** If a flight somehow never lands, move on anyway rather than hang. */
const SAFETY_MS = 25_000;

/** What the tour does with the selection when a stop rides along with a track. */
export interface TourFollow {
  /** Select the track and follow it. */
  engage(id: string): void;
  /** Stop following but keep the selection (the operator took over mid-ride). */
  release(): void;
  /** Stop following and clear the selection (moving on to a place). */
  clear(): void;
}

/**
 * The cinematic tour (G, or the Layers menu): the camera rides from stop to
 * stop — emergencies, military flights it locks onto and follows, fresh
 * hazards, the top stories, busy chokepoints — dwelling on each, looping
 * until the operator takes over. Any pointer, scroll or key stops it (the
 * keys in main.ts): a display that keeps moving against the operator's
 * hand is worse than no tour at all.
 */
export class Tour {
  private on = false;
  private cursor = 0;
  private timer: number | undefined;
  private current: TourStop | null = null;
  /** True from take-off to the first moveend. Riding along, follow mode's
   * per-frame jumpTo fires moveend constantly; without this flag each one
   * restarted the dwell and the tour never left its first flight. */
  private flying = false;
  private readonly title: HTMLElement;

  constructor(
    private readonly map: MapLibreMap,
    private readonly root: HTMLElement,
    private readonly stops: () => TourStop[],
    private readonly follow: TourFollow,
  ) {
    this.title = root.querySelector('[data-title]')!;
    root.querySelector('[data-stop]')!.addEventListener('click', () => this.stop());
    // Any pointer or wheel anywhere is the operator taking over. Capture, so
    // a click a panel swallows still counts.
    document.addEventListener('pointerdown', () => this.stop(), { capture: true });
    document.addEventListener('wheel', () => this.stop(), { capture: true, passive: true });
    // Our own flight settling is what starts the dwell at a stop.
    this.map.on('moveend', () => this.landed());
  }

  get active(): boolean {
    return this.on;
  }

  start(): void {
    if (this.on) return;
    this.on = true;
    this.root.hidden = false;
    this.cursor = 0;
    this.step();
  }

  stop(): void {
    if (!this.on) return;
    this.on = false;
    this.root.hidden = true;
    window.clearTimeout(this.timer);
    this.map.stop();
    // Keep whatever was selected on screen: the operator may have stopped
    // exactly because they want a closer look at it.
    this.follow.release();
  }

  private landed(): void {
    if (!this.on || !this.flying) return;
    this.flying = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.step(), this.current?.dwellMs ?? DWELL_MS);
  }

  private step(): void {
    if (!this.on) return;
    const stops = this.stops();
    const stop = stops.length > 0 ? stops[this.cursor % stops.length]! : this.spin();
    this.cursor += 1;
    this.current = stop;
    this.flying = true;
    this.title.textContent = stop.title;
    // Fly first, then engage: follow mode recentres whenever the map is not
    // already moving, so engaging before the flight would teleport.
    fly(this.map, { center: stop.center, zoom: stop.zoom }, true);
    if (stop.trackId) this.follow.engage(stop.trackId);
    else this.follow.clear();
    this.timer = window.setTimeout(() => this.step(), SAFETY_MS);
  }

  /** Nothing is happening anywhere: drift on round the globe instead. */
  private spin(): TourStop {
    const centre = this.map.getCenter();
    return { title: 'Quiet watch · the world', center: [centre.lng + 70, 15], zoom: Math.min(this.map.getZoom(), 2.4) };
  }
}
