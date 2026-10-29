import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { airlineFor, parseOpenFlightsAirlines, readAirlines, writeAirlines } from './airlines';

// The OpenFlights format, with made-up rows for the awkward cases.
const DAT = [
  '1355,"British Airways",\\N,"BA","BAW","SPEEDBIRD","United Kingdom","Y"',
  '4296,"Ryanair",\\N,"FR","RYR","RYANAIR","Ireland","Y"',
  '9001,"Old Example Air",\\N,"","EXA","EXAMPLE","Nowhere","N"',
  '9002,"Example Air",\\N,"","EXA","EXAMPLE","Nowhere","Y"',
  '9003,"Comma, Quoted ""Air""",\\N,"","CQA","CQ","Nowhere","Y"',
  '9004,"No Designator",\\N,"ND","\\N","","Nowhere","Y"',
  '-1,"Unknown",\\N,"-","N/A","\\N","\\N","Y"',
  '',
].join('\n');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('parseOpenFlightsAirlines', () => {
  const airlines = parseOpenFlightsAirlines(DAT);

  it('names airlines by ICAO designator', () => {
    expect(airlines.get('BAW')).toBe('British Airways');
    expect(airlines.get('RYR')).toBe('Ryanair');
  });

  it('prefers the active airline when a designator is listed twice', () => {
    expect(airlines.get('EXA')).toBe('Example Air');
  });

  it('reads quoted commas and quotes, and skips rows without a designator', () => {
    expect(airlines.get('CQA')).toBe('Comma, Quoted "Air"');
    expect(airlines.size).toBe(4);
  });
});

describe('airlineFor', () => {
  const airlines = parseOpenFlightsAirlines(DAT);

  it('reads the designator from an airline callsign', () => {
    expect(airlineFor('BAW4E', airlines)).toBe('British Airways');
    expect(airlineFor('RYR12AB', airlines)).toBe('Ryanair');
  });

  it('ignores registrations, unknown designators and no callsign', () => {
    expect(airlineFor('GABCD', airlines)).toBeUndefined();
    expect(airlineFor('N123AB', airlines)).toBeUndefined();
    expect(airlineFor('ZZZ123', airlines)).toBeUndefined();
    expect(airlineFor(undefined, airlines)).toBeUndefined();
  });
});

describe('saved airlines', () => {
  it('round-trips, and reads as null when missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-airlines-'));
    tempDirs.push(dir);
    expect(readAirlines(dir)).toBeNull();
    writeAirlines(dir, parseOpenFlightsAirlines(DAT));
    expect(readAirlines(dir)?.get('BAW')).toBe('British Airways');
  });
});
