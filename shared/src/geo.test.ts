import { describe, expect, it } from 'vitest';
import {
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
