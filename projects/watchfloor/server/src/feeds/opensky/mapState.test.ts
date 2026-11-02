import { readFileSync } from 'node:fs';
import { sanitizeTrack } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { mapState, parseStatesResponse, type MapOutcome } from './mapState';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

function mapAll(name: string): MapOutcome[] {
  return (parseStatesResponse(fixture(name)) ?? []).map(mapState);
}

/** Outcomes keyed by icao24 so each test reads like the fixture row it checks. */
function byIcao(outcomes: MapOutcome[]): Record<string, MapOutcome> {
  const out: Record<string, MapOutcome> = {};
  for (const o of outcomes) {
    if (o.kind === 'airborne') out[o.report.id.slice(5)] = o;
    else if (o.kind === 'on-ground') out[o.id.slice(5)] = o;
  }
  return out;
}

describe('mapState on a recorded response (English Channel, 26 Oct 2026)', () => {
  const outcomes = mapAll('channel-2026-10-26.json');

  it('splits airborne aircraft from those on the ground', () => {
    expect(outcomes).toHaveLength(18);
    expect(outcomes.filter((o) => o.kind === 'airborne')).toHaveLength(13);
    // Five at Gatwick, taxiing or parked.
    expect(outcomes.filter((o) => o.kind === 'on-ground')).toHaveLength(5);
  });

  it('maps every field of a cruising airliner', () => {
    expect(byIcao(outcomes)['4ca2bf']).toEqual({
      kind: 'airborne',
      report: {
        id: 'adsb:4ca2bf',
        source: 'adsb',
        domain: 'air',
        platform: 'aircraft', // category 0: no information
        affiliation: 'unknown',
        callsign: 'RYR20SW',
        lat: 50.1856,
        lon: -0.9422,
        altitudeM: 10820.4, // geometric, not barometric 10568.94
        courseDeg: 10.74,
        speedMps: 201.59,
        observedAt: 1792975612_000,
        provider: 'opensky',
        squawk: '7467',
      },
    });
  });

  it('produces reports the validator accepts unchanged', () => {
    for (const o of outcomes) {
      if (o.kind === 'airborne') expect(sanitizeTrack(o.report)).toEqual(o.report);
    }
  });
});

describe('mapState edge cases', () => {
  const outcomes = mapAll('edge-cases.json');
  const by = byIcao(outcomes);
  const report = (icao: string) => {
    const o = by[icao];
    if (o?.kind !== 'airborne') throw new Error(`${icao} is not airborne`);
    return o.report;
  };

  it('skips rows without a position, velocity or valid shape, and non-aircraft', () => {
    const reasons = outcomes.flatMap((o) => (o.kind === 'skip' ? [o.reason] : []));
    expect(reasons.sort()).toEqual(['malformed', 'malformed', 'no-position', 'no-velocity', 'not-aircraft']);
  });

  it('treats on_ground as on the ground even with no position', () => {
    expect(by.aaa010).toEqual({ kind: 'on-ground', id: 'adsb:aaa010' });
  });

  it('uses the category for platform when it is present', () => {
    expect(report('aaa002').platform).toBe('helicopter');
    expect(report('aaa008').platform).toBe('light-aircraft');
    expect(report('aaa009').platform).toBe('airliner');
    expect(report('aaa004').platform).toBe('aircraft'); // UAV: not shown as a military drone
  });

  it('falls back to aircraft when the row has no category (extended=0)', () => {
    expect(report('aaa003').platform).toBe('aircraft');
  });

  it('omits missing or blank callsigns', () => {
    expect(report('aaa002')).not.toHaveProperty('callsign');
    expect(report('aaa003')).not.toHaveProperty('callsign');
  });

  it('times the report from position time, falling back to last contact', () => {
    expect(report('aaa002').observedAt).toBe(1792975610_000);
    expect(report('aaa006').observedAt).toBe(1792975600_000);
  });

  it('falls back to barometric altitude', () => {
    expect(report('aaa008').altitudeM).toBe(5000);
  });

  it('lower-cases the icao24 so ids are stable', () => {
    expect(report('aaa009').id).toBe('adsb:aaa009');
  });
});

describe('parseStatesResponse', () => {
  it('treats "states": null as an empty sky', () => {
    expect(parseStatesResponse({ time: 1, states: null })).toEqual([]);
  });

  it('rejects bodies of the wrong shape', () => {
    expect(parseStatesResponse('<html>')).toBeNull();
    expect(parseStatesResponse({ time: 1 })).toBeNull();
    expect(parseStatesResponse(null)).toBeNull();
  });
});
