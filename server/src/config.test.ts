import { describe, expect, it } from 'vitest';
import { parseFeeds, trafficKind } from './config';

describe('parseFeeds', () => {
  it('defaults to live aircraft and ships', () => {
    expect(parseFeeds(undefined)).toEqual(['adsblol', 'adsbfi', 'ais']);
    expect(parseFeeds('  ')).toEqual(['adsblol', 'adsbfi', 'ais']);
  });

  it('accepts a list, ignoring case, spaces and duplicates', () => {
    expect(parseFeeds(' SIM , sim')).toEqual(['sim']);
    expect(parseFeeds('opensky,sim')).toEqual(['sim', 'opensky']);
    expect(parseFeeds('adsblol, opensky')).toEqual(['opensky', 'adsblol']);
    expect(parseFeeds('ais,sim')).toEqual(['sim', 'ais']);
    expect(parseFeeds('adsbfi,adsblol')).toEqual(['adsblol', 'adsbfi']);
  });

  it('rejects unknown feeds with the list of valid ones', () => {
    expect(() => parseFeeds('sim,radar')).toThrow(/unknown feed "radar".*Available: sim, opensky, adsblol, adsbfi, ais/);
  });

  it('rejects a list with no names', () => {
    expect(() => parseFeeds(',')).toThrow(/at least one/);
  });
});

describe('trafficKind', () => {
  it('says whether the picture is live, simulated or both', () => {
    expect(trafficKind(['sim'])).toBe('simulated');
    expect(trafficKind(['opensky'])).toBe('live');
    expect(trafficKind(['sim', 'opensky'])).toBe('mixed');
  });
});
