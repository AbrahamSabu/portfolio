/**
 * Download OurAirports' airport list and write the map's airports file:
 *
 *   npm run airports
 *
 * The data is public domain, so the result is committed
 * (client/src/data/airports.json, ~400 KB, ~120 KB gzipped). Run it again
 * now and then for new or closed airports; the client picks it up on the
 * next build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildAirports } from './airports';

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const USER_AGENT = 'Watchfloor/1.0 (open-source, non-commercial portfolio project)';
const OUT = path.resolve('../client/src/data/airports.json');

async function main(): Promise<void> {
  console.log('Downloading OurAirports airports.csv (about 12 MB)');
  const res = await fetch(AIRPORTS_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${AIRPORTS_URL}: HTTP ${res.status}`);
  const airports = buildAirports(await res.text());
  // A truncated or changed download shouldn't quietly replace a good file.
  if (airports.length < 4_000) throw new Error(`only ${airports.length} airports; expected about 6,000. File not written.`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // One airport per line: small diffs when the list changes.
  fs.writeFileSync(OUT, `[\n${airports.map((a) => JSON.stringify(a)).join(',\n')}\n]\n`);
  const sizes = [0, 1, 2].map((s) => airports.filter((a) => a[7] === s).length);
  console.log(`Wrote ${airports.length} airports (${sizes[0]} large, ${sizes[1]} medium, ${sizes[2]} small with scheduled flights) to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
