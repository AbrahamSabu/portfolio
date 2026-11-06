import type { SatelliteElements } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import {
  apsidesKm,
  dockedStacks,
  findNextPass,
  isGeostationary,
  isSunSynchronous,
  mercatorY,
  nodalPrecessionDegPerDay,
  orbitClass,
  periodMinutes,
  satelliteIntervalMs,
  shellScale,
  splitAtAntimeridian,
} from './orbit';

const base: SatelliteElements = {
  id: 1,
  name: 'TEST',
  intl: '',
  epoch: Date.UTC(2026, 10, 6),
  meanMotion: 15.4919453,
  eccentricity: 0.00071954,
  inclination: 51.6327,
  raan: 319.056,
  argPerigee: 352.5747,
  meanAnomaly: 7.5134,
  bstar: 0.0001274916,
  meanMotionDot: 0.00006629,
  meanMotionDdot: 0,
};
// Orbits as CelesTrak published them, Nov 2026 (rounded).
const ISS = base;
const NOAA_20 = { ...base, meanMotion: 14.1952, eccentricity: 0.0001, inclination: 98.75 };
const GOES_19 = { ...base, meanMotion: 1.00271, eccentricity: 0.0001, inclination: 0.05 };
const GPS = { ...base, meanMotion: 2.00563, eccentricity: 0.005, inclination: 55 };
const MOLNIYA = { ...base, meanMotion: 2.006, eccentricity: 0.72, inclination: 63.4 };

describe('orbit facts from the elements', () => {
  it('gives the ISS its 93-minute, roughly 420 km orbit', () => {
    expect(periodMinutes(ISS.meanMotion)).toBeCloseTo(92.95, 1);
    const { apogee, perigee } = apsidesKm(ISS);
    expect(perigee).toBeGreaterThan(405);
    expect(apogee).toBeLessThan(430);
  });

  it('sorts orbits into their families', () => {
    expect(orbitClass(ISS)).toBe('LEO');
    expect(orbitClass(NOAA_20)).toBe('LEO');
    expect(orbitClass(GPS)).toBe('MEO');
    expect(orbitClass(GOES_19)).toBe('GEO');
    expect(orbitClass(MOLNIYA)).toBe('HEO');
    expect(isGeostationary(GOES_19)).toBe(true);
    expect(isGeostationary({ ...GOES_19, inclination: 8 })).toBe(false);
  });

  it('finds the plane that keeps pace with the sun', () => {
    // The ISS's plane drifts west about 5° a day; a polar weather satellite's turns east 0.99° a day, like the sun.
    expect(nodalPrecessionDegPerDay(ISS)).toBeCloseTo(-5.0, 0);
    expect(nodalPrecessionDegPerDay(NOAA_20)).toBeCloseTo(0.9856, 1);
    expect(isSunSynchronous(NOAA_20)).toBe(true);
    expect(isSunSynchronous(ISS)).toBe(false);
    expect(isSunSynchronous(GOES_19)).toBe(false);
  });
});

describe('drawing', () => {
  it('draws the shell to scale zoomed out and on the ground zoomed in', () => {
    expect(shellScale(1)).toBe(1);
    expect(shellScale(3)).toBe(1);
    expect(shellScale(4)).toBeCloseTo(0.5);
    expect(shellScale(5)).toBe(0);
    expect(shellScale(12)).toBe(0);
  });

  it('redraws about once a second at world view and ten times a second zoomed in', () => {
    expect(satelliteIntervalMs(1, 0)).toBe(1000);
    expect(satelliteIntervalMs(6, 50)).toBe(100);
    const mid = satelliteIntervalMs(3, 0);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(1000);
  });

  it('projects latitude as Web Mercator', () => {
    expect(mercatorY(0)).toBeCloseTo(0.5);
    expect(mercatorY(85.0511)).toBeCloseTo(0, 3);
    expect(mercatorY(-85.0511)).toBeCloseTo(1, 3);
  });

  it('cuts a line where it crosses the antimeridian, either way', () => {
    // Eastward from 170°E to 170°W, climbing: it crosses 180 halfway, at 15°.
    expect(splitAtAntimeridian([170, -170], [10, 20])).toEqual([
      [
        [170, 10],
        [180, 15],
      ],
      [
        [-180, 15],
        [-170, 20],
      ],
    ]);
    // Westward, over -180.
    expect(splitAtAntimeridian([-175, 175], [0, 0])).toEqual([
      [
        [-175, 0],
        [-180, 0],
      ],
      [
        [180, 0],
        [175, 0],
      ],
    ]);
    expect(splitAtAntimeridian([10, 20, 30], [0, 1, 2])).toHaveLength(1);
  });
});

describe('findNextPass', () => {
  const MIN = 60_000;
  const opts = { horizonMs: 24 * 60 * MIN, stepMs: MIN, minElevation: 10 };
  /** A made-up sky: a hump every 100 minutes, peaking at 40° for a few minutes. */
  const humps = (t: number) => {
    const phase = ((t / MIN) % 100) - 50; // minutes from the peak
    return 40 - phase * phase * 2;
  };

  it('finds rise, peak and set to the second', () => {
    const result = findNextPass(humps, 0, opts);
    expect(result.kind).toBe('pass');
    if (result.kind !== 'pass') return;
    // 40 - 2p² >= 10 when |p| <= √15 ≈ 3.873 minutes either side of minute 50.
    expect(result.pass.rise! / MIN).toBeCloseTo(50 - Math.sqrt(15), 1);
    expect(result.pass.set / MIN).toBeCloseTo(50 + Math.sqrt(15), 1);
    expect(result.pass.peak / MIN).toBeCloseTo(50, 1);
    expect(result.pass.peakElevation).toBeCloseTo(40, 1);
  });

  it('says when it is already up, with no rise', () => {
    const result = findNextPass(humps, 49 * MIN, opts);
    expect(result.kind === 'pass' && result.pass.rise).toBeNull();
    expect(result.kind === 'pass' && result.pass.set / MIN).toBeCloseTo(50 + Math.sqrt(15), 1);
  });

  it('knows a satellite that never sets, and one that never rises', () => {
    expect(findNextPass(() => 25, 0, opts)).toEqual({ kind: 'always', elevation: 25 });
    expect(findNextPass(() => -5, 0, opts)).toEqual({ kind: 'none' });
  });
});

describe('dockedStacks', () => {
  it('draws a station and its visiting craft as one, under the oldest catalogue number', () => {
    const ids = [100057, 25544, 48274, 49044];
    const at: Record<number, [number, number, number]> = {
      100057: [6700, 10, 0], // Soyuz, docked
      25544: [6700, 0, 0], // ISS (Zarya)
      48274: [-6700, 0, 0], // Tiangong, far away
      49044: [6705, 0, 0], // Nauka module
    };
    const stacks = dockedStacks(ids, (i) => at[ids[i]!]!);
    expect([...stacks]).toEqual([[1, [3, 0]]]);
  });
});
