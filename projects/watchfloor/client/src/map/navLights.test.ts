import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceM } from '@watchfloor/shared';
import { lightLook, lightsFor, phaseOf, strobe, visibleLights, type OtherAircraft } from './navLights';

describe('visibleLights', () => {
  it('shows red and green to someone dead ahead', () => {
    expect(visibleLights(0)).toEqual({ red: true, green: true, white: false });
  });

  it('shows green alone off the right wing, red alone off the left', () => {
    expect(visibleLights(90)).toEqual({ red: false, green: true, white: false });
    expect(visibleLights(-90)).toEqual({ red: true, green: false, white: false });
  });

  it('shows the white tail light from behind', () => {
    expect(visibleLights(180)).toEqual({ red: false, green: false, white: true });
    expect(visibleLights(240).white).toBe(true);
    expect(visibleLights(260).white).toBe(false);
  });
});

describe('strobe', () => {
  it('double-flashes every 1.25 s', () => {
    const lit = Array.from({ length: 125 }, (_, i) => strobe(i * 10, 0)).filter(Boolean).length;
    expect(lit).toBe(12); // two 60 ms flashes in each 1,250 ms
    expect(strobe(30, 0)).toBe(1);
    expect(strobe(100, 0)).toBe(0);
    expect(strobe(1250 + 30, 0)).toBe(1);
  });

  it('gives each aircraft its own steady phase', () => {
    expect(phaseOf('adsb:4ca7b3')).toBe(phaseOf('adsb:4ca7b3'));
    expect(phaseOf('adsb:4ca7b3')).not.toBe(phaseOf('adsb:4ca7b4'));
    expect(phaseOf('x')).toBeGreaterThanOrEqual(0);
    expect(phaseOf('x')).toBeLessThan(1);
  });
});

describe('lightsFor', () => {
  // Heading north at 51° N; the viewer 5 km to its east, so off its right wing.
  const other: OtherAircraft = { id: 'a', platform: 'airliner', heavy: false, lat: 51, lon: 0, altM: 9000, courseDeg: 0 };
  const east = { lat: 51, lon: 0.0714 };
  const dark = 100; // a moment between strobe flashes, for phase('a')
  const darkTime = (() => {
    for (let t = 0; t < 1250; t += 10) if (strobe(t, phaseOf('a')) === 0) return t;
    return dark;
  })();

  it('shows the green wingtip, on the right of the course, half a wingspan out', () => {
    const lights = lightsFor(other, east, darkTime);
    expect(lights.map((l) => l.color)).toEqual(['green']);
    const green = lights[0]!;
    expect(distanceM(other, green)).toBeCloseTo(18, 0);
    expect(bearingDeg(other, green)).toBeCloseTo(90, 0);
    expect(green.altM).toBe(9000);
  });

  it('puts the strobes on both wingtips while they flash', () => {
    let flashing = 0;
    for (let t = 0; t < 1250; t += 10) if (strobe(t, phaseOf('a'))) flashing = t;
    const lights = lightsFor(other, east, flashing);
    expect(lights.filter((l) => l.color === 'white')).toHaveLength(2);
  });

  it('makes wide-bodies wider and keeps strobes dim and steady under reduced motion', () => {
    const lights = lightsFor({ ...other, heavy: true }, east, darkTime, true);
    expect(distanceM(other, lights[0]!)).toBeCloseTo(32, 0);
    expect(lights.filter((l) => l.color === 'white').every((l) => l.intensity === 0.35)).toBe(true);
  });
});

describe('lightLook', () => {
  it('draws near lights bigger and brighter, and never lets a far one vanish', () => {
    expect(lightLook(2_000).size).toBeGreaterThan(lightLook(50_000).size);
    expect(lightLook(140_000).size).toBeGreaterThanOrEqual(14);
    expect(lightLook(140_000).alpha).toBeGreaterThanOrEqual(0.85);
    expect(lightLook(1_000).alpha).toBe(1);
  });
});
