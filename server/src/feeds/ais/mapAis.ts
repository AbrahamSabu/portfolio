import type { Platform, ShipDetails } from '@watchfloor/shared';

/**
 * Translating AISStream messages into positions and ship identities. Pure, so
 * every rule is tested against recorded messages.
 *
 * AISStream decodes the radio messages for us; the field meanings and the
 * "not available" values below are ITU-R M.1371's, which AISStream passes
 * through unchanged. Models: https://github.com/aisstream/ais-message-models
 */
const KNOTS_TO_MPS = 1852 / 3600;

/** What the stream can send: a control message, an AIS message, or something we don't understand. */
export type StreamMessage =
  | { kind: 'confirmation'; compression: boolean }
  | { kind: 'error'; error: string }
  | { kind: 'ais'; type: string; meta: Record<string, unknown>; body: Record<string, unknown> };

export type AisSkipReason =
  | 'malformed'
  | 'invalid'
  | 'not-a-ship'
  | 'no-position'
  | 'no-velocity'
  | 'no-time'
  | 'unhandled-type';

/** What a ship says about itself, as far as it's known. */
export interface ShipIdentity extends ShipDetails {
  name?: string;
  platform?: Platform;
}

export type AisOutcome =
  /** A position fix. Static messages from Class B "extended" reports carry identity too. */
  | {
      kind: 'position';
      mmsi: string;
      lat: number;
      lon: number;
      courseDeg: number;
      speedMps: number;
      observedAt: number;
      /** AISStream's own name for the ship (from its cache), used when we have none. */
      metaName?: string;
      identity?: ShipIdentity;
    }
  /** Name and type only, no position: kept until the ship's next position report. */
  | { kind: 'static'; mmsi: string; identity: ShipIdentity }
  | { kind: 'skip'; reason: AisSkipReason };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse one frame. Null for anything that isn't JSON of a shape we know. */
export function parseStreamMessage(raw: string): StreamMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  if (typeof m.error === 'string') return { kind: 'error', error: m.error };
  if (typeof m.MessageType !== 'string' || !isObject(m.Message)) return null;
  if (m.MessageType === 'SubscriptionConfirmation') {
    // Recorded (Oct 2026): {"Message":{"CompressionEnabled":true},...}, the flag directly
    // under Message, not under Message.SubscriptionConfirmation like AIS types.
    const nested = m.Message.SubscriptionConfirmation;
    const body = isObject(nested) ? nested : m.Message;
    return { kind: 'confirmation', compression: body.CompressionEnabled === true };
  }
  const body = m.Message[m.MessageType];
  if (!isObject(body)) return null;
  return { kind: 'ais', type: m.MessageType, meta: isObject(m.MetaData) ? m.MetaData : {}, body };
}

/** The message types the feed subscribes to; everything else is filtered out at the source. */
export const POSITION_TYPES = ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'] as const;
export const STATIC_TYPES = ['ShipStaticData', 'StaticDataReport'] as const;
export const SUBSCRIBED_TYPES = [...POSITION_TYPES, ...STATIC_TYPES];

export function mapAisMessage(msg: Extract<StreamMessage, { kind: 'ais' }>): AisOutcome {
  const { body, meta } = msg;
  if (body.Valid === false) return { kind: 'skip', reason: 'invalid' };
  const mmsi = mmsiOf(body.UserID ?? meta.MMSI);
  if (mmsi === null) return { kind: 'skip', reason: 'malformed' };
  // Ship stations' MMSIs start with a country code (MID, 201-775). Others are
  // coast stations (00), aids to navigation (99), SAR aircraft (111) and
  // distress beacons (970-974), which aren't ships and mustn't be drawn as one.
  if (!/^[2-7]/.test(mmsi)) return { kind: 'skip', reason: 'not-a-ship' };

  switch (msg.type) {
    case 'PositionReport':
    case 'StandardClassBPositionReport':
    case 'ExtendedClassBPositionReport':
      return mapPosition(mmsi, msg);
    case 'ShipStaticData':
      return { kind: 'static', mmsi, identity: identity(body.Name, body.Type, body) };
    case 'StaticDataReport': {
      // Class B static data arrives in two parts: A has the name, B the type.
      const a = isObject(body.ReportA) && body.ReportA.Valid !== false ? body.ReportA : null;
      const b = isObject(body.ReportB) && body.ReportB.Valid !== false ? body.ReportB : null;
      return { kind: 'static', mmsi, identity: identity(a?.Name, b?.ShipType, b ?? {}) };
    }
    default:
      return { kind: 'skip', reason: 'unhandled-type' };
  }
}

function mapPosition(mmsi: string, msg: Extract<StreamMessage, { kind: 'ais' }>): AisOutcome {
  const { body, meta } = msg;
  const lat = num(body.Latitude);
  const lon = num(body.Longitude);
  // 91 and 181 mean "not available"; anything outside the globe is no fix either.
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { kind: 'skip', reason: 'no-position' };
  }

  // Speed 102.3 kn means "not available" (102.2 means "102.2 or more").
  const sog = num(body.Sog);
  if (sog === null || sog >= 102.3) return { kind: 'skip', reason: 'no-velocity' };
  // Course 360 and heading 511 mean "not available". A stationary ship needs
  // no course; a moving one without one can't be dead-reckoned honestly.
  const cog = num(body.Cog);
  const heading = num(body.TrueHeading);
  const courseDeg = cog !== null && cog < 360 ? cog : heading !== null && heading < 360 ? heading : null;
  if (courseDeg === null && sog >= 0.5) return { kind: 'skip', reason: 'no-velocity' };

  const receivedAt = parseTimeUtc(meta.time_utc);
  if (receivedAt === null) return { kind: 'skip', reason: 'no-time' };

  const outcome: AisOutcome = {
    kind: 'position',
    mmsi,
    lat,
    lon,
    courseDeg: courseDeg ?? 0,
    speedMps: sog * KNOTS_TO_MPS,
    observedAt: fixTime(receivedAt, num(body.Timestamp)),
  };
  const metaName = cleanName(meta.ShipName);
  if (metaName) outcome.metaName = metaName;
  if (msg.type === 'ExtendedClassBPositionReport') outcome.identity = identity(body.Name, body.Type, body);
  return outcome;
}

