import { describe, expect, it } from 'vitest';
import { distanceM, sanitizeTrack, type Track } from '@watchfloor/shared';
import { englishChannel } from '../../scenarios/englishChannel';
import { world } from '../../scenarios/world';
import { RARE_TYPES } from '../../findings/rare';
import { Simulator } from './simulator';

const START = 1_700_000_000_000;
const STEP = 250;

function run(seed: number, minutes: number, dropouts = true) {
  const sim = new Simulator({ scenario: englishChannel, seed, dropouts });
  const reports: Track[] = [];
  const removals: string[] = [];
  sim.attach({ upsert: (r) => reports.push(r as Track), remove: (id) => removals.push(id) }, START);
  for (let t = START; t <= START + minutes * 60_000; t += STEP) sim.step(t);
  return { sim, reports, removals };
}

const expectedPopulation = Object.values(englishChannel.population).reduce<number>((a, b) => a + (b ?? 0), 0);

// Each test simulates up to an hour of the Channel at four steps a second,
// which a busy machine can take past the 5 s default to do.
describe('Simulator', { timeout: 20_000 }, () => {
  it('keeps the scenario population constant as traffic comes and goes', () => {
    const { sim, removals } = run(1, 30);
    expect(sim.entityCount).toBe(expectedPopulation);
    // In 30 minutes some airliners will have crossed the area and been replaced.
    expect(removals.length).toBeGreaterThan(0);
  });

  it('only emits tracks that pass validation', () => {
    const { reports } = run(2, 10);
    expect(reports.length).toBeGreaterThan(1000);
    for (const r of reports) expect(sanitizeTrack(r)).not.toBeNull();
  });

  it('keeps ships inside the scenario area', { timeout: 20_000 }, () => {
    const { reports } = run(3, 60);
    const b = englishChannel.bounds;
    for (const r of reports.filter((t) => t.domain === 'sea')) {
      expect(r.lat).toBeGreaterThan(b.south - 0.5);
      expect(r.lat).toBeLessThan(b.north + 0.5);
      expect(r.lon).toBeGreaterThan(b.west - 0.5);
      expect(r.lon).toBeLessThan(b.east + 0.5);
    }
  });

  it('produces believable speeds', () => {
    const { reports } = run(4, 10);
    for (const r of reports) {
      // Over the ground: an airliner in a jet-stream tailwind makes about 600 kt; a turboprop never 400.
      const max = r.domain === 'sea' ? 13 : r.typeCode === 'AT76' || r.typeCode === 'DH8D' ? 205 : 310;
      expect(r.speedMps).toBeLessThanOrEqual(max);
    }
  });

  it('never shows two live tracks with the same callsign', () => {
    const sim = new Simulator({ scenario: englishChannel, seed: 7, dropouts: false });
    const live = new Map<string, string | undefined>();
    sim.attach(
      { upsert: (r) => live.set((r as Track).id, (r as Track).callsign), remove: (id) => live.delete(id) },
      START,
    );
    for (let t = START; t <= START + 60 * 60_000; t += STEP) {
      sim.step(t);
      if ((t - START) % 60_000 !== 0) continue;
      const callsigns = [...live.values()].filter((c) => c !== undefined);
      expect(new Set(callsigns).size).toBe(callsigns.length);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = run(42, 5).reports.slice(0, 200);
    const b = run(42, 5).reports.slice(0, 200);
    expect(a).toEqual(b);
  });

  it('reports aircraft more often than ships', () => {
    const { reports } = run(5, 10, false);
    const perTrack = (domain: 'air' | 'sea') => {
      const subset = reports.filter((r) => r.domain === domain);
      return subset.length / new Set(subset.map((r) => r.id)).size;
    };
    expect(perTrack('air')).toBeGreaterThan(perTrack('sea') * 2);
  });
});

describe('Simulator, the world', () => {
  it('flies airliners between two different hubs, never too short or beyond any airliner range', () => {
    const sim = new Simulator({ scenario: world, seed: 3 });
    sim.attach({ upsert: () => {}, remove: () => {} }, START);
    const hubs = new Set(world.airports!.map((a) => `${a.lat},${a.lon}`));
    const flights = sim.snapshot.filter((e) => e.archetype === 'airliner');
    expect(flights.length).toBe(world.population.airliner);
    for (const e of flights) {
      if (e.behaviour.kind !== 'route') throw new Error('an airliner without a route');
      const [from, to] = e.behaviour.points;
      expect(hubs.has(`${from!.lat},${from!.lon}`) && hubs.has(`${to!.lat},${to!.lon}`)).toBe(true);
      const d = distanceM(from!, to!);
      expect(d).toBeGreaterThanOrEqual(300_000);
      expect(d).toBeLessThanOrEqual(15_000_000);
      // A type fit for the distance, never a rare one: those are simulated on purpose, elsewhere.
      expect(e.typeCode).toMatch(/^[A-Z0-9]{3,4}$/);
      expect(RARE_TYPES[e.typeCode!]).toBeUndefined();
      if (d > 8_000_000) expect(['B77W', 'B789', 'A359', 'B788', 'A333', 'B78X', 'A388', 'A35K', 'B772', 'A332', 'B763', 'B744', 'B748', 'A346']).toContain(e.typeCode);
    }
  });

  it('flies the rare types with their ICAO codes, between their own sites or round their orbits', () => {
    const sim = new Simulator({ scenario: world, seed: 5 });
    const reports: Track[] = [];
    sim.attach({ upsert: (r) => reports.push(r as Track), remove: () => {} }, START);
    sim.step(START + 1000);
    const rare = sim.snapshot.filter((e) => e.typeCode && RARE_TYPES[e.typeCode]);
    expect(new Set(rare.map((e) => e.typeCode))).toEqual(new Set(['A337', 'A3ST', 'BLCF', 'A124', 'C5M', 'B52', 'E3TF', 'Q4']));
    for (const e of rare) {
      const mission = world.missions![e.archetype]!;
      if (e.behaviour.kind === 'orbit') expect(mission.orbits).toBeDefined();
      else if (e.behaviour.kind === 'route') {
        const sites = new Set(mission.sites!.map((p) => `${p.lat},${p.lon}`));
        for (const p of e.behaviour.points) expect(sites.has(`${p.lat},${p.lon}`)).toBe(true);
      } else throw new Error(`${e.archetype} has no mission`);
    }
    // The code reaches the wire, where the rare watcher reads it.
    expect(reports.some((r) => r.typeCode === 'A337')).toBe(true);
  });

  it('runs through the past in long strides, flights still arriving and being replaced', () => {
    const sim = new Simulator({ scenario: world, seed: 3 });
    let removals = 0;
    sim.attach({ upsert: () => {}, remove: () => removals++ }, START);
    for (let t = START; t <= START + 20 * 60_000; t += 15_000) sim.step(t, 15_000, 60_000);
    // Flights land and are replaced as they would at one-second steps: some, not none and not a flood.
    expect(removals).toBeGreaterThan(20);
    expect(removals).toBeLessThan(world.population.airliner! / 2);
    expect(sim.entityCount).toBeGreaterThan(4000);
  });
});
