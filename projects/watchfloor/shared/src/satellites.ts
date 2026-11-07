/**
 * Satellites, the third domain beside air and sea.
 *
 * The server relays orbital elements from CelesTrak (`GET /api/satellites`),
 * and browsers compute positions from them with SGP4. An element set is a
 * mean orbit of about a hundred bytes that stays good for days, while a
 * position changes every frame: sending the elements once and letting each
 * browser do the arithmetic beats streaming ten thousand positions a second.
 *
 * Elements travel in CCSDS OMM terms (CelesTrak's JSON), not as TLEs: the
 * TLE format has room for five-digit catalogue numbers only, and those ran
 * out on 2026-07-11.
 */

/** CelesTrak's GROUP names we carry, in the order the map lists them. */
export const SATELLITE_GROUPS = ['stations', 'weather', 'starlink'] as const;
export type SatelliteGroup = (typeof SATELLITE_GROUPS)[number];

export function isSatelliteGroup(x: unknown): x is SatelliteGroup {
  return typeof x === 'string' && (SATELLITE_GROUPS as readonly string[]).includes(x);
}

/** One satellite's mean elements, as CelesTrak publishes them. Angles in degrees. */
export interface SatelliteElements {
  /** NORAD catalogue number (six digits since July 2026). */
  id: number;
  name: string;
  /** International designator, launch year and piece: "1998-067A". */
  intl: string;
  /** When the elements are true for, ms since 1970 (UTC). */
  epoch: number;
  /** Revolutions per day. */
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  /** Right ascension of the ascending node. */
  raan: number;
  argPerigee: number;
  meanAnomaly: number;
  /** Drag term, per earth radius. */
  bstar: number;
  meanMotionDot: number;
  meanMotionDdot: number;
}

/** The order of the fields on the wire: one array per satellite instead of an object. */
export type SatelliteTuple = [
  id: number,
  name: string,
  intl: string,
  epoch: number,
  meanMotion: number,
  eccentricity: number,
  inclination: number,
  raan: number,
  argPerigee: number,
  meanAnomaly: number,
  bstar: number,
  meanMotionDot: number,
  meanMotionDdot: number,
];

/** ok: CelesTrak's copy is in hand. pending: not downloaded yet. failing: the last try failed (an older copy may still be served). */
export type SatelliteGroupStatus = 'ok' | 'pending' | 'failing';

export interface SatelliteGroupData {
  group: SatelliteGroup;
  status: SatelliteGroupStatus;
  /** When this copy was downloaded from CelesTrak, or null before the first. */
  fetchedAt: number | null;
  satellites: SatelliteElements[];
}

export interface SatelliteCatalog {
  groups: SatelliteGroupData[];
}

/** The version of `/api/satellites` responses and the server's cache files. */
export const SATELLITE_FORMAT = 1;

/**
 * Elements older than this are dropped. SGP4's error grows by kilometres a
 * day, and an object whose elements stopped updating weeks ago has usually
 * re-entered or been lost: drawing it would invent a satellite.
 */
export const MAX_ELEMENT_AGE_MS = 30 * 86_400_000;

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const between = (x: unknown, lo: number, hi: number): x is number => finite(x) && x >= lo && x <= hi;

/**
 * CelesTrak's EPOCH, "2026-11-05T20:28:36.809184": UTC without a zone and
 * with microseconds, which `Date.parse` isn't required to accept. Parsed by
 * hand, to the millisecond.
 */
export function parseOmmEpoch(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z?$/.exec(text.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const fraction = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return Number.isFinite(ms) ? ms + fraction : null;
}

/** Validates one satellite's elements, whatever their source (CelesTrak, our cache, the wire). */
export function checkElements(e: SatelliteElements): SatelliteElements | null {
  const ok =
    Number.isInteger(e.id) &&
    e.id > 0 &&
    e.id <= 999_999_999 &&
    typeof e.name === 'string' &&
    e.name.length > 0 &&
    e.name.length <= 60 &&
    typeof e.intl === 'string' &&
    e.intl.length <= 16 &&
    // Sputnik flew in 1957; nothing older belongs here.
    between(e.epoch, Date.UTC(1957, 0, 1), Date.UTC(2200, 0, 1)) &&
    // Even a satellite about to burn up does fewer than 17.5 orbits a day.
    between(e.meanMotion, 0.01, 20) &&
    between(e.eccentricity, 0, 0.999) &&
    between(e.inclination, 0, 180) &&
    between(e.raan, 0, 360) &&
    between(e.argPerigee, 0, 360) &&
    between(e.meanAnomaly, 0, 360) &&
    between(e.bstar, -1, 1) &&
    finite(e.meanMotionDot) &&
    finite(e.meanMotionDdot);
  return ok ? e : null;
}

/** Control characters out, spaces tidied: names are shown as text, but kept clean anyway. */
function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : '';
}

