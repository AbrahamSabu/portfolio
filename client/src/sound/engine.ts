import { VOICINGS, type Cue, type Mix, type Note, type Voicing } from './conductor';
import { frequencyOfStep, seededRandom } from './scale';

/**
 * The score's instruments, in Web Audio. It plays what the conductor
 * decides and nothing else. Works on a live AudioContext or an
 * OfflineAudioContext (the rendered check), because both are a
 * BaseAudioContext and every event is timed on the audio clock.
 *
 *   drone (ships) ───┐
 *   pad (aircraft) ──┼─► bed ─► duck ─┐
 *   bells (notes) ───┘   ▲            ├─► fader ─► volume ─► limiter ─► out
 *        └─► reverb ─────┘   calls ───┘
 *
 * The calls skip the duck: the music dips under them, they don't.
 */

/** Peak level of each layer when full. Set by measuring the rendered check, not by taste alone. */
const DRONE_MAX = 0.17;
const PAD_MAX = 0.1;
const BELL_MAX = 0.26;
const CALL_MAX = 0.26;
/** After the limiter: its ceiling stays clear of full scale. */
const OUTPUT_GAIN = 0.9;

/** Time constants in seconds (about 95% of a change happens in three of them). */
const LEVEL_GLIDE_S = 2.5;
const COLOUR_GLIDE_S = 2;
const VOLUME_GLIDE_S = 0.08;
const FADE_IN_S = 0.7;
const FADE_OUT_S = 0.12;
/** The pad's chord change: the old chord fades out as the new one fades in. */
const CHORD_FADE_S = 1.2;
/** Every note starts with a ramp, never a step: a step is a click. */
const ATTACK_S = 0.012;

/** Drone partials: A1 and A2 with a slightly sharp A2 beating slowly against it, plus E3 and A3 so small speakers carry it. */
const DRONE_PARTIALS: { step: number; cents: number; gain: number; type: OscillatorType }[] = [
  { step: -10, cents: 0, gain: 0.3, type: 'sine' }, // A1, 55 Hz
  { step: -5, cents: 0, gain: 0.25, type: 'sine' }, // A2, 110 Hz
  { step: -5, cents: 6, gain: 0.12, type: 'sine' },
  { step: -2, cents: 0, gain: 0.12, type: 'sine' }, // E3
  { step: 0, cents: 0, gain: 0.08, type: 'sine' }, // A3
  { step: -5, cents: 0, gain: 0.06, type: 'triangle' },
];
/** A bell: the note, its octave and two octaves up (all in the scale), the upper ones dying faster. */
const BELL_PARTIALS: { ratio: number; gain: number; speed: number }[] = [
  { ratio: 1, gain: 1, speed: 1 },
  { ratio: 2, gain: 0.22, speed: 2.2 },
  { ratio: 4, gain: 0.04, speed: 4 },
];

interface PadSlot {
  oscillators: OscillatorNode[];
  gain: GainNode;
}

