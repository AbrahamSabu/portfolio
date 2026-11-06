import { describe, expect, it } from 'vitest';
import { FrameGovernor, MIN_SCALE } from './frameGovernor';

function run(g: FrameGovernor, frameMs: number, seconds: number): void {
  for (let t = 0; t < seconds * 1000; t += frameMs) g.observe(frameMs);
}

describe('FrameGovernor', () => {
  it('leaves a smooth 60 fps alone', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 10);
    expect(g.scale).toBe(1);
  });

  it('trims when frames run late for a couple of seconds', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 2);
    run(g, 30, 3);
    expect(g.scale).toBeLessThan(1);
    run(g, 30, 30);
    expect(g.scale).toBe(MIN_SCALE);
  });

  it('never trims below the floor', () => {
    const g = new FrameGovernor();
    run(g, 100, 60);
    expect(g.scale).toBe(MIN_SCALE);
  });

  it('shrugs off a one-second hitch', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 2);
    run(g, 40, 1);
    run(g, 16.7, 3);
    expect(g.scale).toBe(1);
  });

  it('gives the budget back once frames are on time again', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 2);
    run(g, 40, 6);
    const trimmed = g.scale;
    expect(trimmed).toBeLessThan(1);
    run(g, 16.7, 1);
    expect(g.scale).toBe(trimmed); // not yet: two calm seconds first
    run(g, 16.7, 30);
    expect(g.scale).toBe(1);
  });

  it('judges by the typical frame, not the odd long one', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 2);
    // A 120 ms frame (a garbage collection, say) every ten frames, for ten seconds.
    for (let i = 0; i < 600; i++) g.observe(i % 10 === 9 ? 120 : 16.7);
    expect(g.scale).toBe(1);
  });

  it('trims a machine that was always slow', () => {
    const g = new FrameGovernor();
    run(g, 100, 8);
    expect(g.scale).toBeLessThan(0.5);
  });

  it('counts a steady 30 fps cap as on time', () => {
    const g = new FrameGovernor();
    run(g, 33.3, 10);
    expect(g.scale).toBe(1);
  });

  it('takes a long gap for a hidden tab, not a slow frame', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 2);
    for (let i = 0; i < 5; i++) g.observe(5000);
    run(g, 16.7, 2);
    expect(g.scale).toBe(1);
  });

  it('does not judge while held (a fresh picture is loading tiles)', () => {
    const g = new FrameGovernor();
    run(g, 16.7, 2);
    g.hold(3000);
    run(g, 60, 2.9);
    expect(g.scale).toBe(1);
    run(g, 60, 4);
    expect(g.scale).toBeLessThan(1);
  });
});
