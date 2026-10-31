import { normalizeDeg } from './geo';
import { TRACK_VALUES, type Affiliation, type Domain, type Platform, type Provider, type Track, type TrackSource } from './track';

const DOMAINS: ReadonlySet<Domain> = new Set(TRACK_VALUES.domain);
const SOURCES: ReadonlySet<TrackSource> = new Set(TRACK_VALUES.source);
const AFFILIATIONS: ReadonlySet<Affiliation> = new Set(TRACK_VALUES.affiliation);
const PLATFORMS: ReadonlySet<Platform> = new Set(TRACK_VALUES.platform);
const PROVIDERS: ReadonlySet<Provider> = new Set(TRACK_VALUES.provider);

/**
 * Callsigns and ship names as transmitted carry filler: padding punctuation
 * ("-NANUUK-", "...VEGA", ":GMS ANTARO"), or placeholders with no name in them ("00000000",
 * ",", "-"). Left in, they sort to the top of the list and label the map
 * with noise. Apostrophes and quotes stay: they're part of real names ('T SMIDTJE).
 */
export function cleanCallsign(raw: string): string | undefined {
  const s = raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-.,:;_*~]+|[\s\-.,:;_*~]+$/g, '')
    .slice(0, 32);
  if (!/[A-Za-z0-9]/.test(s) || /^0+$/.test(s)) return undefined;
  return s;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks and tidies a track before it enters the system.
 *
 * Real feeds send junk: NaN positions, headings of 360 or -5, negative speeds.
 * Everything that reaches the store has been through here, so the rest of the
 * code can trust the data. Returns null if the track can't be salvaged.
 */
export function sanitizeTrack(input: unknown): Track | null {
  if (typeof input !== 'object' || input === null) return null;
  const t = input as Record<string, unknown>;

  if (typeof t.id !== 'string' || t.id.length === 0 || t.id.length > 128) return null;
  if (!SOURCES.has(t.source as TrackSource)) return null;
  if (!DOMAINS.has(t.domain as Domain)) return null;
  if (!isFiniteNumber(t.lat) || t.lat < -90 || t.lat > 90) return null;
  if (!isFiniteNumber(t.lon) || t.lon < -180 || t.lon > 180) return null;
  if (!isFiniteNumber(t.observedAt) || t.observedAt <= 0) return null;

  const track: Track = {
    id: t.id,
    source: t.source as TrackSource,
    domain: t.domain as Domain,
    platform: PLATFORMS.has(t.platform as Platform)
      ? (t.platform as Platform)
      : t.domain === 'air'
        ? 'aircraft'
        : 'vessel',
    affiliation: AFFILIATIONS.has(t.affiliation as Affiliation)
      ? (t.affiliation as Affiliation)
      : 'unknown',
    lat: t.lat,
    lon: t.lon,
    courseDeg: isFiniteNumber(t.courseDeg) ? normalizeDeg(t.courseDeg) : 0,
    speedMps: isFiniteNumber(t.speedMps) && t.speedMps > 0 ? t.speedMps : 0,
    observedAt: t.observedAt,
  };

  if (typeof t.callsign === 'string') {
    const callsign = cleanCallsign(t.callsign);
    if (callsign) track.callsign = callsign;
  }
  if (PROVIDERS.has(t.provider as Provider)) track.provider = t.provider as Provider;
  if (track.domain === 'air' && isFiniteNumber(t.altitudeM)) {
    track.altitudeM = t.altitudeM;
  }
  if (track.domain === 'air' && typeof t.typeCode === 'string' && /^[A-Z0-9]{1,4}$/.test(t.typeCode)) {
    track.typeCode = t.typeCode;
  }
  if (track.domain === 'air' && typeof t.squawk === 'string' && /^[0-7]{4}$/.test(t.squawk)) {
    track.squawk = t.squawk;
  }
  if (track.domain === 'air' && typeof t.model === 'string') {
    // Shown as text, never markup, but still kept short and printable.
    const model = t.model.replace(/[^ -~]/g, '').trim().slice(0, 48);
    if (model) track.model = model;
  }
  return track;
}
