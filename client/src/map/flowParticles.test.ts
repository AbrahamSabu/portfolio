import { describe, expect, it } from 'vitest';
import { buildFlowField, sampleFlow, SAMPLE_STRIDE, type FlowProbe } from './flowField';
import { Particles, SEGMENT_STRIDE, type ParticleOptions } from './flowParticles';

const OPTIONS: ParticleOptions = { life: [2, 4], minStrength: 0.05, fullSpeed: 40 };

/** Deterministic randomness (mulberry32), so every run is the same run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Traffic filling a box, all moving the same way. */
function stream(vx: number, vy: number, box = { x0: 100, x1: 300, y0: 100, y1: 200 }) {
  const samples: number[] = [];
  for (let x = box.x0; x <= box.x1; x += 10) for (let y = box.y0; y <= box.y1; y += 10) samples.push(x, y, vx, vy);
  return buildFlowField(Float32Array.from(samples), samples.length / SAMPLE_STRIDE, {
    width: 400,
    height: 300,
    cell: 10,
    radius: 2,
    fullTracks: 2,
  });
}

function segmentsOf(p: Particles, count: number): Array<[number, number, number, number, number]> {
  return Array.from({ length: count }, (_, i) => {
    const b = i * SEGMENT_STRIDE;
    return [p.segments[b]!, p.segments[b + 1]!, p.segments[b + 2]!, p.segments[b + 3]!, p.segments[b + 4]!];
  });
}

describe('Particles', () => {
  it('moves every particle with the current', () => {
    const p = new Particles(500, OPTIONS, seeded(1));
    p.setField(stream(20, 0));
    p.setCount(200);
    const n = p.step(0.1);
    expect(n).toBeGreaterThan(150);
    for (const [x0, y0, x1, y1, bright] of segmentsOf(p, n)) {
      expect(x1 - x0).toBeCloseTo(2, 3);
      expect(y1 - y0).toBeCloseTo(0, 3);
      expect(bright).toBeGreaterThan(0);
    }
  });

  it('is born only where there is traffic, and reborn there when it drifts out', () => {
    const field = stream(0, 35, { x0: 150, x1: 160, y0: 50, y1: 250 });
    const p = new Particles(300, OPTIONS, seeded(2));
    p.setField(field);
    p.setCount(300);
    const probe: FlowProbe = { vx: 0, vy: 0, strength: 0 };
    for (let frame = 0; frame < 300; frame++) {
      const n = p.step(1 / 30);
      for (const [x0, y0] of segmentsOf(p, n)) {
        expect(sampleFlow(field, x0, y0, probe)).toBe(true);
        expect(probe.strength).toBeGreaterThanOrEqual(OPTIONS.minStrength);
      }
    }
  });

  it('is reborn when its life is up, and draws nothing that frame', () => {
    const p = new Particles(1, { ...OPTIONS, life: [1, 1] }, () => 0.25);
    p.setField(stream(20, 0));
    p.setCount(1); // born a quarter of the way through its life
    expect(p.step(0.5)).toBe(1); // 0.25 -> 0.75
    expect(p.step(0.5)).toBe(1); // 0.75 -> 1.25
    expect(p.step(0.5)).toBe(0); // over: reborn
    expect(p.step(0.5)).toBe(1);
  });

  it('draws faster currents brighter', () => {
    const mean = (vx: number) => {
      const p = new Particles(200, OPTIONS, seeded(3));
      p.setField(stream(vx, 0));
      p.setCount(200);
      const segs = segmentsOf(p, p.step(0.05));
      return segs.reduce((sum, s) => sum + s[4], 0) / segs.length;
    };
    expect(mean(40)).toBeGreaterThan(mean(10) * 1.5);
  });

  it('keeps its places when the field is refreshed, and scatters when told the camera moved', () => {
    const p = new Particles(50, OPTIONS, seeded(4));
    p.setField(stream(20, 0));
    p.setCount(50);
    const before = segmentsOf(p, p.step(0.1));
    p.setField(stream(20, 5));
    const after = segmentsOf(p, p.step(0.1));
    const ends = new Set(before.map((s) => `${s[2].toFixed(3)},${s[3].toFixed(3)}`));
    const continued = after.filter((s) => ends.has(`${s[0].toFixed(3)},${s[1].toFixed(3)}`));
    expect(continued.length).toBeGreaterThan(after.length * 0.8);
    p.scatter();
    const scattered = segmentsOf(p, p.step(0.1));
    const lastEnds = new Set(after.map((s) => `${s[2].toFixed(3)},${s[3].toFixed(3)}`));
    expect(scattered.filter((s) => lastEnds.has(`${s[0].toFixed(3)},${s[1].toFixed(3)}`)).length).toBe(0);
  });

  it('draws nothing without traffic', () => {
    const p = new Particles(10, OPTIONS, seeded(5));
    p.setField(buildFlowField(new Float32Array(0), 0, { width: 100, height: 100, cell: 10, radius: 2, fullTracks: 2 }));
    p.setCount(10);
    expect(p.step(0.1)).toBe(0);
    expect(p.flowingArea).toBe(0);
    p.setField(null);
    expect(p.step(0.1)).toBe(0);
  });

  it('never holds more than its capacity', () => {
    const p = new Particles(25, OPTIONS, seeded(6));
    p.setField(stream(20, 0));
    p.setCount(1e6);
    expect(p.count).toBe(25);
    p.setCount(-3);
    expect(p.count).toBe(0);
  });

  it('measures the flowing area as strength times cell area', () => {
    const field = stream(20, 0);
    const p = new Particles(1, OPTIONS, seeded(7));
    p.setField(field);
    let strength = 0;
    for (let k = 0; k < field.cols * field.rows; k++) {
      const s = Math.min(1, field.weight[k]! * field.norm);
      if (s >= OPTIONS.minStrength) strength += s;
    }
    expect(p.flowingArea).toBeCloseTo(strength * 100, 3);
    expect(p.flowingArea).toBeGreaterThan(200 * 100); // at least the box itself
  });
});
