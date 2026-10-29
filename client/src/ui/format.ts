import { metresToFeet, mpsToKnots, type Affiliation, type Platform, type Provider, type Track, type TrackSource, type FeedStatus, type PathBackfill, type TrafficKind, type ShipDetails, type TrackDetails } from '@watchfloor/shared';

export const PLATFORM_LABEL: Record<Platform, string> = {
  airliner: 'Airliner',
  'light-aircraft': 'Light aircraft',
  helicopter: 'Helicopter',
  'military-helicopter': 'Military helicopter',
  'maritime-patrol': 'Maritime patrol aircraft',
  uav: 'Uncrewed aircraft',
  aircraft: 'Aircraft',
  'business-jet': 'Business jet',
  'military-aircraft': 'Military aircraft',
  cargo: 'Cargo ship',
  tanker: 'Tanker',
  passenger: 'Passenger ferry',
  fishing: 'Fishing vessel',
  leisure: 'Pleasure craft',
  warship: 'Warship',
  vessel: 'Vessel',
};

export const AFFILIATION_LABEL: Record<Affiliation, string> = {
  friend: 'Friend',
  hostile: 'Hostile',
  neutral: 'Neutral',
  unknown: 'Unknown',
  pending: 'Pending',
};

export const SOURCE_LABEL: Record<TrackSource, string> = {
  sim: 'Simulator',
  adsb: 'ADS-B',
  ais: 'AIS',
};

/**
 * One line for the status bar about a feed that isn't delivering, or null
 * when it is (a healthy feed says nothing, keeping the chrome quiet).
 * Times are day-hour-minute Zulu, like the top bar's date-time group.
 */
export function describeFeedStatus(s: FeedStatus): string | null {
  switch (s.state) {
    case 'ok':
      return null;
    case 'starting':
      return `Waiting for ${s.label}`;
    case 'rate-limited':
      return `${s.label} rate limited${s.until ? `, resumes ${formatDtg(s.until).split(' ')[0]}` : ''}`;
    case 'failing':
      return `${s.label} not responding${s.detail ? ` (${s.detail})` : ''}, retrying`;
    case 'standing-aside':
      return null; // on its own this isn't news; see describeFeeds
    case 'unconfigured':
      return `${s.label} off${s.detail ? `: ${s.detail}` : ''}`;
  }
}

/**
 * The status bar's feed line: each feed's problem, plus a hint when the map
 * is empty only because the view is too wide. That hint appears only when no
 * other live feed is delivering, which is when it explains an empty map.
 */
export function describeFeeds(feeds: FeedStatus[]): string {
  const lines = feeds.map(describeFeedStatus).filter((line): line is string => line !== null);
  // Ships on the map don't explain missing aircraft, so AIS doesn't count.
  const delivering = feeds.some((f) => f.feed !== 'ais' && (f.state === 'ok' || f.state === 'starting'));
  if (!delivering) {
    const aside = feeds.filter((f) => f.state === 'standing-aside').map((f) => f.label);
    if (aside.length) lines.push(`Zoom in to see aircraft from ${aside.join(' and ')}`);
  }
  return lines.join('; ');
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  opensky: 'OpenSky',
  'adsb.lol': 'adsb.lol',
  'adsb.fi': 'adsb.fi',
  aisstream: 'AISStream',
};

/** "ADS-B via adsb.lol": the kind of data, and which service delivered the latest report. */
export function formatSource(track: Pick<Track, 'source' | 'provider'>): string {
  const kind = SOURCE_LABEL[track.source];
  return track.provider ? `${kind} via ${PROVIDER_LABEL[track.provider]}` : kind;
}

/** "BOEING 747-8 (B748)", or just the designator when the model isn't known; empty for no type. */
export function formatAircraftType(track: Pick<Track, 'typeCode' | 'model'>): string {
  if (!track.typeCode) return '';
  return track.model ? `${track.model} (${track.typeCode})` : track.typeCode;
}

const TRAFFIC_LABEL: Record<TrafficKind, string> = {
  simulated: 'simulated traffic',
  live: 'live traffic',
  mixed: 'live and simulated traffic',
};

/** Top bar subtitle: where we're looking and, honestly, whether any of it is real. */
export function trafficLabel(traffic: TrafficKind, scenarioName?: string): string {
  const label = TRAFFIC_LABEL[traffic];
  return scenarioName ? `${scenarioName}, ${label}` : label.charAt(0).toUpperCase() + label.slice(1);
}

/** Degrees and decimal minutes, the usual format in aviation and at sea: 50°27.12′N */
function ddm(value: number, positive: string, negative: string, degDigits: number): string {
  const hemi = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  if (min >= 59.995) {
    deg += 1;
    min = 0;
  }
  return `${String(deg).padStart(degDigits, '0')}°${min.toFixed(2).padStart(5, '0')}′${hemi}`;
}

export const formatLat = (lat: number) => ddm(lat, 'N', 'S', 2);
export const formatLon = (lon: number) => ddm(lon, 'E', 'W', 3);

