import { inBBox, makeTrackId, type BBox, type Domain, type Platform, type Track } from '@watchfloor/shared';
import type { Scenario } from '../../scenarios';
import type { Feed, TrackSink } from '../feed';
import { createLogger } from '../../log';
import { ARCHETYPES, isArchetype, spawn, type Archetype } from './archetypes';
import type { SimEntity } from './entity';
import { advance } from './motion';
import { Rng } from './rng';

const log = createLogger('sim');

export interface SimulatorOptions {
  scenario: Scenario;
  seed: number;
  /** Physics step. Smaller = smoother motion, more CPU. */
  stepMs?: number;
  /** Simulate transponders going quiet now and then, to exercise stale-track handling. */
  dropouts?: boolean;
  /** When the first simulated emergency starts (the demo: soon after the page opens); a few minutes in by default. */
  emergencyAt?: number;
}

/**
 * Simulated emergencies, so the squawk alerts have something to show: every
 * so often an airliner or business jet aloft squawks 7700, or now and then
 * 7600 (radio failure), for a while, then goes back to its own code. Never
 * 7500: a simulated hijack would be in poor taste. Drawn from a random
 * stream of their own, so the rest of the simulation is exactly as before.
 */
const EMERGENCY_FIRST_MS: [number, number] = [2 * 60_000, 8 * 60_000];
const EMERGENCY_GAP_MS: [number, number] = [15 * 60_000, 45 * 60_000];
const EMERGENCY_LASTS_MS: [number, number] = [10 * 60_000, 20 * 60_000];
const EMERGENCY_MIN_ALTITUDE_M = 3000;
const EMERGENCY_PLATFORMS: ReadonlySet<Platform> = new Set(['airliner', 'business-jet']);

/** An aircraft's own transponder code, from its id: four octal digits, never an emergency code. */
export function ownSquawk(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const code = ((h >>> 0) % 4096).toString(8).padStart(4, '0');
  return code === '7500' || code === '7600' || code === '7700' ? '7000' : code;
}

/** Per-report chance of going silent, and for how long. Some silences outlast the drop window. */
const DROPOUT: Record<Domain, { chance: number; silentMs: [number, number] }> = {
  air: { chance: 0.0015, silentMs: [40_000, 180_000] },
  sea: { chance: 0.003, silentMs: [120_000, 720_000] },
};

/** Entities this far outside the scenario bounds are retired, as a safety net. */
const RETIRE_MARGIN_DEG = 1;

/**
 * Generates believable air and sea traffic for a scenario.
 *
 * It behaves exactly like a real feed: entities report at irregular intervals,
 * sometimes go quiet, and come and go at the edges. That way the rest of the
 * system is built and tested against realistic data before any live feed is
 * connected.
 */
export class Simulator implements Feed {
  readonly name = 'simulator';
  private readonly rng: Rng;
  private readonly stepMs: number;
  private readonly dropouts: boolean;
  private readonly retireBox: BBox;
  private entities: SimEntity[] = [];
  private sink: TrackSink | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastStepAt = 0;
  private seq = 0;
  /** Callsigns in use, kept as entities come and go: a world has thousands, too many to gather per spawn. */
  private callsigns = new Set<string>();
  /** Aircraft squawking a simulated emergency: entity id → the code and until when. */
  private readonly emergencies = new Map<string, { code: string; until: number }>();
  private nextEmergencyAt: number | undefined;
  private readonly squawkRng: Rng;

  constructor(private readonly opts: SimulatorOptions) {
    this.rng = new Rng(opts.seed);
    this.squawkRng = new Rng((opts.seed ^ 0x5a5a5a5a) >>> 0);
    this.nextEmergencyAt = opts.emergencyAt;
    this.stepMs = opts.stepMs ?? 250;
    this.dropouts = opts.dropouts ?? true;
    const b = opts.scenario.bounds;
    this.retireBox = {
      south: b.south - RETIRE_MARGIN_DEG,
      west: b.west - RETIRE_MARGIN_DEG,
      north: b.north + RETIRE_MARGIN_DEG,
      east: b.east + RETIRE_MARGIN_DEG,
    };
  }

  get entityCount(): number {
    return this.entities.length;
  }

  /** Read-only view for tests and debugging. */
  get snapshot(): readonly SimEntity[] {
    return this.entities;
  }