export class ScoreEngine {
  private readonly bed: GainNode;
  private readonly duck: GainNode;
  private readonly calls: GainNode;
  private readonly fader: GainNode;
  private readonly volume: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly output: GainNode;
  private readonly droneLevel: GainNode;
  private readonly droneTone: BiquadFilterNode;
  private readonly padLevel: GainNode;
  private readonly padTone: BiquadFilterNode;
  private readonly bells: GainNode;
  private readonly bellTone: BiquadFilterNode;
  private padSlots: PadSlot[] = [];
  private voicing: Voicing | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode = ctx.destination,
    volume = 0.6,
    seed = 1,
  ) {
    const t = ctx.currentTime;
    this.bed = ctx.createGain();
    this.duck = ctx.createGain();
    this.calls = ctx.createGain();
    this.fader = gain(ctx, 0);
    this.volume = gain(ctx, volume * volume);
    // A limiter: a compressor with a hard knee, a steep ratio and a fast
    // attack. Whatever the picture does, the output can't clip. (Web Audio
    // adds make-up gain of its own; the rendered check measures the result.)
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.output = gain(ctx, OUTPUT_GAIN);
    this.bed.connect(this.duck).connect(this.fader);
    this.calls.connect(this.fader);
    this.fader.connect(this.volume).connect(this.limiter).connect(this.output).connect(destination);

    // A room for everything to ring in: a short reverb from a generated
    // impulse (decaying, softened noise), so there's no audio file to load.
    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx, 2.6, seededRandom(seed));
    reverb.connect(gain(ctx, 0.8)).connect(this.bed);
    const send = (from: AudioNode, amount: number) => from.connect(gain(ctx, amount)).connect(reverb);

    // Ships: the drone, breathing slowly.
    this.droneTone = filter(ctx, 'lowpass', 160, 0.7);
    const breath = gain(ctx, 0.82);
    this.droneLevel = gain(ctx, 0);
    for (const p of DRONE_PARTIALS) {
      const osc = this.oscillator(p.type, frequencyOfStep(p.step), t);
      osc.detune.value = p.cents;
      osc.connect(gain(ctx, p.gain)).connect(this.droneTone);
    }
    this.droneTone.connect(breath).connect(this.droneLevel).connect(this.bed);
    this.oscillator('sine', 0.06, t).connect(gain(ctx, 0.18)).connect(breath.gain);
    send(this.droneLevel, 0.12);

    // Aircraft as a whole: the pad, its filter wandering slowly.
    this.padTone = filter(ctx, 'lowpass', 400, 0.5);
    this.padLevel = gain(ctx, 0);
    this.padTone.connect(this.padLevel).connect(this.bed);
    this.oscillator('sine', 0.045, t).connect(gain(ctx, 250)).connect(this.padTone.detune);
    send(this.padLevel, 0.35);

    // Each aircraft: bell notes.
    this.bellTone = filter(ctx, 'lowpass', 2600, 0.3);
    this.bells = gain(ctx, BELL_MAX);
    this.bellTone.connect(this.bells).connect(this.bed);
    send(this.bells, 0.55);
    send(this.calls, 0.25);

    this.setVoicing('mid', t);
  }

  /** The listener's volume, 0..1, on a squared curve so the slider feels even. */
  setVolume(volume: number, at: number): void {
    this.volume.gain.setTargetAtTime(volume * volume, at, VOLUME_GLIDE_S);
  }

  fadeIn(at: number): void {
    this.fader.gain.cancelScheduledValues(at);
    this.fader.gain.setTargetAtTime(1, at, FADE_IN_S);
  }

  fadeOut(at: number): void {
    this.fader.gain.cancelScheduledValues(at);
    this.fader.gain.setTargetAtTime(0, at, FADE_OUT_S);
  }

  /** Glide every layer towards the conductor's mix. Nothing jumps: every change is a glide. */
  apply(mix: Mix, at: number): void {
    this.droneLevel.gain.setTargetAtTime(DRONE_MAX * mix.drone.level ** 1.2, at, LEVEL_GLIDE_S);
    this.droneTone.frequency.setTargetAtTime(160 + 560 * mix.drone.brightness, at, COLOUR_GLIDE_S);
    this.padLevel.gain.setTargetAtTime(PAD_MAX * mix.pad.level ** 1.5, at, LEVEL_GLIDE_S);
    this.padTone.frequency.setTargetAtTime(400 + 1600 * mix.pad.brightness, at, COLOUR_GLIDE_S);
    this.bellTone.frequency.setTargetAtTime(2600 + 3400 * mix.bells.brightness, at, COLOUR_GLIDE_S);
    this.setVoicing(mix.pad.voicing, at);
  }

  play(note: Note): void {
    const t = Math.max(note.at, this.ctx.currentTime);
    const peak = note.gain;
    // Fades to -60 dB at `decay`; the upper partials go first, like a struck bell.
    const tau = note.decay / 6.9;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, note.pan));
    pan.connect(this.bellTone);
    const voices = BELL_PARTIALS.map((p) => {
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak * p.gain, t + ATTACK_S);
      env.gain.setTargetAtTime(0, t + ATTACK_S, tau / p.speed);
      const osc = this.ctx.createOscillator();
      osc.frequency.value = note.frequency * p.ratio;
      osc.connect(env).connect(pan);
      osc.start(t);
      osc.stop(t + note.decay + 0.05);
      return { osc, env };
    });
    voices[0]!.osc.onended = () => {
      for (const v of voices) v.env.disconnect();
      pan.disconnect();
    };
  }

  /** An alert's call: held, clean tones, while the rest of the music dips under it. */
  playCue(cue: Cue): void {
    const start = Math.max(cue.at, this.ctx.currentTime);
    for (const tone of cue.tones) {
      const t = Math.max(tone.at, this.ctx.currentTime);
      const peak = CALL_MAX * tone.gain;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + ATTACK_S);
      env.gain.setValueAtTime(peak, t + tone.hold);
      env.gain.setTargetAtTime(0, t + tone.hold, 0.07);
      env.connect(this.calls);
      for (const [ratio, level] of [
        [1, 1],
        [2, 0.1],
      ] as const) {
        const osc = this.ctx.createOscillator();
        osc.frequency.value = tone.frequency * ratio;
        osc.connect(gain(this.ctx, level)).connect(env);
        osc.start(t);
        osc.stop(t + tone.hold + 0.6);
        if (ratio === 1) osc.onended = () => env.disconnect();
      }
    }
    this.duck.gain.setTargetAtTime(cue.duck, start, 0.04);
    this.duck.gain.setTargetAtTime(1, start + cue.length - 0.3, 0.5);
  }

  private setVoicing(voicing: Voicing, at: number): void {
    if (voicing === this.voicing) return;
    this.voicing = voicing;
    for (const slot of this.padSlots) {
      slot.gain.gain.setTargetAtTime(0, at, CHORD_FADE_S);
      for (const osc of slot.oscillators) osc.stop(at + CHORD_FADE_S * 8);
      slot.oscillators[0]!.onended = () => slot.gain.disconnect();
    }
    // Three notes, each two slightly detuned triangles: a soft, slowly beating chord.
    this.padSlots = VOICINGS[voicing].map((step) => {
      const slotGain = this.ctx.createGain();
      slotGain.gain.setValueAtTime(0, at);
      slotGain.gain.setTargetAtTime(1 / 3, at, CHORD_FADE_S);
      slotGain.connect(this.padTone);
      const oscillators = [-5, 5].map((cents) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = frequencyOfStep(step);
        osc.detune.value = cents;
        osc.connect(slotGain);
        osc.start(at);
        return osc;
      });
      return { oscillators, gain: slotGain };
    });
  }

  private oscillator(type: OscillatorType, frequency: number, at: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.start(at);
    return osc;
  }
}

function gain(ctx: BaseAudioContext, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/** Decaying, low-passed noise, a little different in each ear: a small hall, with no file to fetch. */
function impulseResponse(ctx: BaseAudioContext, seconds: number, random: () => number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.round(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const preDelay = Math.round(rate * 0.02);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let soft = 0;
    for (let i = preDelay; i < length; i++) {
      soft += (random() * 2 - 1 - soft) * 0.45;
      data[i] = soft * Math.exp((-6.9 * (i - preDelay)) / rate / seconds);
    }
  }
  return buffer;
}
