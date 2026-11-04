import { describe, expect, it } from 'vitest';
import { anglesOf, blend, compassPoint, deviceDirection, directionOf, guidance, nearestTo, separationDeg, skyPosition } from './skyMath';

const CORK = { lat: 51.9, lon: -8.5 };

describe('deviceDirection', () => {
  it('held upright facing north, the camera looks north and level', () => {
    const a = anglesOf(deviceDirection(0, 90, 0));
    expect(a.azimuthDeg).toBeCloseTo(0, 6);
    expect(a.elevationDeg).toBeCloseTo(0, 6);
  });

  it('turning to face west raises alpha to 90 (it counts anticlockwise)', () => {
    expect(anglesOf(deviceDirection(90, 90, 0)).azimuthDeg).toBeCloseTo(270, 6);
    expect(anglesOf(deviceDirection(270, 90, 0)).azimuthDeg).toBeCloseTo(90, 6);
  });

  it('tilting the top back looks up the sky', () => {
    const a = anglesOf(deviceDirection(0, 120, 0));
    expect(a.elevationDeg).toBeCloseTo(30, 6);
    expect(a.azimuthDeg).toBeCloseTo(0, 6);
    // Lying face down on a table, the camera looks straight up.
    expect(anglesOf(deviceDirection(0, 180, 0)).elevationDeg).toBeCloseTo(90, 6);
  });
});

describe('skyPosition', () => {
  it('puts an aircraft right above you at the zenith', () => {
    expect(skyPosition(CORK, { ...CORK, altitudeM: 10_000 }).elevationDeg).toBe(90);
  });

  it('puts one 10 km north at 10 km up at 45°, a touch lower for the curve', () => {
    const p = skyPosition(CORK, { lat: CORK.lat + 10_000 / 111_200, lon: CORK.lon, altitudeM: 10_000 });
    expect(p.azimuthDeg).toBeCloseTo(0, 1);
    expect(p.elevationDeg).toBeLessThan(45);
    expect(p.elevationDeg).toBeGreaterThan(44.9);
  });

  it('lets the curve pull a distant, low aircraft down to the horizon', () => {
    const p = skyPosition(CORK, { lat: CORK.lat, lon: CORK.lon + 0.8, altitudeM: 200 });
    expect(p.groundM).toBeGreaterThan(50_000);
    expect(p.elevationDeg).toBeLessThan(0.1);
  });
});

describe('aiming', () => {
  it('measures the angle between directions', () => {
    const north = directionOf({ azimuthDeg: 0, elevationDeg: 0 });
    expect(separationDeg(north, north)).toBeCloseTo(0, 6);
    expect(separationDeg(north, directionOf({ azimuthDeg: 90, elevationDeg: 0 }))).toBeCloseTo(90, 6);
  });

  it('picks the aircraft nearest to where the phone points', () => {
    const pointing = directionOf({ azimuthDeg: 40, elevationDeg: 20 });
    const planes = [
      { id: 'a', dir: directionOf({ azimuthDeg: 120, elevationDeg: 30 }) },
      { id: 'b', dir: directionOf({ azimuthDeg: 45, elevationDeg: 22 }) },
    ];
    const hit = nearestTo(pointing, planes);
    expect(hit?.item.id).toBe('b');
    expect(hit?.offDeg).toBeLessThan(6);
  });

  it('says which way to turn, the short way round north', () => {
    expect(guidance({ azimuthDeg: 350, elevationDeg: 10 }, { azimuthDeg: 10, elevationDeg: 25 })).toEqual({ turnDeg: 20, tiltDeg: 15 });
    expect(guidance({ azimuthDeg: 10, elevationDeg: 30 }, { azimuthDeg: 330, elevationDeg: 30 }).turnDeg).toBe(-40);
  });

  it('smooths through north without spinning', () => {
    const a = directionOf({ azimuthDeg: 359, elevationDeg: 0 });
    const b = directionOf({ azimuthDeg: 1, elevationDeg: 0 });
    const mid = anglesOf(blend(a, b, 0.5)).azimuthDeg;
    expect(Math.min(mid, 360 - mid)).toBeLessThan(0.5);
  });

  it('names compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(44)).toBe('NE');
    expect(compassPoint(350)).toBe('N');
    expect(compassPoint(225)).toBe('SW');
  });
});
