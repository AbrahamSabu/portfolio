import fs from 'node:fs';
import path from 'node:path';
import type { Platform, Track } from '@watchfloor/shared';

/**
 * What kind of aircraft each transponder belongs to, from a database the
 * operator downloads once (`npm run aircraft-db`), not from the reports.
 *
 * OpenSky's worldwide feed rarely says what an aircraft is: about 90% of the
 * world picture was plain "aircraft". The tar1090 database (the one adsb.lol
 * and adsb.fi themselves use, maintained by Mictronics and wiedehopf) maps
 * about 495,000 ICAO24 addresses to an ICAO type designator (B748) and a
 * military flag; its type table gives each designator a model name, an ICAO
 * class (L2J: landplane, 2 jets; H2T: helicopter, 2 turboshafts) and a wake
 * category. Measured against the live world picture, Oct 2026, it types
 * 99.2% of aircraft. It states no licence, so it is never committed: the
 * script fetches it into .cache/ for local use.
 */

export interface AircraftType {
  /** ICAO type designator, e.g. B748. */
  code: string;
  /** Model as the table names it, e.g. "BOEING 747-8". Empty when the table doesn't know the code. */
  name: string;
  /** ICAO class: kind (L, S, A, H, G, R, T, ...), engine count, engine type. */
  desc: string;
  /** Wake category: L light, M medium, H heavy, J super, '-' unknown. */
  wtc: string;
}

/** Drones and maritime patrol aircraft, by designator: the classes alone can't tell them apart. */
const UAV_CODES = new Set(['Q1', 'Q4', 'Q9', 'Q25', 'Q28', 'HRON', 'HRM9']);
const MARITIME_PATROL_CODES = new Set(['P8', 'P3', 'P1', 'IL38']);
/**
 * Business jet families, matched on the model name. A list, because nothing
 * in the classes separates a Gulfstream from an airliner of the same weight:
 * about 1,100 of the 12,000 aircraft seen worldwide were one of these.
 */
const BUSINESS_JET =
  /GULFSTREAM|CITATION|LEARJET|CHALLENGER|GLOBAL [0-9X]|GLOBAL EXPRESS|FALCON|PHENOM|PRAETOR|LEGACY|LINEAGE|HAWKER|HONDAJET|PC-24|PREMIER|BEECHJET|SOVEREIGN|LATITUDE|LONGITUDE|ECLIPSE|VISION/i;

/**
 * The platform for an aircraft type, or null to leave the report's own (the
 * type is unknown, or isn't something we draw: balloons, ground vehicles).
 * Pure, so every rule is a test.
 */
export function classifyType(type: AircraftType, military: boolean): Platform | null {
  const kind = type.desc[0];
  if (UAV_CODES.has(type.code) || kind === 'D') return 'uav';
  if (kind === 'H' || kind === 'R' || kind === 'T') return military ? 'military-helicopter' : 'helicopter';
  if (kind === 'G') return 'light-aircraft';
  if (kind !== 'L' && kind !== 'S' && kind !== 'A') return null;
  if (MARITIME_PATROL_CODES.has(type.code)) return 'maritime-patrol';
  if (military) return 'military-aircraft';
  if (BUSINESS_JET.test(type.name)) return 'business-jet';
  if (type.wtc === 'L') return 'light-aircraft';
  if (type.wtc === 'M' || type.wtc === 'H' || type.wtc === 'J') return 'airliner';
  return null;
}

/** One aircraft: its ICAO24 address as a number, its type's index, and the military flag. */
export interface AircraftRecord {
  icao: number;
  type: number;
  military: boolean;
}

export interface AircraftInfo {
  platform: Platform | null;
  typeCode: string;
  model?: string;
}

/**
 * The lookup. About 495,000 aircraft as three typed arrays sorted by
 * address (about 3.5 MB), searched by halving, rather than half a million
 * strings in a Map, which would cost tens of MB of heap.
 */
export class AircraftDb {
  private readonly platforms: Array<[civil: Platform | null, military: Platform | null]>;

  constructor(
    readonly types: readonly AircraftType[],
    /** Sorted ascending; the three arrays are parallel. Exposed read-only for writing the index. */
    readonly icao: Uint32Array,
    readonly typeIndex: Uint16Array,
    readonly flags: Uint8Array,
  ) {
    this.platforms = types.map((t) => [classifyType(t, false), classifyType(t, true)]);
  }

