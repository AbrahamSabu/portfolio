import { describe, expect, it } from 'vitest';
import { ServerClock } from './clock';

describe('ServerClock', () => {
  it('adopts the first sample', () => {
    const c = new ServerClock();
    c.update(10_000, 9_000);
    expect(c.offset).toBe(1000);
  });

  it('jumps to lower-latency samples immediately and drifts slowly otherwise', () => {
    const c = new ServerClock();
    c.update(10_000, 9_500); // offset 500 (500 ms of latency hidden in it)
    c.update(20_000, 19_000); // offset 1000: a better sample
    expect(c.offset).toBe(1000);
    c.update(30_000, 29_800); // offset 200: probably a slow packet
    expect(c.offset).toBeGreaterThan(900);
  });
});
