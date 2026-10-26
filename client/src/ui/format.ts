import { metresToFeet, mpsToKnots, type Affiliation, type Platform, type TrackSource } from '@watchfloor/shared';

export const PLATFORM_LABEL: Record<Platform, string> = {
  airliner: 'Airliner',
  'light-aircraft': 'Light aircraft',
  helicopter: 'Helicopter',
  'military-helicopter': 'Military helicopter',
  'maritime-patrol': 'Maritime patrol aircraft',
  uav: 'Uncrewed aircraft',
  aircraft: 'Aircraft',
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
