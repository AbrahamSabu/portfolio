import { bandPower, centroid, clickSize, dbfs, flatness, peak, powerSpectrum, rms, scaleShare, type Spectrum } from './analysis';
import type { Climb } from './climb';
import { Conductor, type CueKind } from './conductor';
import { ScoreEngine } from './engine';
import { MAX_VOICES, type PictureSummary } from './picture';
import { inScale, seededRandom } from './scale';
import { encodeWav } from './wav';

/**
 * The sound check's browser half, bundled and run in headless Chrome by
 * server/src/tools/soundCheck.ts (Node has no Web Audio). It renders a
 * scripted minute of pictures through the same conductor and engine the map
 * uses, with an OfflineAudioContext (faster than real time, exactly
 * repeatable), then measures the result. Not part of the app.
 */

const RATE = 48_000;
const VOLUME = 0.6;

/** What the script shows, second by second. */
interface Scene {
  until: number;
  aircraft: number;
  ships: number;
  climb?: Climb | 'mixed';
  altitude?: [low: number, high: number];
}
const SCRIPT: Scene[] = [
  { until: 8, aircraft: 0, ships: 0 }, // empty ocean
  { until: 22, aircraft: 600, ships: 150, climb: 'mixed', altitude: [500, 12_000] }, // a busy coast
  { until: 34, aircraft: 30, ships: 0, climb: 'climbing', altitude: [4_000, 6_000] }, // departures
  { until: 46, aircraft: 30, ships: 0, climb: 'descending', altitude: [4_000, 6_000] }, // arrivals
  { until: 56, aircraft: 0, ships: 120 }, // a shipping lane, no aircraft
  { until: 64, aircraft: 3, ships: 0, altitude: [9_000, 11_000] }, // a quiet sky, then an emergency
];
const CUES: { at: number; kind: CueKind }[] = [
  { at: 18, kind: 'emergency' },
  { at: 58, kind: 'emergency' },
];
const SECONDS = SCRIPT[SCRIPT.length - 1]!.until;

function sceneAt(t: number): Scene {
  return SCRIPT.find((s) => t < s.until) ?? SCRIPT[SCRIPT.length - 1]!;
}

function pictureOf(scene: Scene): PictureSummary {
  const [low, high] = scene.altitude ?? [9_000, 9_000];
  const climbOf = (i: number): Climb =>
    scene.climb === 'mixed' ? (['climbing', 'level', 'level', 'level', 'level', 'descending'] as const)[i % 6]! : (scene.climb ?? 'level');
  const voices = Array.from({ length: Math.min(scene.aircraft, MAX_VOICES) }, (_, i) => ({
    id: `sim:air-${i}`,
    altitudeM: low + ((high - low) * ((i * 37) % 100)) / 100,
    climb: climbOf(i),
    pan: ((i * 53) % 100) / 62.5 - 0.8,
  }));
  const share = (c: Climb) => voices.filter((v) => v.climb === c).length / Math.max(1, voices.length);
  return {
    aircraft: scene.aircraft,
    ships: scene.ships,
    shipsUnderWay: Math.round(scene.ships * 0.6),
    climbing: Math.round(scene.aircraft * share('climbing')),
    descending: Math.round(scene.aircraft * share('descending')),
    voices,
  };
}

/** Play `script` through a fresh conductor and engine, as the map would, and render it. */
async function render(seconds: number, pictureAt: (t: number) => PictureSummary, cues: typeof CUES, volume: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, RATE * seconds, RATE);
  const engine = new ScoreEngine(ctx, ctx.destination, volume);
  const conductor = new Conductor(seededRandom(42));
  engine.fadeIn(0);
  for (let t = 0; t < seconds; t++) {
    conductor.listen(pictureAt(t), t);
    engine.apply(conductor.mix(), t);
    for (const note of conductor.notes(t, t + 1)) engine.play(note);
    for (const c of cues.filter((c) => c.at >= t && c.at < t + 1)) {
      const cue = conductor.cue(c.kind, c.at);
      if (cue) engine.playCue(cue);
    }
  }
  return ctx.startRendering();
}

function mono(buffer: AudioBuffer): Float32Array {
  const [l, r] = [buffer.getChannelData(0), buffer.getChannelData(1)];
  return l.map((v, i) => (v + r[i]!) / 2);
}

export interface Check {
  name: string;
  value: string;
  limit: string;
  pass: boolean;
}

