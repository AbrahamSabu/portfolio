import type { SatelliteElements } from '@watchfloor/shared';
import {
  checkForDecay,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  json2satrec,
  sgp4,
  shadowFraction,
  sunPos,
  type OMMJsonObject,
  type SatRec,
} from 'satellite.js';
import { findNextPass, mercatorX, mercatorY, MIN_PASS_ELEVATION, periodMinutes, type PassResult } from './orbit';

/**
 * SGP4 through satellite.js: the arithmetic the worker runs. Kept apart from
 * the worker's message handling so it can be tested in Node.
 */

const AU_KM = 149_597_870.7;
const DEG = 180 / Math.PI;
/** Written in place of a position SGP4 couldn't give (decayed, or elements out of range): the shader hides it. */
export const NO_POSITION = -1000;

/** satellite.js reads OMM JSON; our elements carry the same numbers under shorter names. */
export function toSatrec(e: SatelliteElements): SatRec | null {
  const omm = {
    OBJECT_NAME: e.name,
    OBJECT_ID: e.intl,
    EPOCH: new Date(e.epoch).toISOString(),
    MEAN_MOTION: e.meanMotion,
    ECCENTRICITY: e.eccentricity,
    INCLINATION: e.inclination,
    RA_OF_ASC_NODE: e.raan,
    ARG_OF_PERICENTER: e.argPerigee,
    MEAN_ANOMALY: e.meanAnomaly,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: e.id,
    ELEMENT_SET_NO: 999,
    BSTAR: e.bstar,
    MEAN_MOTION_DOT: e.meanMotionDot,
    MEAN_MOTION_DDOT: e.meanMotionDdot,
  } as unknown as OMMJsonObject;
  try {
    const satrec = json2satrec(omm);
    return satrec.error === 0 ? satrec : null;
  } catch {
    return null;
  }
}

/** Julian date of a Unix time in ms. */
export function julian(ms: number): number {
  return ms / 86_400_000 + 2_440_587.5;
}

interface Eci {
  x: number;
  y: number;
  z: number;
}

/** Position and velocity (km, km/s, inertial) at a time, or null if SGP4 gives none or the object has come down. */
export function stateAt(satrec: SatRec, ms: number): { position: Eci; velocity: Eci } | null {
  const pv = sgp4(satrec, (julian(ms) - satrec.jdsatepoch) * 1440);
  // SGP4 can "succeed" for an object that decayed long ago; that position would be invented.
  if (!pv || satrec.error !== 0 || checkForDecay(satrec)) return null;
  return pv;
}

/**
 * Every satellite's ground point and height at one moment, three floats each:
 * Web Mercator x and y (0..1, as the map's shaders take them) and height in
 * km. What the layer draws, and what the GPU blends between two of.
 */
export function writePositions(satrecs: readonly (SatRec | null)[], ms: number, out: Float32Array): void {
  const gmst = gstime(julian(ms));
  for (let i = 0; i < satrecs.length; i++) {
    const satrec = satrecs[i];
    const s = satrec ? stateAt(satrec, ms) : null;
    const o = i * 3;
    if (!s) {
      out[o] = NO_POSITION;
      out[o + 1] = NO_POSITION;
      out[o + 2] = 0;
      continue;
    }
    const g = eciToGeodetic(s.position, gmst);
    // Below 80 km it has re-entered, whatever the elements say.
    if (!(g.height > 80)) {
      out[o] = NO_POSITION;
      out[o + 1] = NO_POSITION;
      out[o + 2] = 0;
      continue;
    }
    out[o] = mercatorX(g.longitude * DEG);
    out[o + 1] = mercatorY(g.latitude * DEG);
    out[o + 2] = g.height;
  }
}

/** Earth-fixed position (km) at a time: for finding docked stacks, which share one. */
export function ecfAt(satrec: SatRec, ms: number): [number, number, number] | null {
  const s = stateAt(satrec, ms);
  if (!s) return null;
  const p = eciToEcf(s.position, gstime(julian(ms)));
  return [p.x, p.y, p.z];
}

export interface GroundTrack {
  /** Longitudes and latitudes, degrees, from `start` every `stepMs`. */
  lons: number[];
  lats: number[];
  start: number;
  stepMs: number;
}

/**
 * The ground track: where the satellite is overhead from `ms - beforeMs` to
 * `ms + afterMs`. Steps of a 180th of an orbit (half a minute for the ISS).
 */
