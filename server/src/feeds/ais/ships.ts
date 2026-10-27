import { makeTrackId, type Track } from '@watchfloor/shared';
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
