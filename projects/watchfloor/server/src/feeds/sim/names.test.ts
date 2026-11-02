import { describe, expect, it } from 'vitest';
import { uniqueName } from './names';

/** A draw function that returns the given names in order, then repeats the last. */
function sequence(...names: (string | undefined)[]) {
  let i = 0;
  return () => names[Math.min(i++, names.length - 1)];
}

describe('uniqueName', () => {
  it('keeps the first draw when it is free', () => {
    expect(uniqueName(sequence('ZEPHYR'), new Set(['TERN']))).toBe('ZEPHYR');
  });

  it('redraws until it finds a free name', () => {
    expect(uniqueName(sequence('TERN', 'TERN', 'OSPREY'), new Set(['TERN']))).toBe('OSPREY');
  });

  it('adds a numeral when the pool is exhausted', () => {
    expect(uniqueName(sequence('TERN'), new Set(['TERN']))).toBe('TERN II');
    expect(uniqueName(sequence('TERN'), new Set(['TERN', 'TERN II', 'TERN III']))).toBe('TERN IV');
  });

  it('leaves tracks without a callsign alone', () => {
    expect(uniqueName(sequence(undefined), new Set())).toBeUndefined();
  });
});