/** Render the script, measure each part of it, and keep the WAV for listening. */
async function run(): Promise<{ checks: Check[]; seconds: number; wavChars: number }> {
  const buffer = await render(SECONDS, (t) => pictureOf(sceneAt(t)), CUES, VOLUME);
  const x = mono(buffer);
  const at = (s: number) => Math.round(s * RATE);
  const part = (from: number, to: number): Spectrum => ({ power: powerSpectrum(x, at(from), at(to)), rate: RATE });
  const db = (power: number) => 10 * Math.log10(power + 1e-30);
  const checks: Check[] = [];
  const check = (name: string, value: number, unit: string, limit: string, pass: boolean) =>
    checks.push({ name, value: `${value.toFixed(unit === '' ? 3 : 1)}${unit}`, limit, pass });

  const quiet = dbfs(rms(x, at(2), at(8)));
  check('Empty ocean is silent', quiet, ' dBFS', '< -80 dBFS', quiet < -80);

  // The busy coast before its emergency call (18 s) starts.
  const busyLevel = dbfs(rms(x, at(13), at(17.9)));
  check('Busy coast: loudness', busyLevel, ' dBFS', '-38 to -16 dBFS', busyLevel > -38 && busyLevel < -16);
  const busy = part(13, 17.9);
  const onScale = scaleShare(busy, 200, 4000, inScale);
  check('Busy coast: tonal power on the scale', onScale * 100, '%', '> 90%', onScale > 0.9);
  const flat = flatness(busy, 200, 6000);
  check('Busy coast: tone, not noise (flatness)', flat, '', '< 0.1', flat < 0.1);

  const up = centroid(part(28, 34), 150, 4000);
  const down = centroid(part(40, 46), 150, 4000);
  check('Climbers sound higher than descenders', (up / down - 1) * 100, '% higher', '> 8% higher', up > down * 1.08);

  // Against the arrivals, long after the busy coast's drone has died away.
  const shipsLow = db(bandPower(part(50, 56), 40, 160));
  const airLow = db(bandPower(part(40, 46), 40, 160));
  check('Ships bring the low drone', shipsLow - airLow, ' dB', '> 20 dB more below 160 Hz', shipsLow - airLow > 20);
  const shipsHigh = db(bandPower(part(50, 56), 1000, 5000));
  const busyHigh = db(bandPower(busy, 1000, 5000));
  check('No aircraft, no bells', busyHigh - shipsHigh, ' dB', '> 25 dB less above 1 kHz', busyHigh - shipsHigh > 25);

  // The call's first note (E6) against the music just before it, over the busy coast and over a quiet sky.
  const e6 = (from: number, to: number) => db(bandPower(part(from, to), 1300, 1340));
  for (const [where, start] of [
    ['busy coast', 18],
    ['quiet sky', 58],
  ] as const) {
    const rise = e6(start, start + 0.35) - e6(start - 1.6, start - 0.1);
    check(`Emergency call stands out (${where})`, rise, ' dB', '> 15 dB above the music at E6', rise > 15);
  }
  const louder = dbfs(rms(x, at(18.02), at(18.34))) - busyLevel;
  check('Emergency call is louder than the busy music', louder, ' dB', '> 3 dB', louder > 3);

  const loudest = dbfs(peak(x));
  check('Never clips', loudest, ' dBFS', '< -1 dBFS', loudest < -1);
  const click = clickSize(x);
  check('No clicks (sharpest turn in the waveform)', click, '', '< 0.03', click < 0.03);

  // The limiter's own test: everything at once, full volume, a call every quarter second.
  const flood = await render(
    10,
    () => pictureOf({ until: 10, aircraft: 5_000, ships: 5_000, climb: 'mixed', altitude: [0, 12_000] }),
    Array.from({ length: 12 }, (_, i) => ({ at: 2 + i / 4, kind: 'emergency' as const })),
    1,
  );
  const floodPeak = dbfs(Math.max(peak(flood.getChannelData(0)), peak(flood.getChannelData(1))));
  check('Limiter holds at full volume, everything at once', floodPeak, ' dBFS', '< -0.5 dBFS', floodPeak < -0.5);

  const wav = encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], RATE);
  let binary = '';
  for (let i = 0; i < wav.length; i += 0x8000) binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  window.soundCheckWav = btoa(binary);
  return { checks, seconds: SECONDS, wavChars: window.soundCheckWav.length };
}

declare global {
  interface Window {
    soundCheck: () => Promise<{ checks: Check[]; seconds: number; wavChars: number }>;
    soundCheckWav: string;
  }
}
window.soundCheck = run;
