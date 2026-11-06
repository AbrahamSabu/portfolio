import { describe, expect, it } from 'vitest';
import { parseHidden, SatelliteFilter } from './satelliteFilter';

function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), items };
}

describe('SatelliteFilter', () => {
  it('hides groups, remembers them, and gives the shader one bit each', () => {
    const storage = memory();
    const filter = new SatelliteFilter(storage);
    let changes = 0;
    filter.subscribe(() => changes++);
    expect(filter.mask).toBe(0);
    filter.setHidden(['starlink'], true);
    expect(filter.isHidden('starlink')).toBe(true);
    expect(filter.mask).toBe(0b100);
    expect(new SatelliteFilter(storage).isHidden('starlink')).toBe(true);
    filter.reset();
    expect(filter.active).toBe(false);
    expect(changes).toBe(2);
  });

  it('drops saved names it no longer knows, and survives junk', () => {
    expect(parseHidden('["weather","active"]')).toEqual(['weather']);
    expect(parseHidden('{oops')).toEqual([]);
    expect(parseHidden(null)).toEqual([]);
  });
});
