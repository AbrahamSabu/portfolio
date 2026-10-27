import { makeTrackId, type Track } from '@watchfloor/shared';
import { platformFor } from '../adsb/category';

/**
 * Translating OpenSky state vectors into our Track shape. Pure functions, no
 * I/O, so every rule here is tested against recorded responses.
 *
 * A state vector is a positional array, documented at
 * https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
 * Only the indexes we use are named.
 */
const ICAO24 = 0;
const CALLSIGN = 1;
const TIME_POSITION = 3;
const LAST_CONTACT = 4;
const LONGITUDE = 5;
const LATITUDE = 6;
const BARO_ALTITUDE = 7;
const ON_GROUND = 8;
const VELOCITY = 9;
const TRUE_TRACK = 10;
const GEO_ALTITUDE = 13;
const CATEGORY = 17; // only present with extended=1

export type SkipReason = 'malformed' | 'no-position' | 'no-velocity' | 'not-aircraft';

export type MapOutcome =
  /** An airborne aircraft, ready for sink.upsert. */
  | { kind: 'airborne'; report: Track }
  /** On the ground: we know it has landed (or not taken off), so it leaves the picture. */
  | { kind: 'on-ground'; id: string }
  | { kind: 'skip'; reason: SkipReason };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function mapState(row: unknown): MapOutcome {
  if (!Array.isArray(row) || row.length < 17) return { kind: 'skip', reason: 'malformed' };
  const icao24 = row[ICAO24];
  if (typeof icao24 !== 'string' || !/^[0-9a-f]{6}$/i.test(icao24.trim())) {
    return { kind: 'skip', reason: 'malformed' };
  }
  const id = makeTrackId('adsb', icao24.trim().toLowerCase());

  if (row[ON_GROUND] === true) return { kind: 'on-ground', id };

  const lat = num(row[LATITUDE]);
  const lon = num(row[LONGITUDE]);
  // Position time is when this lat/lon was measured. last_contact can be newer
  // (any message, not necessarily a position), so it is only the fallback.
  const seconds = num(row[TIME_POSITION]) ?? num(row[LAST_CONTACT]);
  if (lat === null || lon === null || seconds === null) return { kind: 'skip', reason: 'no-position' };

  // Without both we can't dead-reckon or draw a speed leader, and guessing would mislead.
  const speedMps = num(row[VELOCITY]);
  const courseDeg = num(row[TRUE_TRACK]);
  if (speedMps === null || courseDeg === null) return { kind: 'skip', reason: 'no-velocity' };

  const platform = platformFor(row[CATEGORY]);
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
    speedMps,
    observedAt: seconds * 1000,
  };
  // Geometric (GNSS) altitude first: barometric altitude assumes standard
  // pressure (1013.25 hPa) and can be hundreds of metres off true height.
  // GNSS height is above the WGS84 ellipsoid, about 45 m above sea level over
  // the Channel, which is well inside the error we're avoiding.
  const altitudeM = num(row[GEO_ALTITUDE]) ?? num(row[BARO_ALTITUDE]);
  if (altitudeM !== null) report.altitudeM = altitudeM;
  const callsign = typeof row[CALLSIGN] === 'string' ? row[CALLSIGN].trim() : '';
  if (callsign) report.callsign = callsign;
  return { kind: 'airborne', report };
}

/**
 * Pull the state vector rows out of a /states/all response body. OpenSky sends
 * `"states": null` when nothing is in the box, which is an empty sky, not an
 * error. Returns null only for a body that isn't the expected shape.
 */
export function parseStatesResponse(body: unknown): unknown[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const states = (body as Record<string, unknown>).states;
  if (states === null) return [];
  return Array.isArray(states) ? states : null;
}
