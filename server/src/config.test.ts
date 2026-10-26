import { describe, expect, it } from 'vitest';
import { parseFeeds } from './config';

describe('parseFeeds', () => {
  it('defaults to the simulator so the demo works offline', () => {
    expect(parseFeeds(undefined)).toEqual(['sim']);
    expect(parseFeeds('  ')).toEqual(['sim']);
  });

  it('accepts a list, ignoring case, spaces and duplicates', () => {
    expect(parseFeeds(' SIM , sim')).toEqual(['sim']);
  });

  it('rejects unknown feeds with the list of valid ones', () => {
    expect(() => parseFeeds('sim,radar')).toThrow(/unknown feed "radar".*Available: sim/);
  });

  it('rejects a list with no names', () => {
    expect(() => parseFeeds(',')).toThrow(/at least one/);
  });
});