  start(sink: TrackSink): void {
    this.attach(sink, Date.now());
    this.timer = setInterval(() => this.step(Date.now()), this.stepMs);
    log.info('started', { scenario: this.opts.scenario.id, entities: this.entities.length, seed: this.opts.seed });
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Populate the scenario and connect the sink, without starting the clock. Tests drive step() directly. */
  attach(sink: TrackSink, now: number): void {
    this.sink = sink;
    this.lastStepAt = now;
    this.entities = [];
    this.callsigns = new Set();
    for (const [name, count] of Object.entries(this.opts.scenario.population)) {
      if (!isArchetype(name)) {
        log.warn('unknown archetype in scenario population', { name, known: ARCHETYPES });
        continue;
      }
      for (let i = 0; i < (count ?? 0); i++) {
        const entity = this.create(name, now, true);
        if (entity) this.entities.push(entity);
      }
    }
  }

  /**
   * Move everything on to `now`. The step is clamped (to a second, unless
   * asked otherwise) so a stalled event loop doesn't teleport everything; a
   * caller running through the past on purpose can take longer strides,
   * and ask for fewer reports (no closer than `minReportGapMs` per entity).
   */
  step(now: number, maxStepMs = 1000, minReportGapMs = 0): void {
    const dt = Math.min(Math.max(now - this.lastStepAt, 0), maxStepMs);
    this.lastStepAt = now;

    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i]!;
      advance(e, dt, now, this.rng);

      if (!e.done && !inBBox(e.pos, this.retireBox)) e.done = true;

      if (e.done) {
        this.sink?.remove(makeTrackId('sim', e.id));
        this.emergencies.delete(e.id);
        // Made before the departing name is freed, so it isn't reused at once.
        const replacement = this.create(e.archetype as Archetype, now, false);
        if (e.callsign) this.callsigns.delete(e.callsign);
        if (replacement) this.entities[i] = replacement;
        else this.entities.splice(i--, 1);
        continue;
      }

      this.maybeReport(e, now, minReportGapMs);
    }
    this.maybeStartEmergency(now);
  }

  private maybeStartEmergency(now: number): void {
    if (this.nextEmergencyAt === undefined) {
      this.nextEmergencyAt = now + this.squawkRng.range(...EMERGENCY_FIRST_MS);
      return;
    }
    if (now < this.nextEmergencyAt) return;
    this.nextEmergencyAt = now + this.squawkRng.range(...EMERGENCY_GAP_MS);
    const candidates = this.entities.filter(
      (e) => !e.done && EMERGENCY_PLATFORMS.has(e.platform) && (e.altitudeM ?? 0) > EMERGENCY_MIN_ALTITUDE_M && !this.emergencies.has(e.id),
    );
    if (candidates.length === 0) return;
    const chosen = candidates[Math.floor(this.squawkRng.next() * candidates.length)]!;
    const code = this.squawkRng.chance(0.2) ? '7600' : '7700';
    this.emergencies.set(chosen.id, { code, until: now + this.squawkRng.range(...EMERGENCY_LASTS_MS) });
  }

  /** The code an aircraft's transponder shows: its own, unless it's in a simulated emergency. */
  private squawkOf(e: SimEntity, now: number): string {
    const emergency = this.emergencies.get(e.id);
    if (emergency) {
      if (now < emergency.until) return emergency.code;
      this.emergencies.delete(e.id);
    }
    return ownSquawk(e.id);
  }

  private create(archetype: Archetype, now: number, initial: boolean): SimEntity | null {
    const prefix = archetype.slice(0, 3);
    const id = `${prefix}-${(++this.seq).toString().padStart(4, '0')}`;
    const entity = spawn(archetype, { rng: this.rng, scenario: this.opts.scenario, now, id, initial, takenCallsigns: this.callsigns });
    if (entity?.callsign) this.callsigns.add(entity.callsign);
    return entity;
  }

  private maybeReport(e: SimEntity, now: number, minGapMs: number): void {
    if (now < e.nextReportAt || now < e.silentUntil) return;
    e.nextReportAt = now + Math.max(this.rng.range(...e.reportIntervalMs), minGapMs);

    if (this.dropouts) {
      const d = DROPOUT[e.domain];
      if (this.rng.chance(d.chance)) {
        e.silentUntil = now + this.rng.range(...d.silentMs);
        return;
      }
    }
    this.sink?.upsert(this.toTrack(e, now));
  }

  private toTrack(e: SimEntity, now: number): Track {
    const track: Track = {
      id: makeTrackId('sim', e.id),
      source: 'sim',
      domain: e.domain,
      platform: e.platform,
      affiliation: e.affiliation,
      lat: e.pos.lat,
      lon: e.pos.lon,
      courseDeg: e.courseDeg,
      speedMps: e.speedMps,
      observedAt: now,
    };
    if (e.callsign) track.callsign = e.callsign;
    if (e.typeCode) track.typeCode = e.typeCode;
    if (e.altitudeM !== undefined) track.altitudeM = Math.round(e.altitudeM);
    if (e.domain === 'air') track.squawk = this.squawkOf(e, now);
    return track;
  }
}