  get size(): number {
    return this.icao.length;
  }

  lookup(hex: string): AircraftInfo | undefined {
    if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
    const key = parseInt(hex, 16);
    let lo = 0;
    let hi = this.icao.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const v = this.icao[mid]!;
      if (v === key) return this.info(mid);
      if (v < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return undefined;
  }

  /**
   * Fill in an ADS-B track's type from the database. The database's type
   * wins over the transponder's emitter category, which is coarser (a
   * Gulfstream and an A320 are both "large").
   */
  enrich(track: Track): void {
    if (track.source !== 'adsb') return;
    const info = this.lookup(track.id.slice(track.id.indexOf(':') + 1));
    if (!info) return;
    if (info.platform) track.platform = info.platform;
    track.typeCode = info.typeCode;
    if (info.model) track.model = info.model;
  }

  private info(i: number): AircraftInfo {
    const t = this.typeIndex[i]!;
    const type = this.types[t]!;
    const military = (this.flags[i]! & FLAG_MILITARY) !== 0;
    const info: AircraftInfo = { platform: this.platforms[t]![military ? 1 : 0], typeCode: type.code };
    if (type.name) info.model = type.name;
    return info;
  }
}

const FLAG_MILITARY = 1;

/**
 * The tar1090 CSV: `hex;registration;type;flags;description;year;owner;`,
 * where flags is a string of 0/1 whose first digit is "military". Only hex,
 * type and that flag are kept: registration and owner are left out on
 * purpose (owners can ask for privacy through FAA LADD and PIA).
 */
export function parseTar1090Csv(text: string, typeIndexOf: (code: string) => number): AircraftRecord[] {
  const records: AircraftRecord[] = [];
  for (const line of text.split('\n')) {
    const [hex, , code, flags] = line.split(';');
    if (!hex || !code || !/^[0-9a-f]{6}$/i.test(hex) || !/^[A-Z0-9]{1,4}$/.test(code)) continue;
    records.push({ icao: parseInt(hex, 16), type: typeIndexOf(code), military: flags?.[0] === '1' });
  }
  records.sort((a, b) => a.icao - b.icao);
  // One entry per address (the search assumes it): a later duplicate line wins.
  return records.filter((r, i) => i === records.length - 1 || records[i + 1]!.icao !== r.icao);
}

/** The type table: `{ "B748": ["BOEING 747-8", "L4J", "H"], ... }`. */
export function parseTypeTable(json: unknown): Map<string, Omit<AircraftType, 'code'>> {
  const table = new Map<string, Omit<AircraftType, 'code'>>();
  if (typeof json !== 'object' || json === null) return table;
  for (const [code, v] of Object.entries(json as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const [name, desc, wtc] = v;
    if (typeof name === 'string' && typeof desc === 'string' && typeof wtc === 'string') {
      table.set(code, { name: name.trim().slice(0, 48), desc, wtc });
    }
  }
  return table;
}

/**
 * Build the lookup from the two downloads. Types the aircraft list uses but
 * the table lacks are kept by code alone, so the details panel still shows
 * the designator.
 */
export function buildAircraftDb(csv: string, typeTable: unknown): AircraftDb {
  const table = parseTypeTable(typeTable);
  const types: AircraftType[] = [];
  const indexOf = new Map<string, number>();
  const typeIndexOf = (code: string): number => {
    let i = indexOf.get(code);
    if (i === undefined) {
      i = types.length;
      indexOf.set(code, i);
      types.push({ code, ...(table.get(code) ?? { name: '', desc: '', wtc: '-' }) });
    }
    return i;
  };
  const records = parseTar1090Csv(csv, typeIndexOf);
  if (types.length > 0xffff) throw new Error(`aircraft db: ${types.length} types don't fit 16-bit indexes`);
  return fromRecords(types, records);
}

function fromRecords(types: AircraftType[], records: AircraftRecord[]): AircraftDb {
  const icao = new Uint32Array(records.length);
  const typeIndex = new Uint16Array(records.length);
  const flags = new Uint8Array(records.length);
  records.forEach((r, i) => {
    icao[i] = r.icao;
    typeIndex[i] = r.type;
    flags[i] = r.military ? FLAG_MILITARY : 0;
  });
  return new AircraftDb(types, icao, typeIndex, flags);
}

/**
 * On disk: `types.json` (the types plus where and when the data came from)
 * and `aircraft.bin` (a 16-byte header, then the three arrays back to back),
 * so loading takes milliseconds instead of parsing a 30 MB CSV at startup.
 */
const MAGIC = 0x43414657; // "WFAC", little-endian
const FORMAT_VERSION = 1;
const HEADER_BYTES = 16;

export interface AircraftDbMeta {
  source: string;
  fetchedAt: string;
}

export function writeAircraftDb(dir: string, db: AircraftDb, meta: AircraftDbMeta): void {
  fs.mkdirSync(dir, { recursive: true });
  const n = db.icao.length;
  const buf = Buffer.alloc(HEADER_BYTES + n * 7);
  buf.writeUInt32LE(MAGIC, 0);
  buf.writeUInt32LE(FORMAT_VERSION, 4);
  buf.writeUInt32LE(n, 8);
  // Typed arrays are in the machine's byte order: little-endian on x86 and ARM alike.
  Buffer.from(db.icao.buffer, db.icao.byteOffset, n * 4).copy(buf, HEADER_BYTES);
  Buffer.from(db.typeIndex.buffer, db.typeIndex.byteOffset, n * 2).copy(buf, HEADER_BYTES + n * 4);
  Buffer.from(db.flags.buffer, db.flags.byteOffset, n).copy(buf, HEADER_BYTES + n * 6);
  // Temp file, then rename: a half-written index never replaces a good one.
  const write = (name: string, data: string | Buffer) => {
    fs.writeFileSync(path.join(dir, `${name}.tmp`), data);
    fs.renameSync(path.join(dir, `${name}.tmp`), path.join(dir, name));
  };
  write('aircraft.bin', buf);
  write('types.json', JSON.stringify({ ...meta, types: db.types.map((t) => [t.code, t.name, t.desc, t.wtc]) }));
}

/** The saved lookup, or null if it's missing or can't be trusted (then aircraft keep their reported types). */
export function readAircraftDb(dir: string): { db: AircraftDb; meta: AircraftDbMeta } | null {
  let raw: Buffer;
  let typesFile: unknown;
  try {
    raw = fs.readFileSync(path.join(dir, 'aircraft.bin'));
    typesFile = JSON.parse(fs.readFileSync(path.join(dir, 'types.json'), 'utf8'));
  } catch {
    return null;
  }
  if (raw.length < HEADER_BYTES || raw.readUInt32LE(0) !== MAGIC || raw.readUInt32LE(4) !== FORMAT_VERSION) return null;
  const n = raw.readUInt32LE(8);
  if (raw.length !== HEADER_BYTES + n * 7) return null;
  const t = typesFile as { source?: unknown; fetchedAt?: unknown; types?: unknown };
  if (!Array.isArray(t.types)) return null;
  const types: AircraftType[] = t.types
    .filter((row): row is string[] => Array.isArray(row) && row.length === 4 && row.every((v) => typeof v === 'string'))
    .map(([code, name, desc, wtc]) => ({ code: code!, name: name!, desc: desc!, wtc: wtc! }));
  if (types.length !== t.types.length) return null;
  // Copy into fresh, aligned buffers: a Buffer's offset in its pool needn't suit a Uint32Array.
  const icao = new Uint32Array(n);
  const typeIndex = new Uint16Array(n);
  const flags = new Uint8Array(n);
  raw.copy(Buffer.from(icao.buffer), 0, HEADER_BYTES, HEADER_BYTES + n * 4);
  raw.copy(Buffer.from(typeIndex.buffer), 0, HEADER_BYTES + n * 4, HEADER_BYTES + n * 6);
  raw.copy(Buffer.from(flags.buffer), 0, HEADER_BYTES + n * 6, HEADER_BYTES + n * 7);
  // The search needs ascending addresses, and every type index must exist.
  for (let i = 0; i < n; i++) {
    if (typeIndex[i]! >= types.length || (i > 0 && icao[i]! <= icao[i - 1]!)) return null;
  }
  const meta = { source: String(t.source ?? ''), fetchedAt: String(t.fetchedAt ?? '') };
  return { db: new AircraftDb(types, icao, typeIndex, flags), meta };
}
