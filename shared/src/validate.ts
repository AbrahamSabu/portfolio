import { normalizeDeg } from './geo';
import type { Affiliation, Domain, Platform, Provider, Track, TrackSource } from './track';

const DOMAINS: ReadonlySet<Domain> = new Set(['air', 'sea']);
const SOURCES: ReadonlySet<TrackSource> = new Set(['sim', 'adsb', 'ais']);
const AFFILIATIONS: ReadonlySet<Affiliation> = new Set([
  'friend',
  'hostile',
  'neutral',
  'unknown',
  'pending',
]);
const PLATFORMS: ReadonlySet<Platform> = new Set([
  'airliner',
  'light-aircraft',
  'helicopter',
  'military-helicopter',
  'maritime-patrol',
  'uav',
  'aircraft',
  'cargo',
  'tanker',
  'passenger',
  'fishing',
  'leisure',
  'warship',
  'vessel',
]);

const PROVIDERS: ReadonlySet<Provider> = new Set(['opensky', 'adsb.lol']);

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
    const callsign = t.callsign.trim().slice(0, 32);
    if (callsign) track.callsign = callsign;
  }
  if (PROVIDERS.has(t.provider as Provider)) track.provider = t.provider as Provider;
  if (track.domain === 'air' && isFiniteNumber(t.altitudeM)) {
    track.altitudeM = t.altitudeM;
  }
  return track;
}
