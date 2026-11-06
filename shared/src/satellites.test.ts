import { describe, expect, it } from 'vitest';
import {
  elementsFromOmm,
  encodeSatelliteCatalog,
  fromTuple,
  parseOmmEpoch,
  parseSatelliteCatalog,
  toTuple,
  type SatelliteElements,
} from './satellites';

/** The ISS as CelesTrak published it on 2026-11-06. */
const ISS_OMM = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-11-05T20:28:36.809184',
  MEAN_MOTION: 15.4919453,
  ECCENTRICITY: 0.00071954,
  INCLINATION: 51.6327,
  RA_OF_ASC_NODE: 319.056,
  ARG_OF_PERICENTER: 352.5747,
  MEAN_ANOMALY: 7.5134,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59371,
  BSTAR: 0.0001274916,
  MEAN_MOTION_DOT: 0.00006629,
  MEAN_MOTION_DDOT: 0,
};

describe('parseOmmEpoch', () => {
  it('reads UTC without a zone, keeping the milliseconds of a microsecond stamp', () => {
    expect(parseOmmEpoch('2026-11-05T20:28:36.809184')).toBe(Date.UTC(2026, 10, 5, 20, 28, 36, 809));
    expect(parseOmmEpoch('2026-11-05T20:28:36Z')).toBe(Date.UTC(2026, 10, 5, 20, 28, 36));
  });

  it('refuses anything else', () => {
    expect(parseOmmEpoch('05/11/2026')).toBeNull();
    expect(parseOmmEpoch(1730000000)).toBeNull();
    expect(parseOmmEpoch('2026-11-05 20:28:36')).toBeNull();
  });
});

describe('elementsFromOmm', () => {
  it('keeps what SGP4 needs', () => {
    expect(elementsFromOmm(ISS_OMM)).toEqual({
      id: 25544,
      name: 'ISS (ZARYA)',
      intl: '1998-067A',
      epoch: parseOmmEpoch('2026-11-05T20:28:36.809184'),
      meanMotion: 15.4919453,
      eccentricity: 0.00071954,
      inclination: 51.6327,
      raan: 319.056,
      argPerigee: 352.5747,
      meanAnomaly: 7.5134,
      bstar: 0.0001274916,
      meanMotionDot: 0.00006629,
      meanMotionDdot: 0,
    });
  });

  it('accepts six-digit catalogue numbers, which TLEs cannot carry', () => {
    expect(elementsFromOmm({ ...ISS_OMM, NORAD_CAT_ID: 100057, OBJECT_NAME: 'SOYUZ-MS 29' })?.id).toBe(100057);
  });

  it('drops records with impossible or missing elements', () => {
    expect(elementsFromOmm({ ...ISS_OMM, ECCENTRICITY: 1.2 })).toBeNull();
    expect(elementsFromOmm({ ...ISS_OMM, INCLINATION: 200 })).toBeNull();
    expect(elementsFromOmm({ ...ISS_OMM, MEAN_MOTION: 0 })).toBeNull();
    expect(elementsFromOmm({ ...ISS_OMM, NORAD_CAT_ID: 'ISS' })).toBeNull();
    expect(elementsFromOmm({ ...ISS_OMM, OBJECT_NAME: '' })).toBeNull();
    expect(elementsFromOmm({ ...ISS_OMM, EPOCH: undefined })).toBeNull();
    expect(elementsFromOmm(null)).toBeNull();
  });

  it('tidies names', () => {
    expect(elementsFromOmm({ ...ISS_OMM, OBJECT_NAME: '  ISS\u0007  (ZARYA) ' })?.name).toBe('ISS (ZARYA)');
  });
});

describe('the wire format', () => {
  const iss = elementsFromOmm(ISS_OMM)!;

  it('round-trips a satellite through its tuple', () => {
    expect(fromTuple(JSON.parse(JSON.stringify(toTuple(iss))))).toEqual(iss);
  });

  it('drops a bad tuple', () => {
    const bad = toTuple(iss);
    bad[5] = -0.1; // eccentricity
    expect(fromTuple(bad)).toBeNull();
    expect(fromTuple(toTuple(iss).slice(0, 12))).toBeNull();
  });

  it('round-trips a catalogue and drops a repeated group', () => {
    const groups = [
      { group: 'stations' as const, status: 'ok' as const, fetchedAt: 1_762_400_000_000, satellites: [iss] },
      { group: 'weather' as const, status: 'pending' as const, fetchedAt: null, satellites: [] as SatelliteElements[] },
    ];
    const wire = JSON.parse(JSON.stringify(encodeSatelliteCatalog({ groups })));
    expect(parseSatelliteCatalog(wire)).toEqual({ groups });
    wire.groups.push(wire.groups[0]);
    expect(parseSatelliteCatalog(wire)?.groups).toHaveLength(2);
  });

  it('refuses another version or an unknown group', () => {
    expect(parseSatelliteCatalog({ v: 2, groups: [] })).toBeNull();
    expect(parseSatelliteCatalog({ v: 1, groups: [{ group: 'active', status: 'ok', fetchedAt: 1, sats: [] }] })).toEqual({ groups: [] });
  });
});
