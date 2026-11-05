import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { buildAircraftDb, classifyType, readAircraftDb, writeAircraftDb, type AircraftType } from './aircraftDb';

/** Real rows from the type table (Oct 2026), so the rules are tested on what they'll meet. */
const TYPES = {
  B748: ['BOEING 747-8', 'L4J', 'H'],
  A320: ['AIRBUS A-320', 'L2J', 'M'],
  C56X: ['CESSNA 560XL Citation XLS', 'L2J', 'M'],
  C172: ['CESSNA 172 Skyhawk', 'L1P', 'L'],
  EC35: ['AIRBUS HELICOPTERS EC-135/635', 'H2T', 'L'],
  H60: ['SIKORSKY UH-60 Black Hawk', 'H2T', 'M'],
  B609: ['LEONARDO AW-609', 'R2T', 'L'],
  P8: ['BOEING P-8 Poseidon', 'L2J', 'M'],
  Q9: ['GENERAL ATOMICS MQ-9 Reaper', 'L1T', 'L'],
  C17: ['BOEING C-17 Globemaster 3', 'L4J', 'H'],
  BALL: ['Balloon', 'B0-', '-'],
};
const type = (code: keyof typeof TYPES): AircraftType => {
  const [name, desc, wtc] = TYPES[code];
  return { code, name: name!, desc: desc!, wtc: wtc! };
};

describe('classifyType', () => {
  it('sorts civil aircraft into airliners, business jets and light aircraft', () => {
    expect(classifyType(type('B748'), false)).toBe('airliner');
    expect(classifyType(type('A320'), false)).toBe('airliner');
    expect(classifyType(type('C56X'), false)).toBe('business-jet'); // same class and weight as an A320
    expect(classifyType(type('C172'), false)).toBe('light-aircraft');
  });

  it('knows rotorcraft, tiltrotors included, and whether they are military', () => {
    expect(classifyType(type('EC35'), false)).toBe('helicopter');
    expect(classifyType(type('B609'), false)).toBe('helicopter');
    expect(classifyType(type('H60'), true)).toBe('military-helicopter');
  });

  it('picks out patrol aircraft and drones by designator, other military fixed wing by the flag', () => {
    expect(classifyType(type('P8'), true)).toBe('maritime-patrol');
    expect(classifyType(type('Q9'), true)).toBe('uav');
    expect(classifyType(type('C17'), true)).toBe('military-aircraft');
    // A civil type flown by a military is military: the flag is per airframe.
    expect(classifyType(type('C56X'), true)).toBe('military-aircraft');
  });

  it('leaves balloons and unknown types to the report', () => {
    expect(classifyType(type('BALL'), false)).toBeNull();
    expect(classifyType({ code: 'ZZZZ', name: '', desc: '', wtc: '-' }, false)).toBeNull();
  });
});

const CSV = [
  '000001;;;10;;;Miscode - VARIOUS;', // no type: skipped
  '3C4B2A;D-ABYJ;B748;00;BOEING 747-8;;;',
  'AE1234;12-3456;C17;10;BOEING C-17;;;',
  '4CA7B3;EI-ABC;C56X;0001;CESSNA 560XL;;Some Owner;',
  '400001;G-ABCD;ZZ9;00;Something new;;;', // a designator the table doesn't have
  '3C4B2A;D-ABYJ;A320;00;dup, later line wins;;;',
  '',
].join('\n');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('AircraftDb', () => {
  const db = buildAircraftDb(CSV, TYPES);

  it('counts the fleet of each type, for the rare-sightings watcher', () => {
    expect(db.fleetSize('C17')).toBe(1);
    // The duplicate line made 3C4B2A an A320, so no 747-8s remain.
    expect(db.fleetSize('A320')).toBe(1);
    expect(db.fleetSize('B748')).toBe(0);
    expect(db.fleetSize('XXXX')).toBeUndefined();
  });

  it('looks aircraft up by ICAO24 address, in either case', () => {
    expect(db.size).toBe(4);
    expect(db.lookup('ae1234')).toEqual({
      platform: 'military-aircraft',
      typeCode: 'C17',
      model: 'BOEING C-17 Globemaster 3',
      military: true,
      private: false,
    });
    expect(db.lookup('4CA7B3')?.platform).toBe('business-jet');
    expect(db.lookup('3c4b2a')?.typeCode).toBe('A320');
    expect(db.lookup('ffffff')).toBeUndefined();
    expect(db.lookup('nonsense')).toBeUndefined();
  });

  it('keeps a designator the table lacks, with no model and no platform', () => {
    expect(db.lookup('400001')).toEqual({ platform: null, typeCode: 'ZZ9', military: false, private: false });
  });

  it('marks aircraft whose owners asked for privacy (LADD) or that fly a PIA address', () => {
    expect(db.lookup('4ca7b3')?.private).toBe(true); // flags 0001: LADD
    expect(db.lookup('3c4b2a')?.private).toBe(false);
  });

  it('fills in ADS-B tracks only, and keeps the report platform when the type is unknown', () => {
    const base: Track = {
      id: 'adsb:ae1234', source: 'adsb', domain: 'air', platform: 'aircraft', affiliation: 'unknown',
      lat: 51, lon: -8, courseDeg: 0, speedMps: 200, observedAt: 1,
    };
    const mil = { ...base };
    db.enrich(mil);
    expect(mil).toMatchObject({ platform: 'military-aircraft', typeCode: 'C17', model: 'BOEING C-17 Globemaster 3' });

    const unknownType = { ...base, id: 'adsb:400001', platform: 'airliner' as const };
    db.enrich(unknownType);
    expect(unknownType).toMatchObject({ platform: 'airliner', typeCode: 'ZZ9' });

    const sim = { ...base, id: 'sim:ae1234', source: 'sim' as const };
    db.enrich(sim);
    expect(sim.typeCode).toBeUndefined();
  });

  it('saves and loads its index, and refuses a damaged one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-aircraftdb-'));
    tempDirs.push(dir);
    writeAircraftDb(dir, db, { source: 'test', fetchedAt: '2026-10-28T00:00:00Z' });
    const loaded = readAircraftDb(dir);
    expect(loaded?.meta).toEqual({ source: 'test', fetchedAt: '2026-10-28T00:00:00Z' });
    expect(loaded?.db.lookup('ae1234')).toEqual(db.lookup('ae1234'));
    expect(loaded?.db.size).toBe(4);

    const bin = path.join(dir, 'aircraft.bin');
    fs.writeFileSync(bin, fs.readFileSync(bin).subarray(0, 20));
    expect(readAircraftDb(dir)).toBeNull();
    expect(readAircraftDb(path.join(dir, 'missing'))).toBeNull();
  });
});
