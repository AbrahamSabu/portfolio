import { describe, expect, it } from 'vitest';
import { Backoff } from './backoff';

describe('Backoff', () => {
  it('doubles the window per failure and waits in its upper half', () => {
    const low = new Backoff(10_000, 300_000, () => 0);
    expect([low.next(), low.next(), low.next()]).toEqual([5_000, 10_000, 20_000]);
    const high = new Backoff(10_000, 300_000, () => 1);
    expect([high.next(), high.next(), high.next()]).toEqual([10_000, 20_000, 40_000]);
  });

  it('caps the window', () => {
    const b = new Backoff(10_000, 300_000, () => 1);
    for (let i = 0; i < 20; i++) b.next();
    expect(b.next()).toBe(300_000);
  });

  it('starts over after a success', () => {
    const b = new Backoff(10_000, 300_000, () => 1);
    b.next();
    b.next();
    b.reset();
    expect(b.attempts).toBe(0);
    expect(b.next()).toBe(10_000);
  });
});
