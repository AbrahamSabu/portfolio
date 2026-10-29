import type { PathBackfill, PathMessage } from '@watchfloor/shared';
import { createLogger } from '../log';
import type { FlightTrackResult } from '../feeds/opensky/openSkyFeed';
import { icao24Of } from '../feeds/opensky/mapTrack';
import type { TrackStore } from '../trackStore';

const log = createLogger('paths');

export type FlightTrackLookup = (icao24: string) => Promise<FlightTrackResult>;

/** Each lookup costs 4 OpenSky credits; 60 an hour stays well inside a 4,000-a-day account. */
const DEFAULT_LOOKUPS_PER_HOUR = 60;
/** After a failed lookup for an aircraft, don't ask about it again for this long. */
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;
/** A path whose first point is below this was first seen climbing out: we have the takeoff already. */
const NEAR_GROUND_M = 600;
const HOUR_MS = 3_600_000;

export interface PathServiceOptions {
  store: TrackStore;
  /** OpenSky's flight-track lookup; without it, paths are only what we've seen. */
  lookup?: FlightTrackLookup;
  maxLookupsPerHour?: number;
  now?: () => number;
}

/**
 * Answers a browser's request for one track's path.
 *
 * It replies at once with the history we hold. If that starts mid-flight (an
 * aircraft we first saw at cruise), it asks OpenSky for the flight since
 * takeoff, merges the earlier part into the store, and replies again. Lookups
 * are capped per hour, never repeated for an aircraft once answered, shared
 * when several browsers ask at once, and paused while OpenSky says to wait.
 */
export class PathService {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly failedUntil = new Map<string, number>();
  private readonly lookupTimes: number[] = [];
  private pausedUntil = 0;
  private readonly now: () => number;

  constructor(private readonly opts: PathServiceOptions) {
    this.now = opts.now ?? Date.now;
  }

  request(id: string, send: (message: PathMessage) => void): void {
    const store = this.opts.store;
    if (!store.get(id)) return;
    const job = this.inFlight.get(id) ?? this.startBackfill(id);
    send(this.message(id, job ? 'pending' : undefined));
    if (!job) return;
    void job.then(() => {
      if (store.get(id)) send(this.message(id));
    });
  }

  /** Lookups made in the last hour, for /healthz. */
  get lookupsLastHour(): number {
    this.forgetOldLookups();
    return this.lookupTimes.length;
  }

  private message(id: string, override?: PathBackfill): PathMessage {
    const paths = this.opts.store.paths;
    return {
      type: 'path',
      serverTime: this.now(),
      id,
      points: paths.get(id),
      backfill: override ?? (paths.info(id)?.backfill === 'opensky' ? 'opensky' : 'none'),
    };
  }

  /** Start a lookup if this path wants one and the budget allows; null otherwise. */
  private startBackfill(id: string): Promise<void> | null {
    const lookup = this.opts.lookup;
    const track = this.opts.store.get(id);
    const icao24 = icao24Of(id);
    const info = this.opts.store.paths.info(id);
    if (!lookup || !track || track.domain !== 'air' || !icao24 || !info || info.backfill) return null;
    if (info.firstAltitudeM !== undefined && info.firstAltitudeM < NEAR_GROUND_M) return null;
    const now = this.now();
    if (now < this.pausedUntil || now < (this.failedUntil.get(id) ?? 0)) return null;
    this.forgetOldLookups();
    if (this.lookupTimes.length >= (this.opts.maxLookupsPerHour ?? DEFAULT_LOOKUPS_PER_HOUR)) return null;
    this.lookupTimes.push(now);

    const job = lookup(icao24)
      .then((result) => this.apply(id, result))
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, job);
    return job;
  }

  private apply(id: string, result: FlightTrackResult): void {
    const paths = this.opts.store.paths;
    switch (result.kind) {
      case 'ok':
        paths.prepend(id, result.points, 'opensky');
        return;
      case 'none':
        paths.markNoBackfill(id);
        return;
      case 'limited':
        this.pausedUntil = this.now() + result.retryAfterMs;
        log.warn('OpenSky track lookups rate limited', { retryAfterS: Math.round(result.retryAfterMs / 1000) });
        return;
      case 'failed':
        this.failedUntil.set(id, this.now() + RETRY_AFTER_FAILURE_MS);
        log.debug('OpenSky track lookup failed', { id, detail: result.detail });
        return;
    }
  }

  private forgetOldLookups(): void {
    const cutoff = this.now() - HOUR_MS;
    while (this.lookupTimes.length > 0 && this.lookupTimes[0]! <= cutoff) this.lookupTimes.shift();
    for (const [id, until] of this.failedUntil) if (until <= this.now()) this.failedUntil.delete(id);
  }
}
