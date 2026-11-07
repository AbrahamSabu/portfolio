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

describe('planAisBoxes on a capped server (AIS_MAX_AREA)', () => {
  const globe = { south: -85, west: -180, north: 85, east: 180 };
  const europe = { south: 35, west: -10, north: 60, east: 30 };
  const channel = { south: 49.2, west: -5.5, north: 51.8, east: 2.5 };

  it('leaves out views wider than the cap and keeps the closer ones', () => {
    expect(planAisBoxes([globe, europe, channel], 600)).toEqual([{ south: 49, west: -6, north: 52, east: 3 }]);
  });

  it('streams nothing new while every view is too wide (the last subscription stays)', () => {
    expect(planAisBoxes([globe, europe], 600)).toEqual([]);
    expect(planAisBoxes([globe])).toEqual([WORLD]);
  });

  it("keeps a crowd's first boxes instead of one box round them all", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => ({ south: 0, west: i * 5, north: 1, east: i * 5 + 1 }));
    expect(planAisBoxes(crowd, 600)).toHaveLength(16);
    expect(planAisBoxes(crowd)).toEqual([{ south: 0, west: 0, north: 1, east: 96 }]);
  });
});
