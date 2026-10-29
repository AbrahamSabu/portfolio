import { makeTrackId, TRACK_VALUES, type Platform, type ShipDetails, type Track } from '@watchfloor/shared';
import type { AisOutcome, ShipIdentity } from './mapAis';

type Position = Extract<AisOutcome, { kind: 'position' }>;

/**
 * What we know about each ship's identity. AIS splits a ship across message
 * types: positions every few seconds, name and type in static messages every
 * six minutes. This remembers the static half so every position report can
 * carry it.
 *
 * Bounded, least recently heard first out: a world subscription hears tens of
 * thousands of ships a day, and an unbounded map would grow for as long as
 * the server runs.
 */
export class ShipRegistry {
  private readonly ships = new Map<string, ShipIdentity>();

  constructor(private readonly maxShips = 50_000) {}

  get size(): number {
    return this.ships.size;
  }

  /** Merge what a message says; fields it doesn't carry keep their old values. */
  learn(mmsi: string, identity: ShipIdentity): void {
    const known = this.ships.get(mmsi);
    const merged = { ...known, ...identity };
    // Re-inserting moves it to the end of the Map's order, which is our recency order.
    this.ships.delete(mmsi);
    this.ships.set(mmsi, merged);
    if (this.ships.size > this.maxShips) {
      const oldest = this.ships.keys().next().value;
      if (oldest !== undefined) this.ships.delete(oldest);
    }
  }

  /** A ship's voyage and hull details for the details panel, if it has sent any. */
  details(mmsi: string): ShipDetails | undefined {
    const known = this.ships.get(mmsi);
    if (!known) return undefined;
    const { name: _name, platform: _platform, ...details } = known;
    return Object.keys(details).length > 0 ? details : undefined;
  }

  /** What we know about these ships, to save with the picture. */
  toRecord(mmsis: Iterable<string>): Record<string, ShipIdentity> {
    const saved: Record<string, ShipIdentity> = {};
    for (const mmsi of mmsis) {
      const known = this.ships.get(mmsi);
      // Most entries are empty: a ship is remembered from its first position, static data or not.
      if (known && Object.keys(known).length > 0) saved[mmsi] = known;
    }
    return saved;
  }

  /**
   * Bring back what was saved before a restart. Static data comes only every
   * six minutes, so without this every ship would lose its voyage details
   * (and unnamed ones their names) until it next sends them. Anything heard
   * since starting wins. Untrusted: it's a file on disk.
   */
  load(saved: unknown): number {
    if (typeof saved !== 'object' || saved === null) return 0;
    let count = 0;
    for (const [mmsi, value] of Object.entries(saved)) {
      const identity = parseSavedShip(value);
      if (!/^\d{9}$/.test(mmsi) || !identity) continue;
      if (this.ships.size >= this.maxShips) break;
      this.ships.set(mmsi, { ...identity, ...this.ships.get(mmsi) });
      count++;
    }
    return count;
  }

  /** A position report as a Track, with the best identity we have. */
  track(p: Position): Track {
    this.learn(p.mmsi, p.identity ?? {});
    const known = this.ships.get(p.mmsi) ?? {};
    const track: Track = {
      id: makeTrackId('ais', p.mmsi),
      source: 'ais',
      domain: 'sea',
      platform: known.platform ?? 'vessel',
      // What a ship broadcasts about itself is a claim, not an identification.
      affiliation: 'unknown',
      lat: p.lat,
      lon: p.lon,
      courseDeg: p.courseDeg,
      speedMps: p.speedMps,
      observedAt: p.observedAt,
      provider: 'aisstream',
    };
    const name = known.name ?? p.metaName;
    if (name) track.callsign = name;
    return track;
  }
}

const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;
const number = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

/** A saved registry entry, keeping only well-formed fields; null if none are. */
export function parseSavedShip(v: unknown): ShipIdentity | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const fields: ShipIdentity = {
    name: text(o.name, 64),
    platform: TRACK_VALUES.platform.includes(o.platform as Platform) ? (o.platform as Platform) : undefined,
    aisType: number(o.aisType, 20, 99),
    imo: number(o.imo, 1_000_000, 9_999_999),
    callSign: text(o.callSign, 16),
    destination: text(o.destination, 64),
    eta: typeof o.eta === 'string' && /^\d\d-\d\dT\d\d:\d\dZ$/.test(o.eta) ? o.eta : undefined,
    lengthM: number(o.lengthM, 1, 1022),
    beamM: number(o.beamM, 1, 126),
    draughtM: number(o.draughtM, 0.1, 25.5),
  };
  const kept = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as ShipIdentity;
  return Object.keys(kept).length > 0 ? kept : null;
}
