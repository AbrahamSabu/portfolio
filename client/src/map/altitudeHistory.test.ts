import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { AltitudeHistory } from './altitudeHistory';

const S = 1000;

describe('AltitudeHistory', () => {
  it("doesn't know an altitude before the first report it saw", () => {
    const h = new AltitudeHistory();
    h.record('a', 100 * S, 3000);
    expect(h.at('a', 99 * S)).toBeUndefined();
    expect(h.at('b', 100 * S)).toBeUndefined();
    expect(h.at('a', 100 * S)).toBe(3000);
  });

  it('interpolates between reports and holds the newest after them', () => {
    const h = new AltitudeHistory();
    h.record('a', 0, 1000);
    h.record('a', 20 * S, 2000);
    expect(h.at('a', 10 * S)).toBeCloseTo(1500);
    expect(h.at('a', 60 * S)).toBe(2000);
  });

  it('keeps a long level stretch as two samples', () => {
    const h = new AltitudeHistory();
    for (let t = 0; t <= 240; t += 1) h.record('a', t * S, 11_000 + (t % 2) * 3);
    expect(h.sampleCount('a')).toBe(2);
    expect(h.at('a', 120 * S)).toBeCloseTo(11_000, -1);
  });

  it('follows a steady climb exactly with about one sample per 10 s', () => {
    const h = new AltitudeHistory();
    for (let t = 0; t <= 120; t += 1) h.record('a', t * S, 1000 + 10 * t);
    expect(h.sampleCount('a')).toBeLessThanOrEqual(16);
    for (const t of [5, 33.5, 77, 119]) expect(h.at('a', t * S)).toBeCloseTo(1000 + 10 * t, 6);
  });

  it('keeps the corner where a descent levels off', () => {
    const h = new AltitudeHistory();
    for (let t = 0; t <= 60; t += 5) h.record('a', t * S, 3000 - 10 * t); // down to 2400 at 60 s
    for (let t = 65; t <= 120; t += 5) h.record('a', t * S, 2400);
    expect(h.at('a', 30 * S)).toBeCloseTo(2700, -1);
    expect(h.at('a', 90 * S)).toBeCloseTo(2400, -1);
  });

  it('ignores reports it has already seen, or older ones', () => {
    const h = new AltitudeHistory();
    h.record('a', 50 * S, 1000);
    h.record('a', 50 * S, 9999);
    h.record('a', 40 * S, 9999);
    expect(h.at('a', 50 * S)).toBe(1000);
    expect(h.sampleCount('a')).toBe(1);
  });

  it('prunes to the window but keeps one sample before it, for interpolation', () => {
    const h = new AltitudeHistory(60 * S);
    for (let t = 0; t <= 200; t += 20) h.record('a', t * S, t * 10);
    h.prune(210 * S); // window starts at 150 s
    expect(h.at('a', 145 * S)).toBeCloseTo(1450); // between the kept 140 s sample and 160 s
    expect(h.at('a', 200 * S)).toBeCloseTo(2000);
    expect(h.at('a', 130 * S)).toBeUndefined();
  });

  it('drops aircraft that are gone or silent for a whole window', () => {
    const h = new AltitudeHistory(60 * S);
    h.record('gone', 100 * S, 1000);
    h.record('quiet', 10 * S, 1000);
    h.record('here', 100 * S, 1000);
    h.prune(100 * S, (id) => id !== 'gone');
    expect(h.size).toBe(1);
    expect(h.at('here', 100 * S)).toBe(1000);
  });

  it('records only aircraft with an altitude', () => {
    const base = { source: 'sim', platform: 'airliner', affiliation: 'unknown', lat: 0, lon: 0, courseDeg: 0, speedMps: 200, observedAt: 5 * S } as const;
    const tracks: Track[] = [
      { ...base, id: 'air', domain: 'air', altitudeM: 9000 },
      { ...base, id: 'noalt', domain: 'air' },
      { ...base, id: 'ship', domain: 'sea', platform: 'cargo' },
    ];
    const h = new AltitudeHistory();
    h.recordAll(tracks);
    expect(h.size).toBe(1);
    expect(h.at('air', 5 * S)).toBe(9000);
  });
});
