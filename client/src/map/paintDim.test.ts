import { describe, expect, it } from 'vitest';
import { scaledOpacity } from './paintDim';

describe('scaledOpacity', () => {
  it('scales plain numbers, and the default of 1 when unset', () => {
    expect(scaledOpacity(0.8, 0.5)).toBeCloseTo(0.4);
    expect(scaledOpacity(undefined, 0.3)).toBe(0.3);
  });

  it('multiplies data expressions', () => {
    const stale = ['case', ['==', ['get', 'stale'], 1], 0.4, 1];
    expect(scaledOpacity(stale, 0.3)).toEqual(['*', 0.3, stale]);
  });

  it("scales a zoom curve's outputs, keeping the curve outermost", () => {
    const curve = ['interpolate', ['linear'], ['zoom'], 5, 0.3, 9, 0.7];
    const out = scaledOpacity(curve, 0.5) as unknown[];
    expect(out.slice(0, 4)).toEqual(['interpolate', ['linear'], ['zoom'], 5]);
    expect(out[4]).toBeCloseTo(0.15);
    expect(out[5]).toBe(9);
    expect(out[6]).toBeCloseTo(0.35);
    expect(scaledOpacity(['step', ['zoom'], 0, 5, 1], 0.5)).toEqual(['step', ['zoom'], 0, 5, 0.5]);
  });

  it('leaves a curve over data, not zoom, to a plain multiply', () => {
    const byData = ['interpolate', ['linear'], ['get', 'fade'], 0, 0, 1, 1];
    expect(scaledOpacity(byData, 0.5)).toEqual(['*', 0.5, byData]);
  });
});
