import { describe, expect, it } from 'vitest';
import { skyLook, sunAt } from './sunSky';

describe('sunAt', () => {
  it('puts the noon sun due south from London in winter, low in the sky', () => {
    // 21 Dec 2026, 12:00 UTC: solar noon at Greenwich, give or take the equation of time.
    const sun = sunAt(Date.UTC(2026, 11, 21, 12, 0), 51.5, 0);
    expect(sun.azimuthDeg).toBeGreaterThan(175);
    expect(sun.azimuthDeg).toBeLessThan(185);
    expect(sun.elevationDeg).toBeCloseTo(90 - 51.5 - 23.44, 0);
  });

  it('rises in the east and sets in the west', () => {
    const morning = sunAt(Date.UTC(2026, 2, 20, 6, 30), 0, 0);
    const evening = sunAt(Date.UTC(2026, 2, 20, 17, 30), 0, 0);
    expect(Math.abs(morning.azimuthDeg - 90)).toBeLessThan(5);
    expect(Math.abs(evening.azimuthDeg - 270)).toBeLessThan(5);
  });
});

describe('skyLook', () => {
  it('is the app’s space navy at night and blue by day', () => {
    expect(skyLook({ elevationDeg: -30, azimuthDeg: 0 }).sky['sky-color']).toBe('#01050b');
    const day = skyLook({ elevationDeg: 45, azimuthDeg: 180 }).sky['sky-color'];
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(day.slice(i, i + 2), 16));
    expect(b!).toBeGreaterThan(r! + 100);
    expect(g!).toBeGreaterThan(r!);
  });

  it('changes smoothly through dusk', () => {
    const at = (e: number) => parseInt(skyLook({ elevationDeg: e, azimuthDeg: 0 }).sky['horizon-color'].slice(1), 16);
    for (let e = -20; e < 35; e += 0.5) {
      const a = at(e);
      const b = at(e + 0.5);
      // No channel jumps by more than a few steps for half a degree.
      for (const shift of [16, 8, 0]) expect(Math.abs(((a >> shift) & 255) - ((b >> shift) & 255))).toBeLessThan(16);
    }
  });

  it('lights the hillshade and MapLibre’s light from the sun', () => {
    const look = skyLook({ elevationDeg: 30, azimuthDeg: -90 });
    expect(look.shade.direction).toBe(270);
    expect(look.shade.altitude).toBe(30);
    expect(look.light.position).toEqual([1.5, 270, 60]);
  });

  it('flattens the relief when the sun is down', () => {
    const night = skyLook({ elevationDeg: -20, azimuthDeg: 0 });
    const day = skyLook({ elevationDeg: 40, azimuthDeg: 0 });
    expect(night.shade.exaggeration).toBeLessThan(day.shade.exaggeration / 3);
    expect(night.shade.altitude).toBe(8);
  });
});
