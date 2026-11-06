/**
 * The score's one scale: A minor pentatonic (A C D E G). No two of its notes
 * are a semitone apart, so whatever the picture picks, nothing clashes: that
 * is what lets a random choice still sound like music. The alert ping's A5
 * and E6 are in it too, so the two never fight.
 */
export const PENTATONIC: readonly number[] = [0, 3, 5, 7, 10];

/** Step 0 is A3: MIDI 57, 220 Hz. */
const A3 = 57;

/** The MIDI note `step` (a whole number) scale steps above, or below, A3. */
export function midiOfStep(step: number): number {
  const octave = Math.floor(step / PENTATONIC.length);
  return A3 + 12 * octave + PENTATONIC[step - octave * PENTATONIC.length]!;
}

/** Equal temperament, with A4 at 440 Hz. */
export function frequencyOfMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function frequencyOfStep(step: number): number {
  return frequencyOfMidi(midiOfStep(step));
}

/** Whether a MIDI note is one of the scale's five pitch classes, in any octave. */
export function inScale(midi: number): boolean {
  return PENTATONIC.includes((((midi - A3) % 12) + 12) % 12);
}

/** A small seeded random source (mulberry32), so a rendered score can be played back exactly. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
