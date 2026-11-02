/**
 * Airports for the map, from OurAirports (ourairports.com, public domain):
 * large and medium airports, plus small ones with scheduled flights. About
 * 6,000 of the 86,000 places in the list; the rest are strips, heliports
 * and seaplane bases that would bury the map.
 *
 * Written as one compact JSON array the browser fetches once:
 *   [code, iata, name, city, country, lat, lon, size]
 * where size is 0 (large), 1 (medium) or 2 (small with scheduled flights),
 * and code is the ICAO code where there is one.
 */

export type AirportSize = 0 | 1 | 2;
export type AirportRow = [code: string, iata: string, name: string, city: string, country: string, lat: number, lon: number, size: AirportSize];

/** Every CSV row as fields. Quoted fields may hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** OurAirports' airports.csv to rows for the map, largest first (so they draw on top). */
export function buildAirports(csv: string): AirportRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`airports.csv has no "${name}" column`);
    return i;
  };
  const c = {
    ident: col('ident'),
    type: col('type'),
    name: col('name'),
    lat: col('latitude_deg'),
    lon: col('longitude_deg'),
    country: col('iso_country'),
    city: col('municipality'),
    scheduled: col('scheduled_service'),
    icao: col('icao_code'),
    gps: col('gps_code'),
    iata: col('iata_code'),
  };
  const out: AirportRow[] = [];
  for (const r of rows) {
    const type = r[c.type];
    const size: AirportSize | undefined =
      type === 'large_airport' ? 0 : type === 'medium_airport' ? 1 : type === 'small_airport' && r[c.scheduled] === 'yes' ? 2 : undefined;
    if (size === undefined) continue;
    if (!r[c.lat] || !r[c.lon]) continue;
    const lat = Number(r[c.lat]);
    const lon = Number(r[c.lon]);
    const name = (r[c.name] ?? '').trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const code = (r[c.icao] || r[c.gps] || r[c.ident] || '').trim();
    out.push([code, (r[c.iata] ?? '').trim(), name, (r[c.city] ?? '').trim(), (r[c.country] ?? '').trim(), round4(lat), round4(lon), size]);
  }
  return out.sort((a, b) => a[7] - b[7] || a[0].localeCompare(b[0]));
}
