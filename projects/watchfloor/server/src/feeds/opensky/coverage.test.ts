import { describe, expect, it } from 'vitest';
import { covers, describePlan, normalizeView, planCost, planCoverage, requestCost, snap } from './coverage';

const CHANNEL = { south: 49.3, west: -4.5, north: 51.6, east: 2.8 };
const LONDON = { south: 51.2, west: -0.6, north: 51.8, east: 0.4 };
const TOKYO = { south: 35.4, west: 139.4, north: 35.9, east: 140.1 };

describe('requestCost', () => {
  it('charges 1 credit for the English Channel box (about 17 square degrees)', () => {
    expect(requestCost(CHANNEL)).toBe(1);
  });

  it('charges 4 credits for the whole world', () => {
    expect(requestCost(null)).toBe(4);
  });

  it('follows the documented area bands', () => {
    expect(requestCost({ south: 0, west: 0, north: 10, east: 10 })).toBe(2);
    expect(requestCost({ south: 0, west: 0, north: 20, east: 20 })).toBe(3);
    expect(requestCost({ south: -90, west: -180, north: 90, east: 180 })).toBe(4);
  });
});

describe('normalizeView', () => {
  it('leaves an ordinary view alone, clamping latitude', () => {
    expect(normalizeView({ south: -95, west: 10, north: 20, east: 30 })).toEqual([
      { south: -90, west: 10, north: 20, east: 30 },
    ]);
  });

  it('splits a view across the antimeridian into two boxes', () => {
    expect(normalizeView({ south: -20, west: 170, north: 0, east: 190 })).toEqual([
      { south: -20, west: 170, north: 0, east: 180 },
      { south: -20, west: -180, north: 0, east: -170 },
    ]);
  });

  it('shifts a view that has wrapped a whole world west', () => {
    expect(normalizeView({ south: 50, west: -365, north: 52, east: -358 })).toEqual([
      { south: 50, west: -5, north: 52, east: 2 },
    ]);
  });

  it('treats a view wider than the world as the world', () => {
    expect(normalizeView({ south: -85, west: -300, north: 85, east: 300 })).toBeNull();
  });
});

describe('snap', () => {
  it('rounds outward to whole degrees, so small pans make the same request', () => {
    expect(snap(LONDON)).toEqual({ south: 51, west: -1, north: 52, east: 1 });
    expect(snap({ south: 51.25, west: -0.55, north: 51.75, east: 0.35 })).toEqual(snap(LONDON));
  });
});

describe('planCoverage', () => {
  it('requests nothing when nobody has sent a view', () => {
    expect(planCoverage([])).toEqual([]);
  });

  it('requests one snapped box for one zoomed-in viewer, at 1 credit', () => {
    const plan = planCoverage([LONDON]);
    expect(plan).toEqual([{ south: 51, west: -1, north: 52, east: 1 }]);
    expect(planCost(plan)).toBe(1);
  });

  it('asks for the world when a view is the whole world', () => {
    expect(planCoverage([{ south: -85, west: -300, north: 85, east: 300 }])).toBeNull();
  });

  it('polls far-apart viewers separately rather than one huge box', () => {
    const plan = planCoverage([LONDON, TOKYO]);
    expect(plan).toHaveLength(2);
    expect(planCost(plan)).toBe(2);
  });

  it('merges nearby viewers into one box when that is no dearer', () => {
    const plan = planCoverage([LONDON, { south: 48.6, west: 2, north: 49.1, east: 2.7 }]); // London and Paris
    expect(plan).toEqual([{ south: 48, west: -1, north: 52, east: 3 }]);
    expect(planCost(plan)).toBe(1);
  });

  it('drops a view another view already covers', () => {
    expect(planCoverage([CHANNEL, LONDON])).toEqual([snap(CHANNEL)]);
  });

  it('prefers the world once separate boxes cost as much', () => {
    const big = [
      { south: 0, west: 0, north: 15, east: 15 },
      { south: 0, west: 100, north: 15, east: 115 },
    ]; // 3 + 3 credits apart, 4 around both
    expect(planCoverage(big)).toBeNull();
  });
});

describe('covers', () => {
  const london = planCoverage([LONDON]);

  it('says a world poll covers anything', () => {
    expect(covers(null, london)).toBe(true);
  });

  it('says a box poll covers views inside it but not the world', () => {
    expect(covers(planCoverage([CHANNEL]), london)).toBe(true);
    expect(covers(london, planCoverage([CHANNEL]))).toBe(false);
    expect(covers(london, null)).toBe(false);
  });

  it('says nothing polled covers nothing', () => {
    expect(covers([], london)).toBe(false);
  });
});

describe('describePlan', () => {
  it('is short enough for a log line', () => {
    expect(describePlan(null)).toBe('world');
    expect(describePlan([])).toBe('none');
    expect(describePlan(planCoverage([LONDON]))).toBe('51,-1,52,1');
  });
});
