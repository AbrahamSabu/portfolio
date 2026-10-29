/**
 * Download the tar1090 aircraft database and build Watchfloor's index of it:
 *
 *   npm run aircraft-db            (into .cache/aircraft-db/, git-ignored)
 *   npm run aircraft-db -- <dir>   (somewhere else; point AIRCRAFT_DB at it)
 *
 * The data states no licence, so it's fetched for local use and never
 * committed. Run it again whenever you want fresher types (the database is
 * updated often); the server picks the new index up when it restarts.
 *
 * It also fetches OpenFlights' airline list (ODbL), which names the airline
 * behind a callsign in the details panel.
 */
import path from 'node:path';
import zlib from 'node:zlib';
import { buildAircraftDb, writeAircraftDb } from '../feeds/adsb/aircraftDb';
import { parseOpenFlightsAirlines, writeAirlines } from '../feeds/adsb/airlines';

const AIRCRAFT_URL = 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/refs/heads/csv/aircraft.csv.gz';
const TYPES_URL = 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/db/icao_aircraft_types2.js';
const AIRLINES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';
const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';

/** Both files are gzip, whatever the extension says. */
async function download(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return (gzip ? zlib.gunzipSync(bytes) : bytes).toString('utf8');
}

async function main(): Promise<void> {
  const dir = path.resolve(process.argv[2] ?? '../.cache/aircraft-db');
  console.log(`Downloading the tar1090 aircraft database (about 8 MB) to ${dir}`);
  const started = Date.now();
  const [csv, types, airlinesDat] = await Promise.all([download(AIRCRAFT_URL), download(TYPES_URL), download(AIRLINES_URL)]);
  const db = buildAircraftDb(csv, JSON.parse(types));
  // A truncated or changed download shouldn't quietly replace a good index.
  if (db.size < 100_000) throw new Error(`only ${db.size} aircraft with a type; expected about 500,000. Index not written.`);
  writeAircraftDb(dir, db, { source: 'tar1090-db (Mictronics, wiedehopf)', fetchedAt: new Date().toISOString() });
  const airlines = parseOpenFlightsAirlines(airlinesDat);
  if (airlines.size < 1_000) throw new Error(`only ${airlines.size} airlines; expected about 5,000. Airline list not written.`);
  writeAirlines(dir, airlines);
  const named = db.types.filter((t) => t.name).length;
  console.log(
    `Indexed ${db.size.toLocaleString('en')} aircraft across ${db.types.length.toLocaleString('en')} types ` +
      `(${named.toLocaleString('en')} with a model name) and ${airlines.size.toLocaleString('en')} airlines in ${((Date.now() - started) / 1000).toFixed(1)} s. ` +
      'Restart the server to use it.',
  );
}

main().catch((err: unknown) => {
  console.error(`aircraft-db: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