export function formatCourse(deg: number): string {
  return `${String(Math.round(deg) % 360).padStart(3, '0')}°`;
}

export function formatSpeed(mps: number): string {
  const kt = mpsToKnots(mps);
  return kt < 10 ? `${kt.toFixed(1)} kn` : `${Math.round(kt)} kn`;
}

/** Flight level above 6,000 ft, plain feet below. */
export function formatAltitude(m: number | undefined): string {
  if (m === undefined) return '—';
  const ft = metresToFeet(m);
  if (ft >= 6000) return `FL${String(Math.round(ft / 100)).padStart(3, '0')}`;
  return `${(Math.round(ft / 50) * 50).toLocaleString('en-GB')} ft`;
}

/** Compact elapsed time for tight spaces such as table cells: "5 s", "2 min", "1 h". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h`;
}

export function formatAge(ms: number): string {
  return `${formatDuration(ms)} ago`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Military date-time group, e.g. 251432Z OCT 26. */
export function formatDtg(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${p(d.getUTCFullYear() % 100)}`;
}

/** "1402Z": the time of day of a DTG, for times within the last day. */
export function formatZuluTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z`;
}

/**
 * How far back the selected track's path goes, and where its start came from:
 * "Since 1402Z (2 h 13 min) · start from OpenSky".
 */
export function formatPathSpan(
  path: { loaded: boolean; points: readonly (readonly [number, number, number])[]; backfill: PathBackfill },
  now: number,
): string {
  if (!path.loaded) return 'Loading';
  const first = path.points[0];
  if (!first || path.points.length < 2) return 'Only the latest report so far';
  const minutes = Math.max(0, Math.round((now - first[2]) / 60_000));
  const span = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  const text = `Since ${formatZuluTime(first[2])} (${span})`;
  if (path.backfill === 'pending') return `${text} · asking OpenSky for earlier`;
  if (path.backfill === 'opensky') return `${text} · start from OpenSky`;
  return text;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Who flies an aircraft: the airline its callsign names, or else whose
 * military it is ("United States military"). Empty when we can't say.
 */
export function formatOperator(details: TrackDetails | undefined): string {
  if (!details) return '';
  if (details.airline) return details.airline;
  if (details.military) return details.country ? `${details.country} military` : 'Military';
  return '';
}

/** A ship's destination and ETA as broadcast: "PORTLAND · ETA 22 Sep 1900Z". */
export function formatDestination(ship: ShipDetails | undefined): string {
  if (!ship?.destination) return '';
  const eta = ship.eta && /^(\d\d)-(\d\d)T(\d\d):(\d\d)Z$/.exec(ship.eta);
  if (!eta) return ship.destination;
  const [, month, day, hour, minute] = eta;
  return `${ship.destination} · ETA ${Number(day)} ${MONTH_NAMES[Number(month) - 1]} ${hour}${minute}Z`;
}

/** Length, beam and draught: "180 × 24 m, draught 4.8 m". */
export function formatShipSize(ship: ShipDetails | undefined): string {
  if (!ship) return '';
  const parts: string[] = [];
  if (ship.lengthM && ship.beamM) parts.push(`${ship.lengthM} × ${ship.beamM} m`);
  else if (ship.lengthM) parts.push(`${ship.lengthM} m long`);
  if (ship.draughtM) parts.push(`draught ${ship.draughtM} m`);
  return parts.join(', ');
}

/** AIS ship types with a name of their own (ITU-R M.1371, table 53). */
const AIS_TYPE_NAME: Record<number, string> = {
  30: 'Fishing vessel',
  31: 'Towing vessel',
  32: 'Towing vessel, large tow',
  33: 'Dredging or underwater operations',
  34: 'Diving operations',
  35: 'Military operations',
  36: 'Sailing vessel',
  37: 'Pleasure craft',
  50: 'Pilot vessel',
  51: 'Search and rescue vessel',
  52: 'Tug',
  53: 'Port tender',
  54: 'Anti-pollution vessel',
  55: 'Law enforcement vessel',
  58: 'Medical transport',
  59: 'Noncombatant ship',
};

/** The rest are families by first digit, the second giving a hazardous cargo category. */
const AIS_TYPE_FAMILY: Record<number, string> = {
  2: 'Wing-in-ground craft',
  4: 'High-speed craft',
  6: 'Passenger ship',
  7: 'Cargo ship',
  8: 'Tanker',
  9: 'Other type of ship',
};

/** A ship's AIS type in words: "Tug", "Cargo ship, hazardous category A". Empty when unknown. */
export function formatShipType(aisType: number | undefined): string {
  if (aisType === undefined) return '';
  const named = AIS_TYPE_NAME[aisType];
  if (named) return named;
  const family = AIS_TYPE_FAMILY[Math.floor(aisType / 10)];
  if (!family) return '';
  const category = 'ABCD'[(aisType % 10) - 1];
  return (aisType % 10) >= 1 && (aisType % 10) <= 4 ? `${family}, hazardous category ${category}` : family;
}
