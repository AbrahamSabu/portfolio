import { elementsFromOmm } from '@watchfloor/shared';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ecfAt, groundTrack, nextPass, NO_POSITION, satelliteNow, toSatrec, writePositions } from './propagate';

/** The real stations fixture the server tests use (CelesTrak, 2026-11-06). */
const records = JSON.parse(
  fs.readFileSync(new URL('../../../server/src/space/fixtures/stations-2026-11-06.json', import.meta.url), 'utf8'),
) as unknown[];
const elements = records.map((r) => elementsFromOmm(r)!);
const iss = elements.find((e) => e.id === 25544)!;
const soyuz = elements.find((e) => e.id === 100057)!;
const AT = Date.UTC(2026, 10, 6, 12, 0);

describe('SGP4 through satellite.js', () => {
  it('puts the ISS about 420 km up at 7.66 km/s, never far beyond its inclination', () => {
    const satrec = toSatrec(iss)!;
    for (let minutes = 0; minutes < 93; minutes += 7) {
      const now = satelliteNow(satrec, AT + minutes * 60_000)!;
      expect(now.altKm).toBeGreaterThan(400);
      expect(now.altKm).toBeLessThan(440);
      expect(now.speedKmS).toBeCloseTo(7.66, 1);
      // Maps use geodetic latitude, which runs about 0.2° higher than the orbit's 51.6° tilt there.
      expect(Math.abs(now.lat)).toBeLessThan(51.9);
    }
  });

  it('writes Mercator positions and heights, and marks what it cannot place', () => {
    const satrecs = [toSatrec(iss), null];
    const out = new Float32Array(6);
    writePositions(satrecs, AT, out);
    expect(out[0]).toBeGreaterThanOrEqual(0);
    expect(out[0]).toBeLessThanOrEqual(1);
    expect(out[2]).toBeGreaterThan(400);
    expect(out[3]).toBe(NO_POSITION);
  });

  it('refuses elements SGP4 cannot use', () => {
    expect(toSatrec({ ...iss, eccentricity: 1.5 })).toBeNull();
  });

  it('places a docked Soyuz with its station', () => {
    const a = ecfAt(toSatrec(iss)!, AT)!;
    const b = ecfAt(toSatrec(soyuz)!, AT)!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(25);
  });

  it('traces a ground track a step every half minute', () => {
    const track = groundTrack(toSatrec(iss)!, iss.meanMotion, AT, 45 * 60_000, 93 * 60_000);
    expect(track.stepMs).toBe(30_984);
    expect(track.lons.length).toBeGreaterThan(260);
    expect(Math.max(...track.lats)).toBeGreaterThan(50);
    expect(Math.min(...track.lats)).toBeLessThan(-50);
  });

  it('finds the ISS passing over London within a day', () => {
    const pass = nextPass(toSatrec(iss)!, iss.meanMotion, { lat: 51.5, lon: -0.13 }, AT);
    expect(pass.kind).toBe('pass');
    if (pass.kind !== 'pass') return;
    expect(pass.pass.peak).toBeGreaterThan(AT);
    expect(pass.pass.peakElevation).toBeGreaterThanOrEqual(10);
    expect(pass.pass.set - (pass.pass.rise ?? AT)).toBeLessThan(15 * 60_000);
    expect(typeof pass.visible).toBe('boolean');
  });
});
