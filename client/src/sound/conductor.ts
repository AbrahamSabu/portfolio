import type { AircraftVoice, PictureSummary } from './picture';
import { frequencyOfStep } from './scale';

/**
 * The score's musical decisions, with no audio in sight: what the picture
 * should sound like (levels, brightness, which chord), which notes play when,
 * and what each alert's call is. Pure apart from the random source it is
 * given, so tests can hold it to the scale, the voice cap and the beat.
 */

/** The pad's three chords, low to high. Which one plays follows whether the sky is climbing or descending. */
export type Voicing = 'low' | 'mid' | 'high';
export const VOICINGS: Record<Voicing, readonly number[]> = {
  low: [-2, 0, 1], // E3 A3 C4
  mid: [0, 1, 3], // A3 C4 E4
  high: [1, 3, 4], // C4 E4 G4
};

/** Where the engine should glide each layer. Levels and brightness are 0..1. */
export interface Mix {
  drone: { level: number; brightness: number };
  pad: { level: number; brightness: number; voicing: Voicing };
  bells: { brightness: number };
}

/** One bell note, timed on the audio clock (seconds). */
export interface Note {
  at: number;
  frequency: number;
  /** Peak level, 0..1. */
  gain: number;
  /** Seconds to fade to silence. */
  decay: number;
  /** -1 left to 1 right. */
  pan: number;
}

export type CueKind = 'emergency' | 'finding' | 'area';

/** An alert's call: clean held tones over the music, which dips while they play. */
export interface Cue {
  kind: CueKind;
  at: number;
  /** Seconds from `at` until the call has finished ringing. */
  length: number;
  tones: { at: number; frequency: number; hold: number; gain: number }[];
  /** What the rest of the music is multiplied by while the call plays. */
  duck: number;
}

/** A sixteenth note at 60 beats a minute: the grid every note lands on. */
export const SLOT_S = 0.25;
/** Bell notes sounding at once, at most. Past it, a note is skipped rather than cutting one off. */
export const MAX_BELLS = 6;
/** The second note of a climbing or descending pair follows this much later. */
export const GRACE_S = 0.16;
/** Counts at which the sky and the sea sound full; fullness is logarithmic below. */
const FULL_SKY = 2_000;
const FULL_SEA = 300;
/** Metres of altitude per scale step: an airliner at cruise (11 km) sits seven steps above the ground. */
const METRES_PER_STEP = 1_600;
const LOWEST_STEP = 2; // D4
const TOP_BAND = 7;
const HIGHEST_BELL_STEP = 12; // D6
/** The chord moves at most this often, so it changes like harmony rather than flickering. */
const VOICING_DWELL_S = 10;
/** A call that would wait longer than this behind others is dropped. */
const MAX_CUE_WAIT_S = 3;
const CUE_RELEASE_S = 0.4;

/**
 * How full a count sounds, 0..1, on a log scale: the first few aircraft
 * change the music more than the thousandth does.
 */
export function fullness(count: number, full: number): number {
  return count <= 0 ? 0 : Math.min(1, Math.log1p(count) / Math.log1p(full));
}

/** Exponential glide towards a target: `tau` seconds is about two thirds of the way. */
function glide(current: number, target: number, dt: number, tau: number): number {
  return target + (current - target) * Math.exp(-dt / tau);
}

/** A stable small number per aircraft (FNV-1a), so the same aircraft always plays the same note. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * An aircraft's note as a scale step: its altitude picks the register
 * (higher flies, higher note) and its id picks one of three notes there, so
 * aircraft at one height make a chord rather than a unison.
 */
export function noteStep(voice: Pick<AircraftVoice, 'id' | 'altitudeM'>): number {
  const band =
    voice.altitudeM === undefined ? 3 : Math.max(0, Math.min(TOP_BAND, Math.floor(voice.altitudeM / METRES_PER_STEP)));
  return LOWEST_STEP + band + (hash(voice.id) % 3);
}

/** Each call's tones as scale steps: a clear falling fourth twice, a rising chord, a single high note. */
const CALLS: Record<CueKind, { offset: number; step: number; hold: number; gain: number }[]> = {
  emergency: [
    { offset: 0, step: 13, hold: 0.36, gain: 1 }, // E6
    { offset: 0.45, step: 10, hold: 0.6, gain: 1 }, // A5
    { offset: 1.5, step: 13, hold: 0.36, gain: 1 },
    { offset: 1.95, step: 10, hold: 0.6, gain: 1 },
  ],
  finding: [
    { offset: 0, step: 10, hold: 0.45, gain: 0.75 }, // A5
    { offset: 0.16, step: 11, hold: 0.45, gain: 0.75 }, // C6
    { offset: 0.32, step: 13, hold: 0.8, gain: 0.75 }, // E6
  ],
  area: [{ offset: 0, step: 13, hold: 0.22, gain: 0.5 }],
};
const DUCK: Record<CueKind, number> = { emergency: 0.3, finding: 0.45, area: 0.7 };

export class Conductor {
  /** Smoothed fullness of the sky and the sea, the share of ships making way, and the climb-descent lean. */
  private air = 0;
  private sea = 0;
  private underWay = 0;
  private lean = 0;
  private voicing: Voicing = 'mid';
  private voicingSince = -Infinity;
  private voices: AircraftVoice[] = [];
  private heardAt: number | undefined;
  /** When each bell note still sounding will have died away. */
  private ringing: number[] = [];
  private cueFreeAt = -Infinity;

