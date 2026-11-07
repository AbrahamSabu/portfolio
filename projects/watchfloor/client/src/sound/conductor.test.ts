import { describe, expect, it } from 'vitest';
import type { Climb } from './climb';
import { Conductor, GRACE_S, MAX_BELLS, SLOT_S, fullness, noteStep, type Note } from './conductor';
import { QUIET, type PictureSummary } from './picture';
import { frequencyOfMidi, inScale, seededRandom } from './scale';

/** A picture of `aircraft` aircraft (all sampled as voices) and `ships` ships. */
function picture(aircraft: number, ships = 0, climb: Climb = 'level', altitudeM = 9000): PictureSummary {
  const voices = Array.from({ length: Math.min(aircraft, 48) }, (_, i) => ({ id: `a${i}`, altitudeM, climb, pan: 0 }));
  return {
    aircraft,
    ships,
    shipsUnderWay: Math.floor(ships / 2),
    climbing: climb === 'climbing' ? aircraft : 0,
    descending: climb === 'descending' ? aircraft : 0,
    voices,
  };
}

/** Listen to the same picture for `seconds`, collecting every note. */
function play(conductor: Conductor, scene: PictureSummary, seconds: number, start = 0): Note[] {
  const notes: Note[] = [];
  for (let t = start; t < start + seconds; t++) {
    conductor.listen(scene, t);
    notes.push(...conductor.notes(t, t + 1));
  }
  return notes;
}

