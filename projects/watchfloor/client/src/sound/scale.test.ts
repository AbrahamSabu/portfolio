import { describe, expect, it } from 'vitest';
import { frequencyOfStep, inScale, midiOfStep, seededRandom } from './scale';

describe('the scale (A minor pentatonic)', () => {
  it('counts steps from A3', () => {
    expect(frequencyOfStep(0)).toBeCloseTo(220, 6);
    expect(frequencyOfStep(5)).toBeCloseTo(440, 6);
    expect(frequencyOfStep(10)).toBeCloseTo(880, 6);
    expect(frequencyOfStep(13)).toBeCloseTo(1318.51, 1); // E6, the ping's top note
    expect(frequencyOfStep(-10)).toBeCloseTo(55, 6);
    expect([1, 2, 3, 4].map(midiOfStep)).toEqual([60, 62, 64, 67]); // C4 D4 E4 G4
  });

  it('only ever gives notes in the scale, and the scale has no semitone steps', () => {
    for (let step = -20; step <= 25; step++) {
      const midi = midiOfStep(step);
      expect(inScale(midi)).toBe(true);
      expect(midiOfStep(step + 1) - midi).toBeGreaterThanOrEqual(2);
    }
    expect([58, 59, 61, 63, 65, 66, 68].some(inScale)).toBe(false); // A# B C# D# F F# G#
  });

  it('has a repeatable random source', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});
