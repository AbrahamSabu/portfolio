import { describe, expect, it } from 'vitest';
import { Conductor, type Mix } from './conductor';
import { ScoreEngine } from './engine';
import { seededRandom } from './scale';

/**
 * A stand-in for Web Audio that records the graph and every scheduled
 * change instead of making sound. (The sound itself is measured in a real
 * browser by `npm run sound-check -w @watchfloor/server`.)
 */
type Event = { type: 'set' | 'linear' | 'target' | 'cancel'; value: number; time: number };
class Param {
  readonly events: Event[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number) {
    this.events.push({ type: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ type: 'linear', value, time });
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push({ type: 'target', value, time });
  }
  cancelScheduledValues(time: number) {
    this.events.push({ type: 'cancel', value: NaN, time });
  }
}
class Node {
  outputs: (Node | Param)[] = [];
  constructor(
    readonly kind: string,
    ctx: FakeContext,
  ) {
    ctx.nodes.push(this);
  }
  connect<T extends Node | Param>(to: T): T {
    this.outputs.push(to);
    return to;
  }
  disconnect() {
    this.outputs = [];
  }
}
class Osc extends Node {
  type = 'sine';
  frequency = new Param(440);
  detune = new Param(0);
  started?: number;
  stopped?: number;
  onended: (() => void) | null = null;
  start(t: number) {
    this.started = t;
  }
  stop(t: number) {
    this.stopped = t;
  }
}
class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  nodes: Node[] = [];
  destination = new Node('destination', this);
  createGain = () => Object.assign(new Node('gain', this), { gain: new Param(1) });
  createOscillator = () => new Osc('oscillator', this);
  createStereoPanner = () => Object.assign(new Node('panner', this), { pan: new Param(0) });
  createConvolver = () => Object.assign(new Node('convolver', this), { buffer: null as unknown });
  createBiquadFilter = () =>
    Object.assign(new Node('filter', this), { type: 'lowpass', frequency: new Param(350), Q: new Param(1), detune: new Param(0) });
  createDynamicsCompressor = () =>
    Object.assign(new Node('compressor', this), {
      threshold: new Param(-24),
      knee: new Param(30),
      ratio: new Param(12),
      attack: new Param(0.003),
      release: new Param(0.25),
    });
  createBuffer = (channels: number, length: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (c: number) => data[c]! };
  };
}

function setup() {
  const fake = new FakeContext();
  const engine = new ScoreEngine(fake as unknown as BaseAudioContext);
  const inputsOf = (node: Node) => fake.nodes.filter((n) => n.outputs.includes(node));
  const of = <T extends Node>(kind: string) => fake.nodes.filter((n) => n.kind === kind) as T[];
  return { fake, engine, inputsOf, of };
}

const MIX: Mix = {
  drone: { level: 0.8, brightness: 0.5 },
  pad: { level: 0.6, brightness: 0.6, voicing: 'mid' },
  bells: { brightness: 0.6 },
};

