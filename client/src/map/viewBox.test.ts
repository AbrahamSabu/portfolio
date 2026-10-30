import { describe, expect, it } from 'vitest';
import { facesViewer, inViewBox, padViewBox, viewForServer } from './viewBox';

const channel = { west: -2, south: 49.5, east: 2, north: 51.5 };

describe('inViewBox', () => {
  it('includes positions inside and excludes those outside', () => {
    expect(inViewBox(channel, 0, 50.5)).toBe(true);
    expect(inViewBox(channel, 5, 50.5)).toBe(false);
    expect(inViewBox(channel, 0, 53)).toBe(false);
  });

  it('handles a view across the antimeridian', () => {
    const pacific = { west: 170, south: -20, east: 190, north: 0 }; // MapLibre reports east past 180
    expect(inViewBox(pacific, -175, -10)).toBe(true);
    expect(inViewBox(pacific, 175, -10)).toBe(true);
    expect(inViewBox(pacific, 0, -10)).toBe(false);
  });

  it('treats a view wider than the world as everywhere', () => {
    expect(inViewBox({ west: -300, south: -85, east: 300, north: 85 }, 123, 10)).toBe(true);
  });
});

describe('padViewBox', () => {
  it('grows the box on every side, clamped at the poles', () => {
    expect(padViewBox(channel, 0.5)).toEqual({ west: -4, south: 48.5, east: 4, north: 52.5 });
    expect(padViewBox({ west: 0, south: 60, east: 10, north: 85 }, 0.5).north).toBe(90);
  });
});

describe('viewForServer', () => {
  it('adds a 20% margin', () => {
    expect(viewForServer({ west: 0, south: 50, east: 10, north: 52 })).toEqual({
      west: -2,
      south: 49.6,
      east: 12,
      north: 52.4,
    });
  });

  it('collapses a view wider than the world to exactly the world', () => {
    const v = viewForServer({ west: -700, south: -85, east: 700, north: 85 });
    expect([v.west, v.east]).toEqual([-180, 180]);
  });
});

describe('facesViewer', () => {
  const europe = { lat: 48, lon: 10 };
  it('says whether a place is on the visible side of the globe', () => {
    expect(facesViewer(europe, { lat: 35.7, lon: 51.4 }, 1)).toBe(true); // Tehran, about 37° away
    expect(facesViewer(europe, { lat: -33.9, lon: 151.2 }, 1)).toBe(false); // Sydney, round the back
    expect(facesViewer(europe, { lat: -33.9, lon: 151.2 }, 6)).toBe(true); // zoomed in, the bounds decide
  });
});