export function groundTrack(satrec: SatRec, meanMotion: number, ms: number, beforeMs: number, afterMs: number): GroundTrack {
  const stepMs = Math.round(Math.max(20_000, (periodMinutes(meanMotion) * 60_000) / 180));
  const start = ms - Math.floor(beforeMs / stepMs) * stepMs;
  const lons: number[] = [];
  const lats: number[] = [];
  for (let t = start; t <= ms + afterMs; t += stepMs) {
    const s = stateAt(satrec, t);
    if (!s) break;
    const g = eciToGeodetic(s.position, gstime(julian(t)));
    lons.push(g.longitude * DEG);
    lats.push(g.latitude * DEG);
  }
  return { lons, lats, start, stepMs };
}

export interface Observer {
  lat: number;
  lon: number;
}

function observerGeodetic(o: Observer) {
  return { latitude: o.lat / DEG, longitude: o.lon / DEG, height: 0 };
}

/** The satellite's elevation above an observer's horizon, degrees (-90 when unknown). */
export function elevationFrom(satrec: SatRec, observer: Observer, ms: number): number {
  const s = stateAt(satrec, ms);
  if (!s) return -90;
  return ecfToLookAngles(observerGeodetic(observer), eciToEcf(s.position, gstime(julian(ms)))).elevation * DEG;
}

/** Whether sunlight reaches the satellite (not in Earth's full shadow). */
export function isSunlit(position: Eci, ms: number): boolean {
  return shadowFraction(sunPos(julian(ms)).rsun, position) < 0.99;
}

/** The sun's elevation for an observer, degrees: below -6° the sky is dark enough to see a satellite. */
export function sunElevation(observer: Observer, ms: number): number {
  const { rsun } = sunPos(julian(ms));
  const sun = { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM };
  return ecfToLookAngles(observerGeodetic(observer), eciToEcf(sun, gstime(julian(ms)))).elevation * DEG;
}

export interface SatelliteNow {
  lat: number;
  lon: number;
  altKm: number;
  speedKmS: number;
  sunlit: boolean;
}

export function satelliteNow(satrec: SatRec, ms: number): SatelliteNow | null {
  const s = stateAt(satrec, ms);
  if (!s) return null;
  const g = eciToGeodetic(s.position, gstime(julian(ms)));
  const v = s.velocity;
  return {
    lat: g.latitude * DEG,
    lon: g.longitude * DEG,
    altKm: g.height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
    sunlit: isSunlit(s.position, ms),
  };
}

/** Where a satellite is in one observer's sky, and whether they could see it. */
export interface Look {
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
  altKm: number;
  speedKmS: number;
  sunlit: boolean;
  /** The sun's elevation for the observer: below -6° the sky is dark enough. */
  sunElevationDeg: number;
}

export function lookFrom(satrec: SatRec, observer: Observer, ms: number): Look | null {
  const s = stateAt(satrec, ms);
  if (!s) return null;
  const gmst = gstime(julian(ms));
  const angles = ecfToLookAngles(observerGeodetic(observer), eciToEcf(s.position, gmst));
  const v = s.velocity;
  return {
    azimuthDeg: ((angles.azimuth * DEG) % 360 + 360) % 360,
    elevationDeg: angles.elevation * DEG,
    rangeKm: angles.rangeSat,
    altKm: eciToGeodetic(s.position, gmst).height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
    sunlit: isSunlit(s.position, ms),
    sunElevationDeg: sunElevation(observer, ms),
  };
}

/** A pass, plus whether it can be seen with the eye: sunlit at its peak while the observer's sky is dark. */
export type PassInfo = PassResult & { visible?: boolean };

export function nextPass(satrec: SatRec, meanMotion: number, observer: Observer, ms: number): PassInfo {
  // A low orbit is above 10° for a few minutes: steps of a 60th of an orbit can't jump one.
  const stepMs = Math.min(5 * 60_000, Math.max(20_000, (periodMinutes(meanMotion) * 60_000) / 60));
  const result = findNextPass((t) => elevationFrom(satrec, observer, t), ms, {
    horizonMs: 24 * 3_600_000,
    stepMs,
    minElevation: MIN_PASS_ELEVATION,
  });
  if (result.kind !== 'pass') return result;
  const s = stateAt(satrec, result.pass.peak);
  const visible = !!s && isSunlit(s.position, result.pass.peak) && sunElevation(observer, result.pass.peak) < -6;
  return { ...result, visible };
}
