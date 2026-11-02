import { describe, expect, it } from 'vitest';
import { circleContains, circlesCover, circlesFor } from './circles';

const JOHANNESBURG = { south: -27, west: 27.5, north: -25.5, east: 29 }; // a city-region view
const HIGHVELD_TO_DURBAN = { south: -31, west: 26, north: -24, east: 32 };
const SOUTH_AFRICA = { south: -35, west: 16, north: -22, east: 33 };
const AFRICA = { south: -35, west: -18, north: 37, east: 52 };

describe('circlesFor', () => {
  it('covers a city-region view with one small circle', () => {
    const circles = circlesFor([JOHANNESBURG]);
    expect(circles).toHaveLength(1);
    expect(circles![0]!.radiusNm).toBeLessThan(250);
  });

  it('tiles a region with a few circles of at most 250 nm', () => {
    const circles = circlesFor([HIGHVELD_TO_DURBAN])!;
    expect(circles.length).toBeGreaterThan(1);
    expect(circles.length).toBeLessThanOrEqual(6);
    for (const c of circles) expect(c.radiusNm).toBeLessThanOrEqual(250);
  });

  it('stands aside for a whole country (South Africa needs 3 x 3 circles), a continent, or the world', () => {
    expect(circlesFor([SOUTH_AFRICA])).toBeNull();
    expect(circlesFor([AFRICA])).toBeNull();
    expect(circlesFor([{ south: -85, west: -300, north: 85, east: 300 }])).toBeNull();
  });

  it('is empty when nobody has sent a view', () => {
    expect(circlesFor([])).toEqual([]);
  });

  it('gives the same circles for a small pan, so it does not poll again', () => {
    const panned = { south: -26.95, west: 27.55, north: -25.45, east: 29.05 };
    expect(circlesFor([panned])).toEqual(circlesFor([JOHANNESBURG]));
  });

  it('splits a view across the antimeridian', () => {
    const fiji = circlesFor([{ south: -19, west: 177, north: -16, east: 182 }])!;
    expect(fiji.some((c) => c.lon > 170)).toBe(true);
    expect(fiji.some((c) => c.lon < -170)).toBe(true);
  });

  it('drops a view another view already covers', () => {
    expect(circlesFor([HIGHVELD_TO_DURBAN, JOHANNESBURG])).toEqual(circlesFor([HIGHVELD_TO_DURBAN]));
  });
});

describe('circle containment', () => {
  const big = { lat: -26, lon: 28, radiusNm: 250 };
  it('knows a small circle inside a big one', () => {
    expect(circleContains(big, { lat: -26, lon: 28.5, radiusNm: 50 })).toBe(true);
    expect(circleContains(big, { lat: -20, lon: 28, radiusNm: 50 })).toBe(false);
    expect(circlesCover([big], [{ lat: -26.2, lon: 28.1, radiusNm: 75 }])).toBe(true);
    expect(circlesCover([], [big])).toBe(false);
  });
});
