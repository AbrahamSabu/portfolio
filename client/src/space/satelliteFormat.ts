import type { SatelliteElements, SatelliteGroup } from '@watchfloor/shared';
import { apsidesKm, isGeostationary, isSunSynchronous, ORBIT_LABEL, orbitClass, periodMinutes } from './orbit';
import type { PassInfo } from './propagate';

/** The groups' names on the map: the Layers menu, the filter, the card. */
export const GROUP_LABEL: Record<SatelliteGroup, string> = {
  stations: 'Space stations',
  weather: 'Weather satellites',
  starlink: 'Starlink',
};

/**
 * The two crewed stations, by the catalogue number of their first module.
 * CelesTrak names objects, not stations ("ISS (ZARYA)"), so these two get
 * their everyday names; everything else keeps CelesTrak's.
 */
export const CREWED_STATIONS: ReadonlyMap<number, string> = new Map([
  [25544, 'International Space Station'],
  [48274, 'Tiangong space station'],
]);

export function displayName(e: Pick<SatelliteElements, 'id' | 'name'>): string {
  return CREWED_STATIONS.get(e.id) ?? e.name;
}

const thousands = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function formatKm(km: number): string {
  return `${thousands.format(km)} km`;
}

export function formatKmPerS(kms: number): string {
  return `${kms.toFixed(2)} km/s`;
}

/** "Low Earth orbit · 51.6° · 93 min", plus whether it is sun-synchronous or geostationary. */
export function describeOrbit(e: SatelliteElements): string {
  const kind = isGeostationary(e) ? 'Geostationary orbit' : ORBIT_LABEL[orbitClass(e)];
  const period = periodMinutes(e.meanMotion);
  const time = period >= 180 ? `${(period / 60).toFixed(1)} h` : `${Math.round(period)} min`;
  const parts = [kind, `${e.inclination.toFixed(1)}°`, time];
  if (isSunSynchronous(e)) parts.push('sun-synchronous');
  return parts.join(' · ');
}

/** For an elliptical orbit the height swings: "between 1,021 and 39,684 km". */
export function describeApsides(e: SatelliteElements): string | null {
  if (e.eccentricity < 0.02) return null;
  const { apogee, perigee } = apsidesKm(e);
  return `between ${thousands.format(perigee)} and ${formatKm(apogee)}`;
}

/** A position in degrees, short: "51.4°N 3.2°W". */
export function formatPlace(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}

/** "6 h", "2 days": how old the elements are. */
export function formatElementAge(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return 'under an hour';
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

/** "in 1 h 12 min", "in 4 min", "in under a minute". */
export function formatIn(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'in under a minute';
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)} h ${min % 60} min`;
}

function zulu(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

/**
 * The next pass in words: "in 1 h 12 min, 1432Z · peaks at 47° · 6 min ·
 * visible to the eye". Visible means sunlit while the sky is dark there: a
 * pass in daylight or in Earth's shadow happens, but can't be seen.
 */
export function describePass(info: PassInfo, now: number): string {
  if (info.kind === 'always') return `Always above the horizon here, ${Math.round(info.elevation)}° up`;
  if (info.kind === 'none') return 'Not above 10° here in the next 24 hours';
  const { rise, peakElevation, set } = info.pass;
  const peak = `peaks at ${Math.round(peakElevation)}°`;
  const seen = info.visible ? 'visible to the eye' : null;
  if (rise === null) return [`Up now, until ${zulu(set)}`, peak, seen].filter(Boolean).join(' · ');
  const minutes = Math.max(1, Math.round((set - rise) / 60_000));
  return [`${formatIn(rise - now)}, ${zulu(rise)}`, peak, `${minutes} min`, seen].filter(Boolean).join(' · ');
}
