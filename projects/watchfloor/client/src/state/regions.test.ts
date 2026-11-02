import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { insideRing, parseRegions, RegionWatch, unwrapRing, type Region } from './regions';

// A box over the Celtic Sea, and one across the antimeridian near Fiji.
const BOX: [number, number][] = [[-9, 51], [-7, 51], [-7, 52], [-9, 52]];
const PACIFIC: [number, number][] = [[178, -20], [-178, -20], [-178, -16], [178, -16]];
const region = (over: Partial<Region> = {}): Region => ({
  id: 'r1', name: 'Approaches', ring: BOX, watch: 'both', militaryOnly: false, onEnter: true, onExit: true, ...over,
});
const track = (id: string, lon: number, observedAt: number, over: Partial<Track> = {}): Track => ({
  id, source: 'ais', domain: 'sea', platform: 'cargo', affiliation: 'unknown', lat: 51.5, lon, courseDeg: 90, speedMps: 5, observedAt, ...over,
});
const live = () => true;

describe('insideRing', () => {
  it('tells inside from outside, including across the antimeridian', () => {
    expect(insideRing(-8, 51.5, BOX)).toBe(true);
    expect(insideRing(-6, 51.5, BOX)).toBe(false);
    expect(insideRing(179.5, -18, PACIFIC)).toBe(true);
    expect(insideRing(-179.5, -18, PACIFIC)).toBe(true);
    expect(insideRing(0, -18, PACIFIC)).toBe(false);
  });
});

describe('RegionWatch', () => {
  it("doesn't alert for tracks already inside when watching starts", () => {
    const watch = new RegionWatch();
    expect(watch.update([region()], [track('a', -8, 1)], live, 1)).toEqual([]);
    expect(watch.insideOf('r1')).toEqual(['a']);
  });

  it('alerts when a track seen outside comes in, and when it leaves on two reports outside', () => {
    const watch = new RegionWatch();
    const r = [region()];
    watch.update(r, [track('a', -6, 1)], live, 1);
    expect(watch.update(r, [track('a', -7.5, 2)], live, 2)).toEqual([{ type: 'enter', regionId: 'r1', trackId: 'a', at: 2, platform: 'cargo' }]);
    // One jumpy report outside isn't leaving...
    expect(watch.update(r, [track('a', -6.9, 3)], live, 3)).toEqual([]);
    expect(watch.update(r, [track('a', -7.5, 4)], live, 4)).toEqual([]);
    // ...two in a row are; the same report seen again doesn't count twice.
    watch.update(r, [track('a', -6.9, 5)], live, 5);
    expect(watch.update(r, [track('a', -6.9, 5)], live, 6)).toEqual([]);
    expect(watch.update(r, [track('a', -6.8, 7)], live, 7)).toEqual([{ type: 'exit', regionId: 'r1', trackId: 'a', at: 7, platform: 'cargo' }]);
  });

  it("counts a track first heard inside as inside, without an alert", () => {
    const watch = new RegionWatch();
    watch.update([region()], [], live, 1);
    expect(watch.update([region()], [track('new', -8, 2)], live, 2)).toEqual([]);
    expect(watch.insideOf('r1')).toEqual(['new']);
  });

  it('reports a track lost when it leaves the picture inside, but not when it only goes stale', () => {
    const watch = new RegionWatch();
    const r = [region()];
    watch.update(r, [track('a', -8, 1), track('b', -8.5, 1)], live, 1);
    const aStale = (t: Track) => t.id !== 'a';
    expect(watch.update(r, [track('a', -8, 1), track('b', -8.5, 2)], aStale, 2)).toEqual([]);
    expect(watch.insideOf('r1')).toEqual(['a', 'b']);
    // Live again inside: quietly still inside.
    expect(watch.update(r, [track('a', -8, 3), track('b', -8.5, 3)], live, 3)).toEqual([]);
    expect(watch.update(r, [track('a', -8, 4)], live, 4)).toEqual([{ type: 'lost', regionId: 'r1', trackId: 'b', at: 4, platform: 'cargo' }]);
  });

  it("doesn't call a stale track inside coming back to life an entry", () => {
    const watch = new RegionWatch();
    const r = [region()];
    watch.update(r, [], live, 1);
    const stale = () => false;
    expect(watch.update(r, [track('a', -8, 1)], stale, 2)).toEqual([]);
    expect(watch.update(r, [track('a', -8, 3)], live, 3)).toEqual([]);
    expect(watch.insideOf('r1')).toEqual(['a']);
  });

  it('watches only the chosen kinds', () => {
    const watch = new RegionWatch();
    const r = [region({ watch: 'air', militaryOnly: true })];
    watch.update(r, [track('ship', -6, 1), track('jet', -6, 1, { domain: 'air', platform: 'airliner' }), track('mil', -6, 1, { domain: 'air', platform: 'military-aircraft' })], live, 1);
    const events = watch.update(
      r,
      [track('ship', -8, 2), track('jet', -8, 2, { domain: 'air', platform: 'airliner' }), track('mil', -8, 2, { domain: 'air', platform: 'military-aircraft' })],
      live,
      2,
    );
    expect(events.map((e) => e.trackId)).toEqual(['mil']);
  });
});

describe('parseRegions', () => {
  it('keeps sound areas and drops the rest', () => {
    expect(parseRegions([region(), { id: 'x', name: 'Bad', ring: [[0, 0], [1, 1]] }, 'nope'])).toEqual([region()]);
    expect(parseRegions({})).toEqual([]);
  });
});

describe('unwrapRing', () => {
  it('keeps a Pacific area continuous across the antimeridian', () => {
    expect(unwrapRing(PACIFIC)).toEqual([[178, -20], [182, -20], [182, -16], [178, -16]]);
    expect(unwrapRing(BOX)).toEqual(BOX);
  });
});
