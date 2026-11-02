import { describe, expect, it } from 'vitest';
import { TRACK_VALUES, type Track } from '@watchfloor/shared';
import { DEFAULT_FILTER, PictureFilter, PLATFORMS_BY_DOMAIN, isFiltering, parseFilterState, sourceKeyOf } from './pictureFilter';

const track = (over: Partial<Track>): Track => ({
  id: 'adsb:abc123', source: 'adsb', domain: 'air', platform: 'airliner', affiliation: 'unknown',
  lat: 51.8, lon: -8.4, courseDeg: 90, speedMps: 200, observedAt: 0, provider: 'opensky', ...over,
});
const airliner = track({});
const heli = track({ id: 'adsb:def456', platform: 'helicopter', provider: 'adsb.fi' });
const tanker = track({ id: 'ais:235000001', source: 'ais', domain: 'sea', platform: 'tanker', provider: 'aisstream' });
const simShip = track({ id: 'sim:sea-0001', source: 'sim', domain: 'sea', platform: 'fishing', provider: undefined });

describe('PictureFilter', () => {
  it('shows everything by default, stale tracks included', () => {
    const f = new PictureFilter();
    expect([airliner, heli, tanker, simShip].every((t) => f.passes(t, true))).toBe(true);
    expect(f.active).toBe(false);
  });

  it('hides a vehicle type, then a whole group, and shows them again', () => {
    const f = new PictureFilter();
    f.setPlatforms(['helicopter'], false);
    expect(f.passes(heli, false)).toBe(false);
    expect(f.passes(airliner, false)).toBe(true);
    f.setPlatforms(PLATFORMS_BY_DOMAIN.sea, false);
    expect(f.passes(tanker, false)).toBe(false);
    expect(f.passes(simShip, false)).toBe(false);
    f.setPlatforms(PLATFORMS_BY_DOMAIN.sea, true);
    expect(f.passes(tanker, false)).toBe(true);
    expect(f.state.hiddenPlatforms).toEqual(['helicopter']);
  });

  it('hides by source, counting simulated tracks as their own source', () => {
    const f = new PictureFilter();
    f.setSource('opensky', false);
    expect(f.passes(airliner, false)).toBe(false);
    expect(f.passes(heli, false)).toBe(true);
    expect(sourceKeyOf(simShip)).toBe('sim');
    f.setSource('sim', false);
    expect(f.passes(simShip, false)).toBe(false);
  });

  it('can hide stale tracks only', () => {
    const f = new PictureFilter();
    f.setShowStale(false);
    expect(f.passes(airliner, true)).toBe(false);
    expect(f.passes(airliner, false)).toBe(true);
  });

  it('tells listeners about every change, and resets', () => {
    const f = new PictureFilter();
    let calls = 0;
    f.subscribe(() => calls++);
    f.setSource('aisstream', false);
    f.reset();
    expect(calls).toBe(2);
    expect(f.state).toEqual(DEFAULT_FILTER);
  });
});

describe('parseFilterState', () => {
  it('keeps only values this build knows, so an old or tampered setting is harmless', () => {
    expect(parseFilterState({ hiddenPlatforms: ['tanker', 'submarine'], hiddenSources: ['opensky', 'radar'], showStale: false })).toEqual({
      hiddenPlatforms: ['tanker'],
      hiddenSources: ['opensky'],
      showStale: false,
    });
    expect(parseFilterState('nonsense')).toEqual(DEFAULT_FILTER);
    expect(parseFilterState({})).toEqual(DEFAULT_FILTER);
  });

  it('says whether anything is filtered', () => {
    expect(isFiltering(DEFAULT_FILTER)).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTER, showStale: false })).toBe(true);
  });
});

describe('PLATFORMS_BY_DOMAIN', () => {
  it('lists every vehicle type exactly once, so the panel can show them all', () => {
    const listed = [...PLATFORMS_BY_DOMAIN.air, ...PLATFORMS_BY_DOMAIN.sea];
    expect([...listed].sort()).toEqual([...TRACK_VALUES.platform].sort());
  });
});
