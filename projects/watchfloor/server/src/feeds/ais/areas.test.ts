import { describe, expect, it } from 'vitest';
import { describeBoxes, planAisBoxes, WORLD } from './areas';

describe('planAisBoxes', () => {
  it('snaps a view outward to whole degrees', () => {
    expect(planAisBoxes([{ south: 50.2, west: 0.4, north: 51.1, east: 1.7 }])).toEqual([
      { south: 50, west: 0, north: 52, east: 2 },
    ]);
  });

  it('gives the same plan for a small pan', () => {
    const a = planAisBoxes([{ south: 50.2, west: 0.4, north: 51.1, east: 1.7 }]);
    const b = planAisBoxes([{ south: 50.3, west: 0.5, north: 51.2, east: 1.8 }]);
    expect(describeBoxes(b)).toBe(describeBoxes(a));
  });

  it('keeps separate views separate, and drops one inside another', () => {
    expect(
      planAisBoxes([
        { south: 1.2, west: 103.5, north: 1.5, east: 104.1 }, // Singapore Strait
        { south: 50.2, west: 0.4, north: 51.1, east: 1.7 }, // Dover Strait
        { south: 50.5, west: 1.1, north: 50.9, east: 1.4 }, // zoomed in on Dover
      ]),
    ).toEqual([
      { south: 1, west: 103, north: 2, east: 105 },
      { south: 50, west: 0, north: 52, east: 2 },
    ]);
  });

  it('splits a view across the antimeridian, and takes the world for a world-wide view', () => {
    expect(planAisBoxes([{ south: -20, west: 170, north: -10, east: 190 }])).toEqual([
      { south: -20, west: -180, north: -10, east: -170 },
      { south: -20, west: 170, north: -10, east: 180 },
    ]);
    expect(planAisBoxes([{ south: -80, west: -200, north: 80, east: 200 }])).toEqual([WORLD]);
  });

  it('falls back to one box around a crowd of views', () => {
    const views = Array.from({ length: 20 }, (_, i) => ({ south: i, west: i * 5, north: i + 0.5, east: i * 5 + 0.5 }));
    expect(planAisBoxes(views)).toEqual([{ south: 0, west: 0, north: 20, east: 96 }]);
  });

  it('is empty with no views', () => {
    expect(planAisBoxes([])).toEqual([]);
    expect(describeBoxes([])).toBe('none');
  });
});
