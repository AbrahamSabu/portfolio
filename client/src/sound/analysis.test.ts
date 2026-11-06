import { describe, expect, it } from 'vitest';
import { bandPower, centroid, clickSize, dbfs, flatness, peak, powerSpectrum, rms, scaleShare, type Spectrum } from './analysis';
import { inScale, seededRandom } from './scale';
import { encodeWav } from './wav';

const RATE = 48_000;

function tone(seconds: number, ...partials: [hz: number, amplitude: number][]): Float32Array {
  const x = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < x.length; i++)
    for (const [hz, a] of partials) x[i] = x[i]! + a * Math.sin((2 * Math.PI * hz * i) / RATE);
  return x;
}

function spectrum(x: Float32Array): Spectrum {
  return { power: powerSpectrum(x, 0, x.length), rate: RATE };
}

describe('audio measures', () => {
  it('measures level, peak and clicks', () => {
    const x = tone(1, [440, 0.5]);
    expect(rms(x)).toBeCloseTo(0.5 / Math.SQRT2, 3);
    expect(peak(x)).toBeCloseTo(0.5, 3);
    expect(dbfs(1)).toBe(0);
    expect(dbfs(0)).toBe(-200);
    expect(clickSize(x)).toBeLessThan(0.003);
    for (let i = 1000; i < x.length; i++) x[i] = x[i]! + 0.05; // a level that steps: a click
    expect(clickSize(x)).toBeGreaterThan(0.045);
  });

  it('tells notes on the scale from notes off it', () => {
    expect(scaleShare(spectrum(tone(1, [440, 0.5], [659.26, 0.3])), 200, 4000, inScale)).toBeGreaterThan(0.99); // A4, E5
    expect(scaleShare(spectrum(tone(1, [466.16, 0.5])), 200, 4000, inScale)).toBeLessThan(0.01); // A#4
  });

  it('tells tone from noise', () => {
    const random = seededRandom(1);
    const noise = Float32Array.from({ length: RATE }, () => random() * 2 - 1);
    expect(flatness(spectrum(noise), 200, 8000)).toBeGreaterThan(0.5);
    expect(flatness(spectrum(tone(1, [440, 0.5], [880, 0.2])), 200, 8000)).toBeLessThan(0.01);
  });

  it('finds where the power sits', () => {
    expect(centroid(spectrum(tone(1, [1000, 0.5])), 100, 8000)).toBeCloseTo(1000, -1);
    const s = spectrum(tone(1, [100, 0.5], [2000, 0.05]));
    expect(dbfs(Math.sqrt(bandPower(s, 50, 200) / bandPower(s, 1500, 2500)))).toBeCloseTo(20, 0);
  });

  it('writes a playable WAV', () => {
    const left = Float32Array.from([0, 1, -1, 0.5]);
    const right = Float32Array.from([0, -1, 1, 2]);
    const wav = encodeWav([left, right], 48_000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 16))).toBe('WAVEfmt ');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(40, true)).toBe(16);
    expect(wav.length).toBe(44 + 16);
    expect([1, 2, 3, 4, 5, 6, 7].map((i) => view.getInt16(44 + 2 * i, true))).toEqual([0, 32767, -32768, -32768, 32767, 16384, 32767]);
  });
});