/** One record of CelesTrak's OMM JSON, or null if anything SGP4 needs is missing or out of range. */
export function elementsFromOmm(raw: unknown): SatelliteElements | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const epoch = parseOmmEpoch(o.EPOCH);
  if (epoch === null) return null;
  return checkElements({
    id: Number(o.NORAD_CAT_ID),
    name: cleanName(o.OBJECT_NAME),
    intl: typeof o.OBJECT_ID === 'string' ? o.OBJECT_ID.trim() : '',
    epoch,
    meanMotion: Number(o.MEAN_MOTION),
    eccentricity: Number(o.ECCENTRICITY),
    inclination: Number(o.INCLINATION),
    raan: Number(o.RA_OF_ASC_NODE),
    argPerigee: Number(o.ARG_OF_PERICENTER),
    meanAnomaly: Number(o.MEAN_ANOMALY),
    bstar: Number(o.BSTAR),
    meanMotionDot: Number(o.MEAN_MOTION_DOT),
    meanMotionDdot: Number(o.MEAN_MOTION_DDOT),
  });
}

export function toTuple(e: SatelliteElements): SatelliteTuple {
  return [
    e.id,
    e.name,
    e.intl,
    e.epoch,
    e.meanMotion,
    e.eccentricity,
    e.inclination,
    e.raan,
    e.argPerigee,
    e.meanAnomaly,
    e.bstar,
    e.meanMotionDot,
    e.meanMotionDdot,
  ];
}

export function fromTuple(t: unknown): SatelliteElements | null {
  if (!Array.isArray(t) || t.length !== 13) return null;
  const [id, name, intl, epoch, meanMotion, eccentricity, inclination, raan, argPerigee, meanAnomaly, bstar, dot, ddot] =
    t as unknown[];
  return checkElements({
    id: id as number,
    name: cleanName(name),
    intl: intl as string,
    epoch: epoch as number,
    meanMotion: meanMotion as number,
    eccentricity: eccentricity as number,
    inclination: inclination as number,
    raan: raan as number,
    argPerigee: argPerigee as number,
    meanAnomaly: meanAnomaly as number,
    bstar: bstar as number,
    meanMotionDot: dot as number,
    meanMotionDdot: ddot as number,
  });
}

/** One group as the API and the server's cache file carry it. */
export interface WireSatelliteGroup {
  group: SatelliteGroup;
  status: SatelliteGroupStatus;
  fetchedAt: number | null;
  sats: SatelliteTuple[];
}

export function encodeSatelliteGroup(g: SatelliteGroupData): WireSatelliteGroup {
  return { group: g.group, status: g.status, fetchedAt: g.fetchedAt, sats: g.satellites.map(toTuple) };
}

/** A group from the wire or a cache file; bad satellites are dropped, a bad group is null. */
export function parseSatelliteGroup(raw: unknown): SatelliteGroupData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Record<string, unknown>;
  if (!isSatelliteGroup(g.group) || !Array.isArray(g.sats)) return null;
  const status: SatelliteGroupStatus = g.status === 'pending' || g.status === 'failing' ? g.status : 'ok';
  const fetchedAt = finite(g.fetchedAt) ? g.fetchedAt : null;
  const satellites: SatelliteElements[] = [];
  for (const t of g.sats) {
    const e = fromTuple(t);
    if (e) satellites.push(e);
  }
  return { group: g.group, status, fetchedAt, satellites };
}

export function encodeSatelliteCatalog(catalog: SatelliteCatalog): { v: number; groups: WireSatelliteGroup[] } {
  return { v: SATELLITE_FORMAT, groups: catalog.groups.map(encodeSatelliteGroup) };
}

/** `/api/satellites` as the browser receives it, or null if it isn't one. */
export function parseSatelliteCatalog(raw: unknown): SatelliteCatalog | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== SATELLITE_FORMAT || !Array.isArray(c.groups)) return null;
  const groups: SatelliteGroupData[] = [];
  for (const g of c.groups) {
    const group = parseSatelliteGroup(g);
    // One copy per group: a repeated name would draw its satellites twice.
    if (group && !groups.some((other) => other.group === group.group)) groups.push(group);
  }
  return { groups };
}
