import { parseSatelliteCatalog, type SkyAircraft } from '@watchfloor/shared';
import { visibleToEye } from '../space/orbit';
import type { Look } from '../space/propagate';
import type { WorkerReply, WorkerRequest } from '../space/workerProtocol';
import type { SkyPosition } from './skyMath';

/** The ISS's first module, Zarya: the catalogue number the station goes by. */
const ISS_ID = 25544;
/** It crosses the sky at about a degree a second at most: four looks a second keep it well inside a 12° lock. */
const LOOK_MS = 250;
/** Its elements stay good for days; the server refreshes them every few hours. */
const REFRESH_MS = 60 * 60_000;

export interface IssSighting extends Look {
  /** Lit by the sun in a dark enough sky, and high enough to see. */
  visible: boolean;
}

/**
 * The ISS for the phone spotter: its elements from our server (only the
 * space stations group, a few kilobytes) and its place in the observer's
 * sky from the same SGP4 worker the map uses. The page shows it only when it
 * can actually be seen, the way people go out to look for it.
 */
export class IssWatch {
  private worker: Worker | null = null;
  private loaded = false;
  private seq = 0;
  private latest: IssSighting | null = null;

  constructor(
    private readonly observer: () => { lat: number; lon: number } | null,
    private readonly now: () => number,
  ) {}

  start(): void {
    void this.load();
    window.setInterval(() => this.look(), LOOK_MS);
    window.setInterval(() => void this.load(), REFRESH_MS);
  }

  get sighting(): IssSighting | null {
    return this.latest;
  }

  private async load(): Promise<void> {
    try {
      const res = await fetch('/api/satellites?groups=stations', { cache: 'no-cache' });
      if (!res.ok) return;
      const iss = parseSatelliteCatalog(await res.json())
        ?.groups.flatMap((g) => g.satellites)
        .find((s) => s.id === ISS_ID);
      if (!iss) return;
      this.worker ??= this.createWorker();
      this.post({ type: 'load', satellites: [iss] });
      this.loaded = true;
    } catch {
      // No server, or no satellites on it: the spotter carries on with aircraft.
    }
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('../space/satWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type !== 'look') return;
      this.latest = reply.look ? { ...reply.look, visible: visibleToEye(reply.look) } : null;
    };
    return worker;
  }

  private post(message: WorkerRequest): void {
    this.worker?.postMessage(message);
  }

  private look(): void {
    const o = this.observer();
    if (!this.loaded || !o || document.hidden) return;
    this.post({ type: 'look', seq: ++this.seq, index: 0, t: this.now(), observer: { lat: o.lat, lon: o.lon } });
  }
}

/** Satellite ids on the spotter, kept apart from aircraft ids (`adsb:…`). */
export const ISS_SKY_ID = `sat:${ISS_ID}`;

/**
 * The ISS as the spotter's list holds aircraft, so pointing, locking and
 * tapping work for it unchanged. Its distance is the straight line to it.
 */
export function issAsSeen(s: IssSighting, now: number): { plane: SkyAircraft; pos: SkyPosition } {
  return {
    plane: {
      id: ISS_SKY_ID,
      callsign: 'ISS',
      model: 'International Space Station',
      lat: 0,
      lon: 0,
      altitudeM: s.altKm * 1000,
      speedMps: s.speedKmS * 1000,
      courseDeg: 0,
      observedAt: now,
    },
    pos: { azimuthDeg: s.azimuthDeg, elevationDeg: s.elevationDeg, groundM: s.rangeKm * 1000 },
  };
}
