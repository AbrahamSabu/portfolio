import { describe, expect, it } from 'vitest';
import { Keyframes } from './keyframes';

const STEP = 5000;
const frame = (x: number) => new Float32Array([x, 0, 0]);

function setup() {
  const asked: number[] = [];
  const keyframes = new Keyframes(STEP, (t) => asked.push(t));
  return { keyframes, asked };
}

describe('Keyframes', () => {
  it('asks for the moments on the grid ahead, two at a time', () => {
    const { keyframes, asked } = setup();
    expect(keyframes.pairAt(12_000)).toBeNull();
    expect(asked).toEqual([10_000, 15_000]);
    keyframes.add(10_000, frame(1));
    keyframes.pairAt(12_000);
    expect(asked).toEqual([10_000, 15_000, 20_000]);
  });

  it('blends between the frames either side of the moment', () => {
    const { keyframes } = setup();
    keyframes.pairAt(12_000);
    keyframes.add(10_000, frame(1));
    keyframes.add(15_000, frame(2));
    const pair = keyframes.pairAt(12_000)!;
    expect([pair.ta, pair.tb, pair.a[0], pair.b[0]]).toEqual([10_000, 15_000, 1, 2]);
    // Same frames, same pair: the GPU copy isn't refreshed for nothing.
    expect(keyframes.pairAt(13_000)!.version).toBe(pair.version);
  });

  it('carries on from the newest two when the worker is late, never dropping them', () => {
    const { keyframes } = setup();
    keyframes.pairAt(10_000);
    keyframes.add(10_000, frame(1));
    keyframes.add(15_000, frame(2));
    const late = keyframes.pairAt(22_000)!;
    expect([late.ta, late.tb]).toEqual([10_000, 15_000]);
  });

  it('shows a lone frame still, rather than nothing', () => {
    const { keyframes } = setup();
    keyframes.pairAt(10_000);
    keyframes.add(15_000, frame(2));
    const pair = keyframes.pairAt(10_000)!;
    expect([pair.ta, pair.tb]).toEqual([15_000, 15_000]);
  });

  it('refreshes a frame computed again for the same moment', () => {
    const { keyframes, asked } = setup();
    keyframes.pairAt(10_000);
    keyframes.add(10_000, frame(1));
    keyframes.add(15_000, frame(2));
    const before = keyframes.pairAt(11_000)!.version;
    asked.length = 0;
    keyframes.refresh();
    expect(asked).toContain(10_000);
    keyframes.add(10_000, frame(9));
    const after = keyframes.pairAt(11_000)!;
    expect(after.version).toBeGreaterThan(before);
    expect(after.a[0]).toBe(9);
  });

  it('asks for a replayed moment exactly, one wish at a time, showing the last frame meanwhile', () => {
    const { keyframes, asked } = setup();
    expect(keyframes.exactAt(1_000)).toBeNull();
    keyframes.exactAt(2_000);
    expect(asked).toEqual([1_000]);
    keyframes.add(1_000, frame(1));
    expect(keyframes.exactAt(2_000)!.ta).toBe(1_000);
    expect(asked).toEqual([1_000, 2_000]);
  });
});
