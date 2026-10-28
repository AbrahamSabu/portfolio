import { TRACK_VALUES, type Track } from './track';
import type { TrailPoint } from './trail';

/**
 * The compact form tracks and trails take on the WebSocket (protocol v10).
 *
 * A world snapshot of about 37,000 tracks was 13.8 MB of JSON, and roughly
 * 110 of each track's 250 bytes were field names. Building, compressing,
 * sending and parsing all scale with that size, and the page waited for all
 * of it before drawing anything. So on the wire:
 *
 * - A track is an array in a fixed field order (TrackTuple), not an object.
 * - Enumerated fields (source, domain, platform, affiliation, provider) are
 *   their index in TRACK_VALUES.
 * - observedAt is milliseconds before the message's serverTime: a few digits,
 *   not thirteen.
 * - Numbers are rounded to what no one can see: position to 1e-5 degrees
 *   (about 1 m, as trails already are), course and speed to 0.1, altitude to 1 m.
 * - A trail is one flat list of whole numbers: its first point, then each
 *   point as the step from the one before. Trails are already rounded to
 *   1e-5 degrees, so this is lossless.
 *
 * Plain JSON still, so messages stay readable in DevTools, and compression
 * (permessage-deflate) still applies on top. Pure functions, so every rule
 * is tested by round trip.
 */

/**
 * [id, source, domain, platform, affiliation, lat, lon, courseDeg, speedMps,
 * ageMs, altitudeM, callsign, provider, typeCode, model]. The last five may
 * be null when absent, and trailing nulls are left off.
 */
export type TrackTuple = (string | number | null)[];

/** [lon, lat, ageMs, then dLon, dLat, dMs for each later point], lon/lat in 1e-5 degrees. */
export type TrailTuple = number[];

const COORD_SCALE = 1e5;

const codesFor = <T extends string>(values: readonly T[]) => new Map<T, number>(values.map((v, i) => [v, i]));
const CODES = {
  source: codesFor(TRACK_VALUES.source),
  domain: codesFor(TRACK_VALUES.domain),
  platform: codesFor(TRACK_VALUES.platform),
  affiliation: codesFor(TRACK_VALUES.affiliation),
  provider: codesFor(TRACK_VALUES.provider),
};

function code<K extends keyof typeof CODES>(field: K, value: (typeof TRACK_VALUES)[K][number]): number {
  // Tracks are sanitized before they get here, so an unknown value is a bug
  // (a value added to a union but not to TRACK_VALUES), not bad input.
  const c = (CODES[field] as Map<string, number>).get(value);
  if (c === undefined) throw new Error(`wire: no code for ${field} "${value}"; add it to TRACK_VALUES`);
  return c;
}

/**
 * Rounds to 1/scale. Dividing the rounded integer gives the double nearest
 * the decimal, which JSON prints as the short decimal itself (no
 * 0.30000000000000004), the same rounding trails use.
 */
const roundTo = (v: number, scale: number) => Math.round(v * scale) / scale;

export function encodeTrack(t: Track, serverTime: number): TrackTuple {
  const tuple: TrackTuple = [
    t.id,
    code('source', t.source),
    code('domain', t.domain),
    code('platform', t.platform),
    code('affiliation', t.affiliation),
    roundTo(t.lat, COORD_SCALE),
    roundTo(t.lon, COORD_SCALE),
    roundTo(t.courseDeg, 10),
    roundTo(t.speedMps, 10),
    Math.round(serverTime - t.observedAt),
    t.altitudeM === undefined ? null : Math.round(t.altitudeM),
    t.callsign ?? null,
    t.provider === undefined ? null : code('provider', t.provider),
    t.typeCode ?? null,
    t.model ?? null,
  ];
  while (tuple.at(-1) === null) tuple.pop();
  return tuple;
}

/** Trusts its input: the server built it (parseServerMessage checks only the message's shape). */
export function decodeTrack(w: TrackTuple, serverTime: number): Track {
  const track: Track = {
    id: w[0] as string,
    source: TRACK_VALUES.source[w[1] as number]!,
    domain: TRACK_VALUES.domain[w[2] as number]!,
    platform: TRACK_VALUES.platform[w[3] as number]!,
    affiliation: TRACK_VALUES.affiliation[w[4] as number]!,
    lat: w[5] as number,
    lon: w[6] as number,
    courseDeg: w[7] as number,
    speedMps: w[8] as number,
    observedAt: serverTime - (w[9] as number),
  };
  if (typeof w[10] === 'number') track.altitudeM = w[10];
  if (typeof w[11] === 'string') track.callsign = w[11];
  if (typeof w[12] === 'number') track.provider = TRACK_VALUES.provider[w[12]]!;
  if (typeof w[13] === 'string') track.typeCode = w[13];
  if (typeof w[14] === 'string') track.model = w[14];
  return track;
}

export function encodeTrail(points: readonly TrailPoint[], serverTime: number): TrailTuple {
  const out: TrailTuple = [];
  let lon = 0;
  let lat = 0;
  let t = 0;
  points.forEach(([pLon, pLat, pT], i) => {
    const x = Math.round(pLon * COORD_SCALE);
    const y = Math.round(pLat * COORD_SCALE);
    if (i === 0) out.push(x, y, serverTime - pT);
    else out.push(x - lon, y - lat, pT - t);
    lon = x;
    lat = y;
    t = pT;
  });
  return out;
}

export function decodeTrail(w: TrailTuple, serverTime: number): TrailPoint[] {
  const points: TrailPoint[] = [];
  let x = 0;
  let y = 0;
  let t = 0;
  for (let i = 0; i + 2 < w.length; i += 3) {
    if (i === 0) {
      x = w[0]!;
      y = w[1]!;
      t = serverTime - w[2]!;
    } else {
      x += w[i]!;
      y += w[i + 1]!;
      t += w[i + 2]!;
    }
    points.push([x / COORD_SCALE, y / COORD_SCALE, t]);
  }
  return points;
}
