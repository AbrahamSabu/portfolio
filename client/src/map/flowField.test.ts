import { describe, expect, it } from 'vitest';
import { buildFlowField, kernelPeak, nodeStrength, sampleFlow, SAMPLE_STRIDE, type FieldOptions, type FlowProbe } from './flowField';

const OPTIONS: FieldOptions = { width: 400, height: 300, cell: 10, radius: 2, fullTracks: 2 };

function field(samples: Array<[x: number, y: number, vx: number, vy: number]>, options = OPTIONS) {
  const packed = new Float32Array(samples.length * SAMPLE_STRIDE);
  samples.forEach((s, i) => packed.set(s, i * SAMPLE_STRIDE));
  return buildFlowField(packed, samples.length, options);
}

function probe(f: ReturnType<typeof field>, x: number, y: number): FlowProbe {
  const out: FlowProbe = { vx: NaN, vy: NaN, strength: NaN };
  expect(sampleFlow(f, x, y, out)).toBe(true);
  return out;
}

describe('kernelPeak', () => {
  it('is 1 with no blur', () => {
    expect(kernelPeak(0)).toBe(1);
  });

  it('is the centre of three box passes, squared for two axes', () => {
    // [1 1 1]/3 three times over is [1 3 6 7 6 3 1]/27.
    expect(kernelPeak(1)).toBeCloseTo((7 / 27) ** 2, 6);
  });
});

describe('buildFlowField', () => {
  it("gives a lone track's own velocity where it is, as one track's worth", () => {
    const f = field([[200, 150, 12, -4]]);
    const p = probe(f, 200, 150);
    expect(p.vx).toBeCloseTo(12, 4);
    expect(p.vy).toBeCloseTo(-4, 4);
    expect(p.strength).toBeCloseTo(1 / OPTIONS.fullTracks, 4);
  });

  it('averages the tracks around a point', () => {
    const f = field([
      [200, 150, 10, 0],
      [200, 150, 30, 0],
    ]);
    const p = probe(f, 200, 150);
    expect(p.vx).toBeCloseTo(20, 4);
    expect(p.strength).toBeCloseTo(1, 4);
  });

  it('cancels opposite flows into a still current that still has traffic behind it', () => {
    const f = field([
      [200, 150, 25, 0],
      [200, 150, -25, 0],
    ]);
    const p = probe(f, 200, 150);
    expect(Math.abs(p.vx)).toBeLessThan(1e-4);
    expect(p.strength).toBeCloseTo(1, 4);
  });

  it('fades with distance but keeps the speed out to the fringe', () => {
    const f = field([[200, 150, 12, -4]]);
    const near = probe(f, 210, 150);
    const far = probe(f, 240, 150);
    expect(near.strength).toBeLessThan(0.5);
    expect(far.strength).toBeLessThan(near.strength);
    expect(far.strength).toBeGreaterThan(0);
    expect(far.vx).toBeCloseTo(12, 3);
    expect(far.vy).toBeCloseTo(-4, 3);
  });

  it('has nothing beyond the reach of the blur', () => {
    // Three passes of radius 2 reach 6 nodes (60 px).
    const f = field([[200, 150, 12, -4]]);
    const p = probe(f, 280, 150);
    expect(p.strength).toBe(0);
    expect(p.vx).toBe(0);
  });

  it('keeps every track counted once: the blur moves weight, never makes or loses it', () => {
    const f = field([
      [100, 100, 5, 0],
      [205, 155, 0, 5],
      [300, 200, -5, 0],
    ]);
    const total = f.weight.reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(3, 3);
  });

  it('ignores samples off the grid', () => {
    const f = field([
      [-5, 150, 10, 0],
      [450, 150, 10, 0],
      [200, 999, 10, 0],
    ]);
    expect(f.weight.every((w) => w === 0)).toBe(true);
  });

  it('caps strength at a full current', () => {
    const f = field(Array.from({ length: 10 }, () => [200, 150, 10, 0] as [number, number, number, number]));
    const node = 15 * f.cols + 20;
    expect(nodeStrength(f, node)).toBe(1);
    expect(probe(f, 200, 150).strength).toBe(1);
  });
});

describe('sampleFlow', () => {
  it('says so outside the grid', () => {
    const f = field([[200, 150, 12, -4]]);
    const out: FlowProbe = { vx: 0, vy: 0, strength: 0 };
    expect(sampleFlow(f, -1, 10, out)).toBe(false);
    expect(sampleFlow(f, 10, 1e6, out)).toBe(false);
  });
});
