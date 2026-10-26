import { describe, expect, it } from 'vitest';
import { inViewBox, padViewBox } from './viewBox';

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