  constructor(private readonly random: () => number) {}

  /** Take in the latest picture, heard at audio time `at`. Called about once a second. */
  listen(picture: PictureSummary, at: number): void {
    const dt = this.heardAt === undefined ? 1 : Math.max(0, at - this.heardAt);
    this.heardAt = at;
    // Everything glides: a pan from empty ocean to a busy coast swells in
    // over a few seconds instead of switching on.
    this.air = glide(this.air, fullness(picture.aircraft, FULL_SKY), dt, 2.5);
    this.sea = glide(this.sea, fullness(picture.ships, FULL_SEA), dt, 3);
    if (picture.ships > 0) this.underWay = glide(this.underWay, picture.shipsUnderWay / picture.ships, dt, 4);
    // A few aircraft must lean the same way before the whole chord moves.
    const lean = picture.aircraft > 0 ? (picture.climbing - picture.descending) / Math.max(5, picture.aircraft) : 0;
    this.lean = glide(this.lean, lean, dt, 4);
    this.voices = picture.voices;
    this.chooseVoicing(at);
  }

  mix(): Mix {
    return {
      drone: { level: this.sea, brightness: this.underWay },
      pad: { level: this.air, brightness: this.air, voicing: this.voicing },
      bells: { brightness: this.air },
    };
  }

  /**
   * The bell notes for [from, to) on the audio clock. Notes land on a slow
   * grid: quarter notes for a sparse sky, eighths once it is busy and
   * sixteenths when it is full, each beat played with a chance that grows
   * with the traffic. Busier means more notes, but each softer and shorter,
   * so a full sky shimmers rather than gets loud.
   */
  notes(from: number, to: number): Note[] {
    const out: Note[] = [];
    if (this.voices.length === 0) return out;
    const density = this.air;
    for (let slot = Math.ceil(from / SLOT_S - 1e-9); slot * SLOT_S < to; slot++) {
      if (!slotOpen(slot, density)) continue;
      const downbeat = slot % 4 === 0;
      if (this.random() >= (0.22 + 0.5 * density) * (downbeat ? 1.15 : 1)) continue;
      const voice = this.voices[Math.floor(this.random() * this.voices.length)]!;
      // A touch of human timing, ±10 ms, so the grid breathes.
      const at = slot * SLOT_S + (this.random() - 0.5) * 0.02;
      for (const note of this.figure(voice, Math.max(from, at), density, downbeat)) {
        if (!this.claimBell(note)) break;
        out.push(note);
      }
    }
    return out;
  }

  /**
   * An alert's call at audio time `at`. One call at a time: a call that
   * arrives during another waits for it, and one that would wait longer than
   * three seconds is dropped (two pings in a row are enough to be heard).
   */
  cue(kind: CueKind, at: number): Cue | null {
    const start = Math.max(at, this.cueFreeAt);
    if (start - at > MAX_CUE_WAIT_S) return null;
    const tones = CALLS[kind].map((t) => ({
      at: start + t.offset,
      frequency: frequencyOfStep(t.step),
      hold: t.hold,
      gain: t.gain,
    }));
    const length = Math.max(...CALLS[kind].map((t) => t.offset + t.hold)) + CUE_RELEASE_S;
    this.cueFreeAt = start + length;
    return { kind, at: start, length, tones, duck: DUCK[kind] };
  }

  private figure(voice: AircraftVoice, at: number, density: number, downbeat: boolean): Note[] {
    // Two scale steps (a third or a fourth): wide enough to hear the direction
    // at once. Bells stay below E6, which belongs to the alert calls.
    const step = noteStep(voice);
    const steps =
      voice.climb === 'climbing'
        ? [step, Math.min(HIGHEST_BELL_STEP, step + 2)]
        : voice.climb === 'descending'
          ? [step, step - 2]
          : [step];
    const gain = (0.9 - 0.55 * density) * (0.85 + 0.15 * this.random()) * (downbeat ? 1.1 : 1);
    const decay = 4 - 2.6 * density;
    return steps.map((s, i) => ({
      at: at + i * GRACE_S,
      frequency: frequencyOfStep(s),
      gain: Math.min(1, i === 0 ? gain : gain * 0.8),
      decay,
      pan: voice.pan,
    }));
  }

  private claimBell(note: Note): boolean {
    this.ringing = this.ringing.filter((end) => end > note.at);
    if (this.ringing.length >= MAX_BELLS) return false;
    this.ringing.push(note.at + note.decay);
    return true;
  }

  /** Hysteresis and a minimum dwell: the chord moves when the sky clearly leans one way. */
  private chooseVoicing(at: number): void {
    if (at - this.voicingSince < VOICING_DWELL_S) return;
    const next: Voicing =
      this.lean > 0.2 ? 'high' : this.lean < -0.2 ? 'low' : Math.abs(this.lean) < 0.1 ? 'mid' : this.voicing;
    if (next === this.voicing) return;
    this.voicing = next;
    this.voicingSince = at;
  }
}

/** Which beats can carry a note: quarters always, eighths once the sky is busy, sixteenths when it is full. */
function slotOpen(slot: number, density: number): boolean {
  if (slot % 4 === 0) return true;
  if (slot % 2 === 0) return density > 0.35;
  return density > 0.65;
}
