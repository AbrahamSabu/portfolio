import { describe, expect, it } from 'vitest';
import { buildAirports, parseCsv } from './airports';

const HEADER =
  '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"';
const row = (ident: string, type: string, name: string, lat: string, lon: string, city: string, scheduled: string, icao: string, iata: string, gps = '') =>
  `1,"${ident}","${type}","${name}",${lat},${lon},25,"EU","IE","IE-CO","${city}","${scheduled}","${icao}","${iata}","${gps}",,,,`;

describe('parseCsv', () => {
  it('reads quoted fields with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,,z')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['x', '', 'z'],
    ]);
  });
});

describe('buildAirports', () => {
  const csv = [
    HEADER,
    row('EICK', 'large_airport', 'Cork Airport', '51.841269', '-8.491111', 'Cork', 'yes', 'EICK', 'ORK'),
    row('EIKY', 'medium_airport', 'Kerry Airport', '52.180878', '-9.523783', 'Farranfore', 'yes', 'EIKY', 'KIR'),
    row('EIIM', 'small_airport', 'Inishmore Aerodrome', '53.1067', '-9.6536', 'Inis Mor', 'yes', '', 'IOR', 'EIIM'),
    row('EIBR', 'small_airport', 'Birr Airfield', '53.07', '-7.89', 'Birr', 'no', '', ''),
    row('EI01', 'heliport', 'A Heliport', '53', '-8', 'X', 'no', '', ''),
    row('EI02', 'closed', 'Old Field', '53', '-8', 'X', 'no', '', ''),
    row('XX01', 'medium_airport', 'Nowhere', '', '-8', 'X', 'no', '', ''),
  ].join('\n');
  const airports = buildAirports(csv);

  it('keeps large and medium airports, and small ones with scheduled flights', () => {
    expect(airports.map((a) => a[0])).toEqual(['EICK', 'EIKY', 'EIIM']);
    expect(airports.map((a) => a[7])).toEqual([0, 1, 2]);
  });

  it('writes compact rows: codes, name, city, country, rounded position', () => {
    expect(airports[0]).toEqual(['EICK', 'ORK', 'Cork Airport', 'Cork', 'IE', 51.8413, -8.4911, 0]);
    // No ICAO code: the GPS code stands in.
    expect(airports[2]![0]).toBe('EIIM');
  });

  it('refuses a file without the columns it needs', () => {
    expect(() => buildAirports('"id","name"\n1,"x"')).toThrow(/ident/);
  });
});
