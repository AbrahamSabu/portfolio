import { describe, expect, it } from 'vitest';
import {
  approach,
  bearingDeg,
  deadReckon,
  destination,
  distanceM,
  headingDelta,
  normalizeDeg,
  normalizeLon,
} from './geo';

const dover = { lat: 51.127, lon: 1.313 };
const calais = { lat: 50.951, lon: 1.858 };

describe('geo', () => {
  it('normalises angles and longitudes', () => {
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-190)).toBe(170);
  });

  it('finds the shortest turn between headings', () => {
    expect(headingDelta(350, 10)).toBe(20);
    expect(headingDelta(10, 350)).toBe(-20);
    expect(headingDelta(0, 180)).toBe(180);
  });

  it('measures one degree of latitude as about 111.2 km', () => {
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) / 1000).toBeCloseTo(111.195, 2);
  });

  it('round-trips bearing and distance through destination()', () => {
    const d = distanceM(dover, calais);
    const end = destination(dover, bearingDeg(dover, calais), d);
    expect(distanceM(end, calais)).toBeLessThan(1);
  });

  it('dead reckons along course at speed', () => {
    // 10 m/s due east for 100 s = 1 km east.
    const p = deadReckon({ lat: 50, lon: 0 }, 90, 10, 100_000);
    expect(distanceM({ lat: 50, lon: 0 }, p)).toBeCloseTo(1000, 0);
    expect(bearingDeg({ lat: 50, lon: 0 }, p)).toBeCloseTo(90, 1);
  });

  it('does not move a stationary or future track', () => {
    expect(deadReckon({ lat: 1, lon: 2 }, 45, 0, 10_000)).toEqual({ lat: 1, lon: 2 });
    expect(deadReckon({ lat: 1, lon: 2 }, 45, 10, -5)).toEqual({ lat: 1, lon: 2 });
  });
});

describe('approach', () => {
  const at = (lat: number, lon: number, courseDeg: number, speedMps: number) => ({ lat, lon, courseDeg, speedMps });

  it('meets head-on in range over closing speed', () => {
    // b is ~2 km north of a; a runs north at 10 m/s, b south at 10 m/s.
    const a = approach(at(0, 0, 0, 10), at(2000 / 111_195, 0, 180, 10));
    expect(a.rangeM).toBeCloseTo(2000, -1);
    expect(a.bearingDeg).toBeCloseTo(0, 0);
    expect(a.closingMps).toBeCloseTo(20, 1);
    expect(a.tcpaS).toBeCloseTo(100, 0);
    expect(a.cpaM).toBeLessThan(1);
  });

  it('holds steady when the courses are parallel at the same speed', () => {
    const a = approach(at(0, 0, 90, 10), at(0.01, 0, 90, 10));
    expect(a.closingMps).toBeCloseTo(0, 3);
    expect(a.tcpaS).toBe(0);
    expect(a.cpaM).toBeCloseTo(a.rangeM, 0);
  });

  it('is already past the closest point when they are opening', () => {
    // b is north of a and running further north; a stands still.
    const a = approach(at(0, 0, 0, 0), at(0.01, 0, 0, 10));
    expect(a.closingMps).toBeLessThan(0);
    expect(a.tcpaS).toBe(0);
    expect(a.cpaM).toBeCloseTo(a.rangeM, 0);
  });

  it('misses abeam on crossing courses', () => {
    // b starts 1 km east of a, running north; a stands still: CPA is now.
    const a = approach(at(0, 0, 0, 0), at(0, 1000 / 111_195, 0, 10));
    expect(a.bearingDeg).toBeCloseTo(90, 0);
    expect(a.tcpaS).toBe(0);
    expect(a.cpaM).toBeCloseTo(a.rangeM, 0);
  });
});
