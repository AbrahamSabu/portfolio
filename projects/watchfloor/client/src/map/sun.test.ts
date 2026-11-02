import { describe, expect, it } from 'vitest';
import { shade } from './nightLayer';
import { solarElevation, subsolarPoint } from './sun';

describe('subsolarPoint', () => {
  it('puts the sun over the Tropic of Cancer at the June solstice, near Greenwich at noon UTC', () => {
    const sun = subsolarPoint(Date.UTC(2026, 5, 21, 12));
    expect(sun.lat).toBeCloseTo(23.44, 1);
    // The equation of time is about -1.7 minutes then: Greenwich's noon comes at 12:01.7 UTC, so the sun is still about 0.4° east.
    expect(sun.lon).toBeGreaterThan(0.3);
    expect(sun.lon).toBeLessThan(0.6);
  });

  it('puts it over the equator at the March equinox, and moves it 15° west an hour', () => {
    const at = subsolarPoint(Date.UTC(2026, 2, 20, 14, 46));
    expect(Math.abs(at.lat)).toBeLessThan(0.05);
    const later = subsolarPoint(Date.UTC(2026, 2, 20, 15, 46));
    expect(at.lon - later.lon).toBeCloseTo(15, 1);
  });

  it('keeps longitude within -180 to 180', () => {
    for (let h = 0; h < 24; h++) {
      const { lon } = subsolarPoint(Date.UTC(2026, 9, 31, h));
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThan(180);
    }
  });
});

describe('solarElevation', () => {
  const sun = { lat: 10, lon: 20 };
  it('is 90° under the sun, -90° opposite, 0° a quarter of the way round', () => {
    expect(solarElevation(sun, 10, 20)).toBeCloseTo(90);
    expect(solarElevation(sun, -10, -160)).toBeCloseTo(-90);
    expect(solarElevation({ lat: 0, lon: 0 }, 0, 90)).toBeCloseTo(0);
  });
});

describe('shade', () => {
  const alpha = (el: number) => shade(el)[3];
  it('washes the day faintly, marks sunset with a line, and darkens through twilight to full night', () => {
    expect(alpha(30)).toBe(22);
    expect(shade(0)).toEqual([63, 182, 255, 120]);
    expect(alpha(0.6)).toBe(60);
    expect(alpha(-20)).toBe(165);
    const twilight = [-1.5, -3, -6, -9].map(alpha);
    expect(twilight).toEqual([...twilight].sort((a, b) => a - b));
    expect(twilight[0]).toBeGreaterThan(0);
    expect(twilight[3]).toBeLessThan(165);
  });
});
