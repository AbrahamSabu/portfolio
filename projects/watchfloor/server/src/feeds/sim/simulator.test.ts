import { describe, expect, it } from 'vitest';
import { distanceM, sanitizeTrack, type Track } from '@watchfloor/shared';
import { englishChannel } from '../../scenarios/englishChannel';
import { world } from '../../scenarios/world';
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

describe('Simulator', () => {
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

  it('keeps ships inside the scenario area', () => {
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
      const max = r.domain === 'air' ? 260 : 13;
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
    }
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
