import type { TrailPoint } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { blipsFor } from './trailBlips';

const NOW = 1_700_000_000_000;
const WINDOW = 300_000; // the air trail: 5 minutes

/** A point every 10 s for the last `n` tens of seconds, oldest first. */
function every10s(n: number): TrailPoint[] {
  return Array.from({ length: n }, (_, i) => [i / 100, 0, NOW - (n - 1 - i) * 10_000] as TrailPoint);
}

describe('blipsFor', () => {
  it('picks one blip per tenth of the window, newest first and fading', () => {
    const blips = blipsFor(every10s(31), NOW, WINDOW);
    expect(blips.length).toBe(10);
    expect(blips[0]![2]).toBe(1); // the newest point, fresh
    const fades = blips.map((b) => b[2]);
    expect([...fades].sort((a, b) => b - a)).toEqual(fades); // older is dimmer
    expect(blips.at(-1)![2]).toBeGreaterThanOrEqual(0.15); // never invisible
  });

  it('never repeats a point for a sparse trail', () => {
    // Reports a minute apart, slots 30 s apart: each report blips once, no copies.
    const sparse = Array.from({ length: 5 }, (_, i) => [i, 0, NOW - (4 - i) * 60_000] as TrailPoint);
    const blips = blipsFor(sparse, NOW, WINDOW);
    expect(blips.length).toBe(5);
    expect(new Set(blips.map((b) => b[0])).size).toBe(5);
  });

  it('shows only the newest of several reports inside one slot', () => {
    // A burst of reports seconds apart is one position on the scope, not ten.
    expect(blipsFor(every10s(2), NOW, WINDOW).length).toBe(1);
  });

  it('is empty for an empty trail', () => {
    expect(blipsFor([], NOW, WINDOW)).toEqual([]);
  });
});
