/**
 * Measures of rendered audio, for the sound check: how loud, whether it
 * clips or clicks, whether its tones sit on the scale, and whether it is
 * tone or noise. Pure arithmetic on sample arrays, so the tests can hold it
 * to signals whose answers are known.
 */

/** Root mean square of samples [from, to). */
export function rms(x: Float32Array, from = 0, to = x.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function peak(x: Float32Array, from = 0, to = x.length): number {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(x[i]!));
  return max;
}

/** Decibels relative to full scale; silence reads as -200. */
export function dbfs(level: number): number {
  return level > 1e-10 ? 20 * Math.log10(level) : -200;
}

/**
 * The sharpest turn in the waveform (largest second difference). A tone
 * curves gently, about A(2πf/rate)² per sample, 0.01 for a loud 1.3 kHz
 * note; a click (a level that steps instead of ramping) turns by the whole
 * step at once.
 */
export function clickSize(x: Float32Array, from = 2, to = x.length): number {
  let max = 0;
  for (let i = Math.max(2, from); i < to; i++) max = Math.max(max, Math.abs(x[i]! - 2 * x[i - 1]! + x[i - 2]!));
  return max;
}

/** Averaged power spectrum of [from, to): Hann windows of `size` samples (a power of two), half overlapped. */
export function powerSpectrum(x: Float32Array, from: number, to: number, size = 16384): Float64Array {
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let frames = 0;
  for (let start = from; start + size <= to; start += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = x[start + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] = power[k]! + re[k]! ** 2 + im[k]! ** 2;
    frames++;
  }
  if (frames > 1) for (let k = 0; k < power.length; k++) power[k] = power[k]! / frames;
  return power;
}

/** A spectrum and how to read it: `rate` is the sample rate, the spectrum's bins are `rate / (2 * length)` apart. */
export interface Spectrum {
  power: Float64Array;
  rate: number;
}

function bins({ power, rate }: Spectrum, lo: number, hi: number): [first: number, last: number, hz: number] {
  const hz = rate / (2 * power.length);
  return [Math.max(1, Math.ceil(lo / hz)), Math.min(power.length - 1, Math.floor(hi / hz)), hz];
}

/** Total power between two frequencies (relative units: compare two of them in dB). */
export function bandPower(s: Spectrum, lo: number, hi: number): number {
  const [first, last] = bins(s, lo, hi);
  let sum = 0;
  for (let k = first; k <= last; k++) sum += s.power[k]!;
  return sum;
}

/** The spectrum's centre of mass in Hz: higher notes pull it up. */
export function centroid(s: Spectrum, lo: number, hi: number): number {
  const [first, last, hz] = bins(s, lo, hi);
  let weighted = 0;
  let sum = 0;
  for (let k = first; k <= last; k++) {
    weighted += k * hz * s.power[k]!;
    sum += s.power[k]!;
  }
  return sum > 0 ? weighted / sum : 0;
}

/** Spectral flatness: about 1 for white noise, near 0 for a few clear tones. */
export function flatness(s: Spectrum, lo: number, hi: number): number {
  const [first, last] = bins(s, lo, hi);
  let logSum = 0;
  let sum = 0;
  for (let k = first; k <= last; k++) {
    logSum += Math.log(s.power[k]! + 1e-30);
    sum += s.power[k]!;
  }
  const n = last - first + 1;
  return sum > 0 ? Math.exp(logSum / n) / (sum / n) : 0;
}

/**
 * Of the power that sits on a semitone (within `toleranceCents` of one),
 * the share on semitones the scale contains. Power between semitones
 * (noise, reverb wash) counts for neither.
 */
export function scaleShare(s: Spectrum, lo: number, hi: number, inScale: (midi: number) => boolean, toleranceCents = 35): number {
  const [first, last, hz] = bins(s, lo, hi);
  let on = 0;
  let off = 0;
  for (let k = first; k <= last; k++) {
    const midi = 69 + 12 * Math.log2((k * hz) / 440);
    const nearest = Math.round(midi);
    if (Math.abs(midi - nearest) * 100 > toleranceCents) continue;
    if (inScale(nearest)) on += s.power[k]!;
    else off += s.power[k]!;
  }
  return on + off > 0 ? on / (on + off) : 0;
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const r = re[i]!;
      re[i] = re[j]!;
      re[j] = r;
      const m = im[i]!;
      im[i] = im[j]!;
      im[j] = m;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}
