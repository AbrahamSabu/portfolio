import {
  distanceM,
  ruleFor,
  SKY_RADIUS_M,
  type SkyAircraft,
  type SkyResponse,
  type StalenessRules,
  type Track,
  type TrackDetails,
} from '@watchfloor/shared';

/** Enough for the busiest terminal area; the phone draws them all. */
const MAX_AIRCRAFT = 80;
/** Below this it's on the ground or taxiing: not something you point at in the sky. */
const MIN_ALTITUDE_M = 60;

/**
 * The live aircraft within SKY_RADIUS_M of one point, nearest first: the
 * plane-spotter's answer. Stale tracks are left out (their positions are
 * guesses), and a private aircraft keeps only what it is and where.
 */
export function nearbyAircraft(
  tracks: Iterable<Track>,
  at: { lat: number; lon: number },
  now: number,
  staleness: StalenessRules,
  detailsOf: (track: Track) => TrackDetails,
): SkyResponse {
  const near: { track: Track; d: number }[] = [];
  for (const t of tracks) {
    if (t.domain !== 'air' || t.altitudeM === undefined || t.altitudeM < MIN_ALTITUDE_M) continue;
    if (now - t.observedAt > ruleFor(t, staleness).staleAfterMs) continue;
    const d = distanceM(at, t);
    if (d <= SKY_RADIUS_M) near.push({ track: t, d });
  }
  near.sort((a, b) => a.d - b.d);
  const aircraft = near.slice(0, MAX_AIRCRAFT).map(({ track: t }): SkyAircraft => {
    const details = detailsOf(t);
    const out: SkyAircraft = {
      id: t.id,
      lat: t.lat,
      lon: t.lon,
      altitudeM: t.altitudeM!,
      speedMps: t.speedMps,
      courseDeg: t.courseDeg,
      observedAt: t.observedAt,
    };
    if (!details.private) {
      if (t.callsign) out.callsign = t.callsign;
      if (details.airline) out.airline = details.airline;
    }
    if (t.model) out.model = t.model;
    if (t.typeCode) out.typeCode = t.typeCode;
    if (details.military || t.platform === 'military-aircraft' || t.platform === 'military-helicopter') out.military = true;
    return out;
  });
  return { serverTime: now, aircraft };
}

/**
 * Phones running the plane-spotter don't hold a WebSocket, so the hub can't
 * see them. Each request records the phone's patch of sky for a couple of
 * minutes: while any is recorded the feeds stay awake, and the regional
 * feeds (adsb.lol, adsb.fi) poll that patch as if a browser were viewing it.
 * Patches are half-degree cells, so a phone walking around doesn't change
 * the polled areas on every request (each change can trigger a poll).
 */
export class SkyWatchers {
  private readonly cells = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = 2 * 60_000) {
    this.ttlMs = ttlMs;
  }

  get active(): boolean {
    return this.cells.size > 0;
  }

  /** Record a phone at this point. Returns true when the set of cells changed. */
  touch(lat: number, lon: number, now: number): boolean {
    const key = `${Math.floor(lat * 2) / 2},${Math.floor(lon * 2) / 2}`;
    const isNew = !this.cells.has(key);
    this.cells.set(key, now + this.ttlMs);
    return isNew;
  }

  /** Forget cells nobody asked about lately. Returns true when any went. */
  expire(now: number): boolean {
    let changed = false;
    for (const [key, until] of this.cells) {
      if (until < now) {
        this.cells.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  /** Each cell with a half-degree margin, as the feeds' areas. */
  areas(): { south: number; west: number; north: number; east: number }[] {
    return [...this.cells.keys()].map((key) => {
      const [lat, lon] = key.split(',').map(Number) as [number, number];
      return { south: lat - 0.5, west: lon - 0.5, north: lat + 1, east: lon + 1 };
    });
  }
}
