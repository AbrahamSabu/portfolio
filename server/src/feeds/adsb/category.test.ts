import { describe, expect, it } from 'vitest';
import { categoryFromCode, platformFor } from './category';

describe('platformFor', () => {
  it('drops ground vehicles and obstacles', () => {
    for (const c of [16, 17, 18, 19, 20]) expect(platformFor(c)).toBeNull();
  });
});

describe('categoryFromCode', () => {
  it('converts emitter codes to the numbers OpenSky uses', () => {
    expect(categoryFromCode('A3')).toBe(4);
    expect(categoryFromCode('A7')).toBe(8);
    expect(categoryFromCode('b6')).toBe(14);
    expect(categoryFromCode('C2')).toBe(17);
  });

  it('treats missing or unknown codes as no information', () => {
    expect(categoryFromCode(undefined)).toBe(0);
    expect(categoryFromCode('Z9')).toBe(0);
    expect(categoryFromCode(4)).toBe(0);
  });

  it('gives the same platform whichever form a provider uses', () => {
    const pairs: Array<[string, number]> = [['A1', 2], ['A3', 4], ['A5', 6], ['A7', 8], ['B1', 9], ['B6', 14], ['C1', 16]];
    for (const [code, n] of pairs) expect(platformFor(categoryFromCode(code))).toBe(platformFor(n));
  });
});