const midiOf = (frequency: number) => Math.round(69 + 12 * Math.log2(frequency / 440));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('the conductor', () => {
  it('feels the first aircraft more than the thousandth', () => {
    expect(fullness(0, 2000)).toBe(0);
    expect(fullness(1, 2000)).toBeGreaterThan(0.05);
    expect(fullness(20, 2000)).toBeGreaterThan(fullness(5, 2000));
    expect(fullness(5000, 2000)).toBe(1);
    expect(fullness(20, 2000) - fullness(10, 2000)).toBeGreaterThan(fullness(1010, 2000) - fullness(1000, 2000));
  });

  it('is silent when nothing is in view', () => {
    const conductor = new Conductor(seededRandom(1));
    expect(play(conductor, QUIET, 30)).toEqual([]);
    expect(conductor.mix()).toMatchObject({ drone: { level: 0 }, pad: { level: 0 } });
  });

  it('only ever plays notes in the scale', () => {
    const conductor = new Conductor(seededRandom(2));
    const notes = [
      ...play(conductor, picture(300, 100, 'climbing', 2500), 20),
      ...play(conductor, picture(300, 100, 'descending', 11000), 20, 20),
      ...play(conductor, picture(3), 20, 40),
    ];
    expect(notes.length).toBeGreaterThan(50);
    for (const note of notes) {
      expect(inScale(midiOf(note.frequency))).toBe(true);
      expect(note.frequency).toBeCloseTo(frequencyOfMidi(midiOf(note.frequency)), 6);
    }
  });

  it('sounds higher aircraft higher, and the same aircraft the same', () => {
    expect(noteStep({ id: 'x', altitudeM: 11000 })).toBeGreaterThan(noteStep({ id: 'x', altitudeM: 1000 }));
    expect(noteStep({ id: 'x', altitudeM: 5000 })).toBe(noteStep({ id: 'x', altitudeM: 5000 }));
    for (const altitudeM of [-100, 0, 4000, 12000, 30000, undefined])
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const step = noteStep({ id, altitudeM });
        expect(step).toBeGreaterThanOrEqual(2);
        expect(step).toBeLessThanOrEqual(11);
      }
  });

  it('plays a rising pair for a climbing aircraft and a falling pair for a descending one', () => {
    for (const [climb, sign] of [
      ['climbing', 1],
      ['descending', -1],
    ] as const) {
      const notes = play(new Conductor(seededRandom(4)), picture(1, 0, climb), 60);
      const pairs = notes.filter((n, i) => i > 0 && Math.abs(n.at - notes[i - 1]!.at - GRACE_S) < 1e-9);
      expect(pairs.length).toBeGreaterThan(5);
      for (const second of pairs) {
        const first = notes[notes.indexOf(second) - 1]!;
        expect(Math.sign(second.frequency - first.frequency)).toBe(sign);
      }
    }
    const level = play(new Conductor(seededRandom(4)), picture(1), 60);
    expect(level.every((n, i) => i === 0 || n.at - level[i - 1]!.at > GRACE_S + 0.05)).toBe(true);
  });

  it('plays a busy sky as more, softer, shorter notes, on a finer beat', () => {
    const sparse = play(new Conductor(seededRandom(5)), picture(3), 60).filter((n) => n.at > 15);
    const busy = play(new Conductor(seededRandom(5)), picture(1500), 60).filter((n) => n.at > 15);
    expect(busy.length).toBeGreaterThan(sparse.length * 3);
    expect(mean(busy.map((n) => n.gain))).toBeLessThan(mean(sparse.map((n) => n.gain)) * 0.7);
    expect(mean(busy.map((n) => n.decay))).toBeLessThan(mean(sparse.map((n) => n.decay)));
    // On the grid, give or take 10 ms of human timing: sparse on quarter notes only.
    const offGrid = (n: Note, every: number) => Math.abs(n.at / every - Math.round(n.at / every)) * every;
    expect(sparse.every((n) => offGrid(n, SLOT_S * 4) <= 0.0101)).toBe(true);
    expect(busy.some((n) => offGrid(n, SLOT_S * 2) > 0.1)).toBe(true); // sixteenths in use
    expect(busy.every((n) => offGrid(n, SLOT_S) <= 0.0101)).toBe(true);
  });

  it('never has more than six bells ringing at once', () => {
    const notes = play(new Conductor(seededRandom(6)), picture(2000, 0, 'climbing'), 60);
    for (const note of notes) {
      const ringing = notes.filter((n) => n.at <= note.at && n.at + n.decay > note.at);
      expect(ringing.length).toBeLessThanOrEqual(MAX_BELLS);
    }
  });

  it('books the same notes however the time is cut up', () => {
    const scene = picture(400);
    const whole = new Conductor(seededRandom(8));
    const pieces = new Conductor(seededRandom(8));
    whole.listen(scene, 0);
    pieces.listen(scene, 0);
    const a = whole.notes(0, 1);
    const b = [...pieces.notes(0, 0.3), ...pieces.notes(0.3, 0.55), ...pieces.notes(0.55, 1)];
    expect(b.map((n) => n.frequency)).toEqual(a.map((n) => n.frequency));
    b.forEach((n, i) => expect(Math.abs(n.at - a[i]!.at)).toBeLessThan(0.011));
  });

  it('glides: a sudden sky swells in over seconds', () => {
    const conductor = new Conductor(seededRandom(9));
    conductor.listen(picture(2000, 300), 0);
    const first = conductor.mix();
    expect(first.pad.level).toBeGreaterThan(0);
    expect(first.pad.level).toBeLessThan(0.5);
    expect(first.drone.level).toBeLessThan(0.5);
    for (let t = 1; t <= 15; t++) conductor.listen(picture(2000, 300), t);
    expect(conductor.mix().pad.level).toBeGreaterThan(0.95);
    expect(conductor.mix().drone.level).toBeGreaterThan(0.95);
  });

  it('moves the chord up when the sky climbs, down when it descends, and not too often', () => {
    const conductor = new Conductor(seededRandom(10));
    play(conductor, picture(40, 0, 'climbing'), 12);
    expect(conductor.mix().pad.voicing).toBe('high');
    // On the way down it passes through the middle chord, and holds it ten seconds.
    play(conductor, picture(40, 0, 'descending'), 9, 12);
    expect(conductor.mix().pad.voicing).toBe('mid');
    play(conductor, picture(40, 0, 'descending'), 12, 21);
    expect(conductor.mix().pad.voicing).toBe('low');
    play(conductor, picture(40), 20, 33);
    expect(conductor.mix().pad.voicing).toBe('mid');
  });

  it('calls one alert at a time, in the scale, with the music dipped under it', () => {
    const conductor = new Conductor(seededRandom(11));
    const emergency = conductor.cue('emergency', 10)!;
    expect(emergency.tones.map((t) => Math.round(t.frequency))).toEqual([1319, 880, 1319, 880]);
    expect(emergency.duck).toBeLessThan(0.5);
    const finding = conductor.cue('finding', 10.5)!;
    expect(finding.at).toBeCloseTo(10 + emergency.length, 6);
    expect(finding.tones.every((t) => inScale(midiOf(t.frequency)))).toBe(true);
    expect(conductor.cue('area', 11)).toBeNull(); // would wait too long
    expect(conductor.cue('area', 20)!.at).toBe(20);
  });
});
