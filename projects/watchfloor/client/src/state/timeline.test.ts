import { describe, expect, it } from 'vitest';
import type { TrailPoint } from '@watchfloor/shared';
import { formatBehind, fractionOf, NOW_F, positionAt, PROJECT_SPAN_MS, REPLAY_SPAN_MS, stateAt } from './timeline';

const NOW = 1_700_000_000_000;

describe('stateAt and fractionOf', () => {
  it('snaps to live at the NOW mark', () => {
    expect(stateAt(NOW_F, NOW)).toEqual({ mode: 'live' });
    expect(stateAt(NOW_F + 0.003, NOW)).toEqual({ mode: 'live' });
  });

  it('maps the left span to the last six hours', () => {
    expect(stateAt(0, NOW)).toEqual({ mode: 'replay', t: NOW - REPLAY_SPAN_MS });
    const halfway = stateAt(NOW_F / 2, NOW);
    expect(halfway.mode).toBe('replay');
    expect(halfway.mode === 'replay' && halfway.t).toBeCloseTo(NOW - REPLAY_SPAN_MS / 2, -3);
  });

  it('maps the right stub to thirty minutes of projection', () => {
    expect(stateAt(1, NOW)).toEqual({ mode: 'project', offsetMs: PROJECT_SPAN_MS });
  });

  it('inverts: fractionOf(stateAt(f)) is f', () => {
    for (const f of [0, 0.2, 0.5, NOW_F, 0.9, 1]) {
      expect(fractionOf(stateAt(f, NOW), NOW)).toBeCloseTo(f, 5);
    }
  });
});

describe('positionAt', () => {
  const path: TrailPoint[] = [
    [0, 50, NOW - 600_000],
    [1, 50, NOW - 300_000],
    [1, 51, NOW],
  ];

  it('interpolates inside a segment, with the course along it', () => {
    const p = positionAt(path, NOW - 450_000)!;
    expect(p.lon).toBeCloseTo(0.5, 5);
    expect(p.lat).toBe(50);
    expect(p.courseDeg).toBeCloseTo(90, 0);
    const q = positionAt(path, NOW - 150_000)!;
    expect(q.lon).toBe(1);
    expect(q.lat).toBeCloseTo(50.5, 5);
    expect(q.courseDeg).toBeCloseTo(0, 0);
  });

  it('is null before the track was first seen', () => {
    expect(positionAt(path, NOW - 700_000)).toBeNull();
  });

  it('holds the last position briefly, then winks out', () => {
    expect(positionAt(path, NOW + 60_000)).toMatchObject({ lon: 1, lat: 51 });
    expect(positionAt(path, NOW + 11 * 60_000)).toBeNull();
  });

  it('interpolates the short way across the antimeridian', () => {
    const crossing: TrailPoint[] = [
      [179.5, 0, NOW - 60_000],
      [-179.5, 0, NOW],
    ];
    const p = positionAt(crossing, NOW - 30_000)!;
    expect(Math.abs(p.lon)).toBe(180);
  });
});

describe('formatBehind', () => {
  it('scales its units', () => {
    expect(formatBehind(43_000)).toBe('−43 s');
    expect(formatBehind(14 * 60_000)).toBe('−14 min');
    expect(formatBehind(2 * 3_600_000 + 14 * 60_000)).toBe('−2 h 14 min');
  });
});
