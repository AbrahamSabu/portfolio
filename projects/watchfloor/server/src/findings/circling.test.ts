import { describe, expect, it } from 'vitest';
import { circling } from './circling';

const NOW = 1_700_000_000_000;

/** Flat [lon, lat, t, ...] of an orbit: `laps` circles of `radiusM`, ending at NOW. */
function orbit(laps: number, radiusM: number, minutes: number, pointsPerLap = 24, clockwise = true): number[] {
  const cLat = 52;
  const cLon = 4;
  const n = Math.round(laps * pointsPerLap);
  const data: number[] = [];
  for (let i = 0; i <= n; i++) {
    const angle = ((clockwise ? i : -i) / pointsPerLap) * 2 * Math.PI;
    const lat = cLat + (radiusM * Math.cos(angle)) / 110_540;
    const lon = cLon + (radiusM * Math.sin(angle)) / (111_320 * Math.cos((cLat * Math.PI) / 180));
    data.push(lon, lat, NOW - minutes * 60_000 + (i / n) * minutes * 60_000);
  }
  return data;
}

/** A straight run: what a cruising jet's thinned path looks like, plus spare points. */
function straight(points: number, minutes: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < points; i++) {
    data.push(4 + i * 0.05, 52 + i * 0.01, NOW - minutes * 60_000 + (i / (points - 1)) * minutes * 60_000);
  }
  return data;
}

describe('circling', () => {
  it('finds a tight orbit and measures it', () => {
    const c = circling(orbit(3, 2000, 9), NOW);
    expect(c).not.toBeNull();
    expect(c!.turns).toBeGreaterThan(2.5);
    expect(c!.turns).toBeLessThan(3.5);
    expect(c!.radiusM).toBeGreaterThan(1500);
    expect(c!.radiusM).toBeLessThan(2500);
    expect(c!.lat).toBeCloseTo(52, 1);
    expect(c!.lon).toBeCloseTo(4, 1);
    expect(c!.minutes).toBe(9);
  });

  it('finds an anticlockwise orbit too', () => {
    expect(circling(orbit(2.5, 3000, 10, 24, false), NOW)).not.toBeNull();
  });

  it('ignores a straight run', () => {
    expect(circling(straight(40, 10), NOW)).toBeNull();
  });

  it('ignores fewer than two full turns', () => {
    expect(circling(orbit(1.5, 2000, 6), NOW)).toBeNull();
  });

  it('ignores wide loops: en-route manoeuvring is not an orbit', () => {
    expect(circling(orbit(3, 30_000, 14), NOW)).toBeNull();
  });

  it('ignores an orbit that ended before the window', () => {
    const old = orbit(3, 2000, 9).map((v, i) => (i % 3 === 2 ? v - 30 * 60_000 : v));
    expect(circling(old, NOW)).toBeNull();
  });

  it('needs enough points to mean anything', () => {
    expect(circling(orbit(3, 2000, 9, 3), NOW)).toBeNull();
  });

  it('a figure-eight cancels itself out', () => {
    // 1.5 turns one way, then 1.5 turns back: 3 turns of manoeuvring, no net circling.
    const first = orbit(1.5, 2000, 5).map((v, i) => (i % 3 === 2 ? v - 5 * 60_000 : v));
    const second = orbit(1.5, 2000, 5, 24, false);
    expect(circling([...first, ...second], NOW)).toBeNull();
  });
});