function mmsiOf(v: unknown): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : typeof v === 'string' ? v.trim() : '';
  return /^\d{9}$/.test(s) ? s : null;
}

function identity(name: unknown, type: unknown, body: Record<string, unknown>): ShipIdentity {
  const id: ShipIdentity = shipDetails(body);
  const n = cleanName(name);
  if (n) id.name = n;
  const p = platformForShipType(num(type));
  if (p) id.platform = p;
  return id;
}

/**
 * The voyage and hull details a static message carries, when they're there:
 * Class A static data has them all, Class B only call sign and size. Each
 * "not available" value (0, or the field's maximum) is left out.
 */
export function shipDetails(body: Record<string, unknown>): ShipDetails {
  const d: ShipDetails = {};
  const callSign = cleanName(body.CallSign);
  if (callSign) d.callSign = callSign;
  const imo = num(body.ImoNumber);
  // IMO numbers are seven digits; many small ships send 0 or junk.
  if (imo !== null && Number.isInteger(imo) && imo >= 1_000_000 && imo <= 9_999_999) d.imo = imo;
  const destination = cleanName(body.Destination);
  if (destination) d.destination = destination;
  const eta = etaOf(body.Eta);
  if (eta) d.eta = eta;
  if (isObject(body.Dimension)) {
    // Distances from the GPS antenna to bow (A), stern (B), port (C) and starboard (D).
    const [a, b, c, dd] = ['A', 'B', 'C', 'D'].map((k) => num((body.Dimension as Record<string, unknown>)[k]) ?? 0);
    if (a! > 0 && b! > 0 && a! < 511 && b! < 511) d.lengthM = a! + b!;
    if (c! > 0 && dd! > 0 && c! < 63 && dd! < 63) d.beamM = c! + dd!;
  }
  const draught = num(body.MaximumStaticDraught);
  if (draught !== null && draught > 0 && draught < 25.5) d.draughtM = draught;
  return d;
}

/** The ETA as sent: month, day, hour and minute in UTC, with no year. Unset parts mean none. */
function etaOf(v: unknown): string | undefined {
  if (!isObject(v)) return undefined;
  const [month, day, hour, minute] = [v.Month, v.Day, v.Hour, v.Minute].map(num);
  if (!month || !day || month > 12 || day > 31) return undefined;
  if (hour == null || minute == null || hour > 23 || minute > 59) return undefined;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(month)}-${two(day)}T${two(hour)}:${two(minute)}Z`;
}

/** AIS text is padded with '@' (the 6-bit "no character") and spaces. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/@+/g, ' ').replace(/\s+/g, ' ').trim();
  return s || undefined;
}

/**
 * AIS ship type (first digit is the category) to our platforms. Undefined
 * for "not available" (0) so it can't overwrite a type we already know.
 * Type 35 is a ship *declaring* military operations: that sets the platform,
 * never an affiliation, which stays an operator's call.
 */
export function platformForShipType(type: number | null): Platform | undefined {
  if (type === null || !Number.isInteger(type) || type <= 0 || type > 99) return undefined;
  if (type === 30) return 'fishing';
  if (type === 35) return 'warship';
  if (type === 36 || type === 37) return 'leisure';
  if (type >= 60 && type <= 69) return 'passenger';
  if (type >= 70 && type <= 79) return 'cargo';
  if (type >= 80 && type <= 89) return 'tanker';
  return 'vessel';
}

/**
 * AISStream's receive time, e.g. "2026-10-27 20:41:07.123456789 +0000 UTC"
 * (Go's default time format). Null if it isn't there or doesn't parse.
 */
export function parseTimeUtc(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?\s*(?:\+0000|Z)?/.exec(v.trim());
  if (!m) return null;
  const ms = m[3] ? m[3].slice(0, 4).padEnd(4, '0') : '';
  const t = Date.parse(`${m[1]}T${m[2]}${ms}Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * When the position was fixed. An AIS position report carries only the UTC
 * *second* of its fix (0-59; 60-63 mean not available, manual, estimated or
 * inoperative), so we take the latest moment at or before AISStream's
 * receive time that falls on that second. A ship's clock a few seconds ahead
 * of the receiver's would otherwise look almost a minute old, so a fix up to
 * 5 s "after" receipt counts as clock skew, not as 55+ s of latency.
 */
export function fixTime(receivedAt: number, utcSecond: number | null): number {
  if (utcSecond === null || !Number.isInteger(utcSecond) || utcSecond < 0 || utcSecond > 59) return receivedAt;
  const wholeSecond = Math.floor(receivedAt / 1000);
  let lag = (((wholeSecond % 60) - utcSecond) % 60 + 60) % 60;
  if (lag > 55) lag -= 60;
  return (wholeSecond - lag) * 1000;
}
