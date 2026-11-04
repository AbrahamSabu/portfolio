/**
 * The plane-spotter's view of the sky: live aircraft near one point, as
 * `/api/sky?lat=…&lon=…` answers. Identity fields follow the details panel's
 * rules: a private aircraft (FAA LADD, or a privacy address) comes without
 * its callsign or airline, only what it is and where.
 */
export interface SkyAircraft {
  id: string;
  callsign?: string;
  /** The airline named by the callsign's ICAO designator. */
  airline?: string;
  /** From the aircraft database: "BOEING 737-800", and its designator "B738". */
  model?: string;
  typeCode?: string;
  military?: boolean;
  lat: number;
  lon: number;
  altitudeM: number;
  speedMps: number;
  courseDeg: number;
  observedAt: number;
}

export interface SkyResponse {
  serverTime: number;
  /** Nearest first. */
  aircraft: SkyAircraft[];
}

/** Within this of the observer: a jet at cruise is about 7° above the horizon here. */
export const SKY_RADIUS_M = 60_000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** The server's answer, checked field by field: its text goes into the page. */
export function parseSkyResponse(v: unknown): SkyResponse | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (!finite(r.serverTime) || !Array.isArray(r.aircraft)) return null;
  const aircraft: SkyAircraft[] = [];
  for (const item of r.aircraft) {
    if (typeof item !== 'object' || item === null) continue;
    const a = item as Record<string, unknown>;
    if (!text(a.id, 130) || !finite(a.lat) || !finite(a.lon) || !finite(a.altitudeM)) continue;
    if (!finite(a.speedMps) || !finite(a.courseDeg) || !finite(a.observedAt)) continue;
    if (Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180) continue;
    const out: SkyAircraft = {
      id: a.id,
      lat: a.lat,
      lon: a.lon,
      altitudeM: a.altitudeM,
      speedMps: a.speedMps,
      courseDeg: a.courseDeg,
      observedAt: a.observedAt,
    };
    if (text(a.callsign, 16)) out.callsign = a.callsign;
    if (text(a.airline, 80)) out.airline = a.airline;
    if (text(a.model, 80)) out.model = a.model;
    if (text(a.typeCode, 8)) out.typeCode = a.typeCode;
    if (a.military === true) out.military = true;
    aircraft.push(out);
  }
  return { serverTime: r.serverTime, aircraft };
}
