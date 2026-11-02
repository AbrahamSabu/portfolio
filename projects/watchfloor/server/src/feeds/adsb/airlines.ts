import fs from 'node:fs';
import path from 'node:path';

/**
 * Airline names by ICAO designator, so "BAW4E" reads "British Airways". From
 * OpenFlights' airline database (ODbL: use it freely, credit the source),
 * fetched by `npm run aircraft-db` alongside the aircraft index. It is a
 * snapshot that is rarely updated: new airlines are missing (the callsign
 * then shows on its own) and a few codes may have changed hands since.
 */
export type Airlines = ReadonlyMap<string, string>;

const FILE = 'airlines.json';

/** One line of OpenFlights CSV: fields are quoted or bare, `\N` is empty. */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  const re = /"((?:[^"]|"")*)"|([^,]*)/y;
  let i = 0;
  while (i <= line.length) {
    re.lastIndex = i;
    const m = re.exec(line);
    if (!m) break;
    const value = m[1] !== undefined ? m[1].replace(/""/g, '"') : (m[2] ?? '');
    fields.push(value === '\\N' ? '' : value.trim());
    i = re.lastIndex + 1; // past the comma
  }
  return fields;
}

/**
 * `airlines.dat`: id, name, alias, IATA, ICAO, callsign, country, active.
 * Some designators appear more than once (a defunct airline and its
 * successor): an active airline wins, then the first listed.
 */
export function parseOpenFlightsAirlines(text: string): Map<string, string> {
  const named = new Map<string, { name: string; active: boolean }>();
  for (const line of text.split('\n')) {
    const [, name, , , icao, , , active] = csvFields(line.trim());
    if (!name || !icao || !/^[A-Z]{3}$/.test(icao) || name === 'Unknown') continue;
    const isActive = active === 'Y';
    const known = named.get(icao);
    if (!known || (isActive && !known.active)) named.set(icao, { name, active: isActive });
  }
  return new Map([...named].map(([icao, { name }]) => [icao, name]));
}

/**
 * The airline flying a callsign, when it is an airline callsign: a three-letter
 * ICAO designator then a flight number ("BAW4E", "RYR12AB"). Registrations
 * used as callsigns ("GABCD", "N123AB") don't match.
 */
export function airlineFor(callsign: string | undefined, airlines: Airlines): string | undefined {
  const m = callsign ? /^([A-Z]{3})\d/.exec(callsign) : null;
  return m ? airlines.get(m[1]!) : undefined;
}

export function writeAirlines(dir: string, airlines: Airlines): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${FILE}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(airlines)));
  fs.renameSync(tmp, path.join(dir, FILE));
}

/** The saved list, or null when there is none (or it's unreadable). */
export function readAirlines(dir: string): Airlines | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
    if (typeof data !== 'object' || data === null) return null;
    const entries = Object.entries(data).filter(
      (e): e is [string, string] => /^[A-Z]{3}$/.test(e[0]) && typeof e[1] === 'string',
    );
    return new Map(entries);
  } catch {
    return null;
  }
}
