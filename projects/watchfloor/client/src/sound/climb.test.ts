import { describe, expect, it } from 'vitest';
import { ClimbRates } from './climb';

describe('ClimbRates', () => {
  it('needs two reports far enough apart', () => {
    const climbs = new ClimbRates();
    climbs.observe('a', 1000, 0, 0);
    expect(climbs.rateOf('a')).toBeUndefined();
    expect(climbs.climbOf('a')).toBe('level');
    // 2 s later, 25 ft (7.6 m) higher: altitude steps, not a climb.
    climbs.observe('a', 1007.6, 2_000, 2_000);
    expect(climbs.rateOf('a')).toBeUndefined();
    climbs.observe('a', 1050, 10_000, 10_000);
    expect(climbs.rateOf('a')).toBeCloseTo(5, 6);
    expect(climbs.climbOf('a')).toBe('climbing');
  });

  it('reads descents, and levels off within a couple of reports', () => {
    const climbs = new ClimbRates();
    climbs.observe('a', 3000, 0, 0);
    climbs.observe('a', 2920, 10_000, 10_000);
    expect(climbs.climbOf('a')).toBe('descending');
    climbs.observe('a', 2920, 20_000, 20_000);
    climbs.observe('a', 2920, 30_000, 30_000);
    expect(climbs.climbOf('a')).toBe('level');
  });

  it('clips a jump between altitude sources, and averages it away', () => {
    const climbs = new ClimbRates();
    climbs.observe('a', 9000, 0, 0);
    climbs.observe('a', 9600, 10_000, 10_000); // 60 m/s: a different altitude source
    expect(climbs.rateOf('a')).toBe(40);
    climbs.observe('a', 9600, 20_000, 20_000);
    expect(climbs.rateOf('a')).toBe(20);
  });

  it('starts over after a long silence, ignores aircraft without altitude, and forgets the unseen', () => {
    const climbs = new ClimbRates();
    climbs.observe('a', 1000, 0, 0);
    climbs.observe('a', 9000, 600_000, 600_000);
    expect(climbs.rateOf('a')).toBeUndefined();
    climbs.observe('b', undefined, 0, 0);
    expect(climbs.size).toBe(1);
    climbs.prune(600_000 + 300_001);
    expect(climbs.size).toBe(0);
  });
});
