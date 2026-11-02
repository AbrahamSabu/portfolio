import type { Hazard } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { HazardStore, hazardScale, isSignificant } from './hazards';

const quake = (id: string, magnitude: number): Hazard => ({
  id, kind: 'earthquake', source: 'usgs', title: id, lat: 0, lon: 0, time: 0, magnitude, url: 'https://example.org',
});

describe('HazardStore', () => {
  it('replaces the list each time, and tells listeners only what is new after the first', () => {
    const store = new HazardStore();
    const added: string[][] = [];
    store.subscribe((a) => added.push(a.map((h) => h.id)));
    store.apply([quake('a', 3)]);
    store.apply([quake('a', 3), quake('b', 4)]);
    store.apply([quake('b', 4)]);
    expect(added).toEqual([[], ['b'], []]);
    expect(store.items.map((h) => h.id)).toEqual(['b']);
    expect(store.get('a')).toBeUndefined();
  });
});

describe('sizing and significance', () => {
  it('draws stronger quakes larger, within limits, and GDACS events by alert level', () => {
    expect(hazardScale(quake('a', 2.5))).toBe(0.55);
    expect(hazardScale(quake('a', 5))).toBeGreaterThan(hazardScale(quake('a', 4)));
    expect(hazardScale(quake('a', 9.5))).toBe(1.5);
    const cyclone = { ...quake('c', 0), kind: 'cyclone' as const, magnitude: undefined, alert: 'red' as const };
    expect(hazardScale(cyclone)).toBe(1.3);
  });

  it('counts M6 and up, and GDACS orange or red, as significant', () => {
    expect(isSignificant(quake('a', 6.1))).toBe(true);
    expect(isSignificant(quake('a', 5.9))).toBe(false);
    expect(isSignificant({ ...quake('a', 4), alert: 'orange' })).toBe(true);
  });
});
