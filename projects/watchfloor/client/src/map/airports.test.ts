import { describe, expect, it } from 'vitest';
import { airportCode, describeAirport, parseAirports } from './airports';

describe('parseAirports', () => {
  it('reads rows and drops malformed ones', () => {
    const raw = [
      ['EICK', 'ORK', 'Cork Airport', 'Cork', 'IE', 51.8413, -8.4911, 0],
      ['EIKY', 'KIR', 'Kerry Airport', 'Farranfore', 'IE', 52.18, -9.52, 3],
      ['XXXX', '', '', 'Nowhere', 'IE', 52, -9, 1],
      ['YYYY', '', 'Far North', 'X', 'IE', 95, -9, 1],
      'not a row',
    ];
    expect(parseAirports(raw)).toEqual([
      { code: 'EICK', iata: 'ORK', name: 'Cork Airport', city: 'Cork', country: 'IE', lat: 51.8413, lon: -8.4911, size: 0 },
    ]);
    expect(parseAirports({})).toEqual([]);
  });
});

describe('describing an airport', () => {
  const cork = { code: 'EICK', iata: 'ORK', name: 'Cork Airport', city: 'Cork', country: 'IE', lat: 51.8, lon: -8.5, size: 0 as const };
  const names = (iso: string) => ({ IE: 'Ireland', GB: 'United Kingdom' })[iso];

  it('labels with the IATA code, else the ICAO code', () => {
    expect(airportCode(cork)).toBe('ORK');
    expect(airportCode({ code: 'EIIM', iata: '' })).toBe('EIIM');
  });

  it("names the country, and the city only when the name doesn't already", () => {
    expect(describeAirport(cork, names)).toEqual({ title: 'Cork Airport', kind: 'Ireland', facts: 'ORK · EICK' });
    expect(describeAirport({ ...cork, name: 'Kerry Airport', city: 'Farranfore', iata: '' }, names)).toEqual({
      title: 'Kerry Airport',
      kind: 'Farranfore, Ireland',
      facts: 'EICK',
    });
    expect(describeAirport({ ...cork, country: 'ZZ' }, names).kind).toBe('ZZ');
  });
});
