import { describe, expect, it } from 'vitest';
import type { Track } from './track';
import { sanitizeTrack } from './validate';
import { decodeTrack, encodeTrack } from './wire';

const base: Track = {
  id: 'adsb:4ca7b3', source: 'adsb', domain: 'air', platform: 'aircraft', affiliation: 'unknown',
  lat: 51.5, lon: -0.4, courseDeg: 0, speedMps: 1, observedAt: 1000,
};

describe('wire edges', () => {
  it('keeps courseDeg inside [0, 360) after rounding to 0.1', () => {
    const t = sanitizeTrack({ ...base, courseDeg: 359.96 })!;
    expect(t.courseDeg).toBeLessThan(360); // validation normalises to [0, 360)
    const onWire = encodeTrack(t, 2000)[7];
    // Expected: 0 (or 359.9). Actual: 360, which no sanitiser ever let through.
    expect(onWire).toBeLessThan(360);
  });

  it('a huge but finite speed survives the wire as a number', () => {
    const t = sanitizeTrack({ ...base, speedMps: 1e308 })!; // passes validation: finite and > 0
    const back = decodeTrack(JSON.parse(JSON.stringify(encodeTrack(t, 2000))), 2000);
    // Math.round(1e308 * 10) is Infinity, which JSON writes as null.
    expect(typeof back.speedMps).toBe('number');
  });
});
