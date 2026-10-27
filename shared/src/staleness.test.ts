import { describe, expect, it } from 'vitest';
import { AIS_STALENESS, DEFAULT_STALENESS, polledStaleness, ruleFor, trackStatus, type StalenessRules } from './staleness';

describe('ruleFor', () => {
  const rules: StalenessRules = {
    ...DEFAULT_STALENESS,
    bySource: { adsb: { staleAfterMs: 45_000, dropAfterMs: 180_000 } },
  };

  it('uses the domain default when the source has no override', () => {
    expect(ruleFor({ source: 'sim', domain: 'air' }, rules)).toBe(rules.byDomain.air);
    expect(ruleFor({ source: 'ais', domain: 'sea' }, rules)).toBe(rules.byDomain.sea);
  });

  it('prefers a source override', () => {
    expect(ruleFor({ source: 'adsb', domain: 'air' }, rules)).toBe(rules.bySource.adsb);
  });
});

describe('polledStaleness', () => {
  const air = DEFAULT_STALENESS.byDomain.air;

  it('tolerates one missed poll at a 10 s interval', () => {
    expect(polledStaleness(10_000, air)).toEqual({ staleAfterMs: 45_000, dropAfterMs: 120_000 });
  });

  it('scales with slow anonymous polling', () => {
    expect(polledStaleness(60_000, air)).toEqual({ staleAfterMs: 145_000, dropAfterMs: 360_000 });
  });

  it('never goes below the domain default', () => {
    const rule = polledStaleness(1_000, air);
    expect(rule.staleAfterMs).toBeGreaterThanOrEqual(air.staleAfterMs);
    expect(rule.dropAfterMs).toBe(air.dropAfterMs);
  });
});

describe('AIS_STALENESS', () => {
  it('keeps a moored ship live between its 3-minute reports, unlike the sea default', () => {
    const rules: StalenessRules = { ...DEFAULT_STALENESS, bySource: { ais: AIS_STALENESS } };
    const moored = { source: 'ais', domain: 'sea' } as const;
    const sim = { source: 'sim', domain: 'sea' } as const;
    expect(trackStatus(3 * 60_000 + 5_000, ruleFor(moored, rules))).toBe('live');
    expect(trackStatus(3 * 60_000 + 5_000, ruleFor(sim, rules))).toBe('stale');
    // Two missed reports in a row is the honest signal.
    expect(trackStatus(2 * 3 * 60_000 + 31_000, ruleFor(moored, rules))).toBe('stale');
  });
});
