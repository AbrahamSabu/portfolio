import { makeTrackId, type Provider, type Track } from '@watchfloor/shared';
import { categoryFromCode, platformFor } from '../adsb/category';
import type { MapOutcome } from '../opensky/mapState';

/**
 * Translating readsb / ADSBx v2 JSON aircraft (adsb.lol, adsb.fi) into our
 * Track shape. Pure, so every rule is tested against recorded responses.
 * Field reference: https://github.com/wiedehopf/readsb/blob/dev/README-json.md
 */
const FEET_TO_M = 0.3048;
const KNOTS_TO_MPS = 1852 / 3600;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @param nowMs the response's own `now`, so timing is the source's, not ours.
 * @param provider the network that answered.
 */
export function mapAircraft(ac: unknown, nowMs: number, provider: Provider): MapOutcome {
  if (typeof ac !== 'object' || ac === null) return { kind: 'skip', reason: 'malformed' };
  const a = ac as Record<string, unknown>;
  // A leading '~' marks a non-ICAO address (TIS-B and similar): not a stable
  // transponder id, so it can't merge with other providers. Skip it.
  if (typeof a.hex !== 'string' || !/^[0-9a-f]{6}$/i.test(a.hex.trim())) return { kind: 'skip', reason: 'malformed' };
  const id = makeTrackId('adsb', a.hex.trim().toLowerCase());

  if (a.alt_baro === 'ground') return { kind: 'on-ground', id };

  const lat = num(a.lat);
  const lon = num(a.lon);
  // seen_pos is how many seconds before `now` the position was received.
  const age = num(a.seen_pos) ?? num(a.seen);
  if (lat === null || lon === null || age === null) return { kind: 'skip', reason: 'no-position' };

  const gs = num(a.gs);
  const courseDeg = num(a.track);
  if (gs === null || courseDeg === null) return { kind: 'skip', reason: 'no-velocity' };

  const platform = platformFor(categoryFromCode(a.category));
  if (platform === null) return { kind: 'skip', reason: 'not-aircraft' };

  const report: Track = {
    id,
    source: 'adsb',
    domain: 'air',
    platform,
    affiliation: 'unknown',
    lat,
    lon,
    courseDeg,
    speedMps: gs * KNOTS_TO_MPS,
    observedAt: Math.round(nowMs - age * 1000),
    provider,
  };
  // Geometric before barometric, as for OpenSky. Both are in feet here.
  const altFt = num(a.alt_geom) ?? num(a.alt_baro);
  if (altFt !== null) report.altitudeM = altFt * FEET_TO_M;
  const callsign = typeof a.flight === 'string' ? a.flight.trim() : '';
  if (callsign) report.callsign = callsign;
  if (typeof a.squawk === 'string') report.squawk = a.squawk.trim();
  return { kind: 'airborne', report };
}

/** The aircraft list and the response time, or null for a body of the wrong shape. */
export function parseAircraftResponse(body: unknown): { now: number; ac: unknown[] } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.ac) || num(b.now) === null) return null;
  return { now: b.now as number, ac: b.ac };
}
