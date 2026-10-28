import { readFileSync } from 'node:fs';
import { sanitizeTrack } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { mapAircraft, parseAircraftResponse } from './mapAircraft';

function fixture(name: string) {
  const parsed = parseAircraftResponse(JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')));
  if (!parsed) throw new Error(`bad fixture ${name}`);
  return parsed;
}

describe('mapAircraft on recorded responses (27 Oct 2026, 17:13 UTC)', () => {
  const cairo = fixture('cairo-2026-10-27.json');
  const outcomes = cairo.ac.map((ac) => mapAircraft(ac, cairo.now, 'adsb.lol'));

  it('splits airborne aircraft, aircraft on the ground, and incomplete reports', () => {
    expect(outcomes).toHaveLength(42);
    expect(outcomes.filter((o) => o.kind === 'airborne')).toHaveLength(37);
    expect(outcomes.filter((o) => o.kind === 'on-ground')).toHaveLength(3);
    expect(outcomes.filter((o) => o.kind === 'skip' && o.reason === 'no-velocity')).toHaveLength(2);
  });

  it('maps every field of an airliner, converting units and timing from the source', () => {
    const o = outcomes.find((x) => x.kind === 'airborne' && x.report.id === 'adsb:4854cf');
    expect(o).toEqual({
      kind: 'airborne',
      report: {
        id: 'adsb:4854cf',
        source: 'adsb',
        domain: 'air',
        platform: 'airliner', // A3, large
        affiliation: 'unknown',
        callsign: 'TRA5164',
        lat: 33.241277,
        lon: 28.636593,
        altitudeM: 38975 * 0.3048, // geometric, feet to metres
        courseDeg: 331.05,
        speedMps: 462.8 * (1852 / 3600), // knots to m/s
        observedAt: 1793121192501 - 201, // the response's now, minus seen_pos
        provider: 'adsb.lol',
      },
    });
  });

  it('produces reports the validator accepts unchanged', () => {
    for (const o of outcomes) if (o.kind === 'airborne') expect(sanitizeTrack(o.report)).toEqual(o.report);
  });

  it('maps all of Johannesburg', () => {
    const jnb = fixture('johannesburg-2026-10-27.json');
    expect(jnb.ac.map((ac) => mapAircraft(ac, jnb.now, 'adsb.lol')).filter((o) => o.kind === 'airborne')).toHaveLength(13);
  });
});

describe('mapAircraft edge cases', () => {
  const now = 1_793_121_192_501;
  const base = { hex: 'abc123', lat: 50, lon: 0, gs: 400, track: 90, seen_pos: 1, category: 'A3' };

  it('skips non-ICAO addresses, which cannot merge across providers', () => {
    expect(mapAircraft({ ...base, hex: '~abc123' }, now, 'adsb.lol')).toEqual({ kind: 'skip', reason: 'malformed' });
  });

  it('skips reports without a position, a position age, or a velocity', () => {
    expect(mapAircraft({ ...base, lat: undefined }, now, 'adsb.lol')).toMatchObject({ reason: 'no-position' });
    expect(mapAircraft({ ...base, gs: undefined }, now, 'adsb.lol')).toMatchObject({ reason: 'no-velocity' });
    expect(mapAircraft({ ...base, track: undefined }, now, 'adsb.lol')).toMatchObject({ reason: 'no-velocity' });
  });

  it('falls back to seen when seen_pos is missing, and skips when both are', () => {
    const o = mapAircraft({ ...base, seen_pos: undefined, seen: 3 }, now, 'adsb.lol');
    expect(o.kind === 'airborne' && o.report.observedAt).toBe(now - 3000);
    expect(mapAircraft({ ...base, seen_pos: undefined, seen: undefined }, now, 'adsb.lol')).toMatchObject({ reason: 'no-position' });
  });

  it('skips ground vehicles and uses barometric altitude when that is all there is', () => {
    expect(mapAircraft({ ...base, category: 'C1' }, now, 'adsb.lol')).toMatchObject({ reason: 'not-aircraft' });
    const o = mapAircraft({ ...base, alt_baro: 10000 }, now, 'adsb.lol');
    expect(o.kind === 'airborne' && o.report.altitudeM).toBe(3048);
  });

  it('treats alt_baro "ground" as on the ground', () => {
    expect(mapAircraft({ ...base, alt_baro: 'ground' }, now, 'adsb.lol')).toEqual({ kind: 'on-ground', id: 'adsb:abc123' });
  });
});

describe('parseAircraftResponse', () => {
  it('rejects bodies of the wrong shape', () => {
    expect(parseAircraftResponse({ ac: [] })).toBeNull();
    expect(parseAircraftResponse({ now: 1 })).toBeNull();
    expect(parseAircraftResponse('nope')).toBeNull();
  });
});

describe('mapAircraft on an adsb.fi response (Cork, 28 Oct 2026, 09:47 UTC)', () => {
  // adsb.fi's v3 point query answers in the same readsb schema as adsb.lol.
  const cork = fixture('cork-adsbfi-2026-10-28.json');
  const outcomes = cork.ac.map((ac) => mapAircraft(ac, cork.now, 'adsb.fi'));

  it('maps every aircraft, credited to adsb.fi and timed by its clock', () => {
    const airborne = outcomes.flatMap((o) => (o.kind === 'airborne' ? [o.report] : []));
    expect(airborne).toHaveLength(25);
    expect(airborne.every((t) => t.provider === 'adsb.fi' && t.observedAt <= cork.now)).toBe(true);
    expect(airborne.every((t) => sanitizeTrack(t) !== null)).toBe(true);
  });
});
