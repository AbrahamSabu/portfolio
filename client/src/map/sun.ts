/**
 * Where the sun is overhead, for the day/night shading. The low-precision
 * formulas from the Astronomical Almanac (good to about 0.01°, far below a
 * pixel at globe scale), so no ephemeris library is needed.
 */

const RAD = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export interface SubsolarPoint {
  /** Declination: the latitude where the sun is overhead (°). */
  lat: number;
  /** The longitude where it's local noon (°, -180 to 180). */
  lon: number;
}

export function subsolarPoint(timeMs: number): SubsolarPoint {
  const n = (timeMs - J2000_MS) / 86_400_000;
  const meanLon = 280.46 + 0.9856474 * n;
  const anomaly = (357.528 + 0.9856003 * n) * RAD;
  const eclipticLon = (meanLon + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLon), Math.cos(eclipticLon));
  // Greenwich mean sidereal time, in degrees.
  const gmst = 280.46061837 + 360.98564736629 * n;
  const lon = (((rightAscension / RAD - gmst + 180) % 360) + 360) % 360 - 180;
  return { lat: declination / RAD, lon };
}

/** The sun's height above the horizon at a place (°): negative is below it. */
export function solarElevation(sun: SubsolarPoint, lat: number, lon: number): number {
  const sinEl =
    Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / RAD;
}