describe('the score engine', () => {
  it('sends everything through one limiter, which ends the chain', () => {
    const { fake, inputsOf, of } = setup();
    const [limiter] = of<Node & Record<'threshold' | 'knee' | 'ratio' | 'attack', Param>>('compressor');
    expect(of('compressor')).toHaveLength(1);
    expect(limiter!.threshold.value).toBeLessThanOrEqual(-6);
    expect(limiter!.knee.value).toBe(0);
    expect(limiter!.ratio.value).toBeGreaterThanOrEqual(12);
    expect(limiter!.attack.value).toBeLessThanOrEqual(0.005);
    const [last, ...others] = inputsOf(fake.destination);
    expect(others).toEqual([]);
    expect((last as Node & { gain: Param }).gain.value).toBeLessThan(1);
    expect(inputsOf(last!)).toEqual([limiter]);
  });

  it('glides every level and colour, never steps them', () => {
    const { engine, of } = setup();
    const before = new Map(of<Node & { gain: Param }>('gain').map((g) => [g, g.gain.events.length]));
    engine.apply(MIX, 1);
    engine.apply({ ...MIX, drone: { level: 0, brightness: 0 } }, 2);
    for (const [node, count] of before) for (const e of node.gain.events.slice(count)) expect(e.type).toBe('target');
    for (const f of of<Node & { frequency: Param }>('filter')) expect(f.frequency.events.every((e) => e.type === 'target')).toBe(true);
  });

  it('plays each note from silence, panned, and lets it go when it has rung out', () => {
    const { engine, of } = setup();
    const oscillatorsBefore = of('oscillator').length;
    engine.play({ at: 3, frequency: 440, gain: 0.8, decay: 2, pan: -0.5 });
    const added = of<Osc>('oscillator').slice(oscillatorsBefore);
    expect(added.map((o) => o.frequency.value)).toEqual([440, 880, 1760]);
    expect(added.every((o) => o.started === 3 && o.stopped === 5.05)).toBe(true);
    const envelopes = added.map((o) => o.outputs[0] as Node & { gain: Param });
    for (const env of envelopes) {
      expect(env.gain.events[0]).toEqual({ type: 'set', value: 0, time: 3 });
      expect(env.gain.events[1]!.type).toBe('linear');
      expect(env.gain.events[1]!.time).toBeGreaterThan(3);
    }
    const pan = envelopes[0]!.outputs[0] as Node & { pan: Param };
    expect(pan.pan.value).toBe(-0.5);
    added[0]!.onended!();
    expect([...envelopes, pan].every((n) => n.outputs.length === 0)).toBe(true);
  });

  it('dips the music under a call and brings it back', () => {
    const { engine, of } = setup();
    const cue = new Conductor(seededRandom(1)).cue('emergency', 4)!;
    engine.playCue(cue);
    const dipped = of<Node & { gain: Param }>('gain').filter((g) => g.gain.events.some((e) => e.value === cue.duck));
    expect(dipped).toHaveLength(1);
    const duck = dipped[0]!;
    expect(duck.gain.events.map((e) => [e.type, e.value])).toEqual([
      ['target', cue.duck],
      ['target', 1],
    ]);
    expect(duck.gain.events[1]!.time).toBeGreaterThan(cue.at);
  });

  it('fades in and out, and turns the volume on a squared curve', () => {
    const { engine, of } = setup();
    const gains = of<Node & { gain: Param }>('gain');
    engine.fadeIn(1);
    engine.fadeOut(5);
    const fader = gains.find((g) => g.gain.events.some((e) => e.type === 'cancel'))!;
    expect(fader.gain.value).toBe(0);
    expect(fader.gain.events.filter((e) => e.type === 'target').map((e) => e.value)).toEqual([1, 0]);
    engine.setVolume(0.5, 2);
    expect(gains.some((g) => g.gain.events.some((e) => e.type === 'target' && e.value === 0.25 && e.time === 2))).toBe(true);
  });

  it('changes chord by fading the new one in over the old', () => {
    const { engine, of } = setup();
    const triangles = () => of<Osc>('oscillator').filter((o) => o.type === 'triangle' && o.frequency.value > 150);
    const old = triangles();
    expect(old).toHaveLength(6);
    engine.apply({ ...MIX, pad: { ...MIX.pad, voicing: 'high' } }, 10);
    expect(old.every((o) => o.stopped! > 10)).toBe(true);
    const fresh = triangles().filter((o) => !old.includes(o));
    expect(fresh).toHaveLength(6);
    expect(fresh.every((o) => o.started === 10)).toBe(true);
    const slot = fresh[0]!.outputs[0] as Node & { gain: Param };
    expect(slot.gain.events.map((e) => e.type)).toEqual(['set', 'target']);
    expect(slot.gain.events[0]!.value).toBe(0);
  });
});
