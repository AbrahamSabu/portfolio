import { metresToFeet, mpsToKnots, type Finding, type Track } from '@watchfloor/shared';
import { createLogger } from '../log';
import { circling } from './circling';
import { convergingPairs } from './converging';
import { rareSightings } from './rare';

const log = createLogger('findings');

/**
 * Narrow view of the track store, so tests feed synthetic pictures without
 * standing one up. `path` is PathHistory.flat: raw [lon, lat, t, ...].
 */
export interface FindingsWorld {
  tracks: () => readonly Track[];
  path: (id: string) => readonly number[] | undefined;
}

export interface FindingsServiceOptions {
  world: FindingsWorld;
  intervalMs?: number;
  now?: () => number;
  /** The whole list, whenever it changes: the hub sends it to every browser. */
  onChange?: (items: Finding[]) => void;
  /**
   * A finding appeared or went away, for the event log. `resolved` is set on
   * the one ending that means something happened (a silent ship transmitting
   * again), as opposed to a condition lapsing or a ghost fading.
   */
  onEvent?: (kind: 'finding-started' | 'finding-ended', finding: Finding, time: number, resolved?: boolean) => void;
  /** How many of an aircraft type the database knows, for "1 of 5 in the aircraft database". */
  fleetOf?: (typeCode: string) => number | undefined;
  /**
   * Whose owner asked not to be tracked publicly (FAA LADD, or a privacy
   * address). The map still draws them, as every flight tracker does, but a
   * rare sighting puts a spotlight on one (a card, a ping, the tour, the
   * log), which is the opposite of what was asked: those are skipped.
   */
  isPrivate?: (track: Track) => boolean;
}

/** How often the watchers sweep the picture. */
const SWEEP_MS = 20_000;

// Circling: a sliding window dips under two turns while the orbit continues,
// so a finding holds on this long between positives before it ends.
const CIRCLING_HOLD_MS = 4 * 60_000;
/** Slower than this an aircraft is on the ground or the data is noise. */
const CIRCLING_MIN_SPEED_MPS = 25;
/** A stale aircraft may just be out of coverage; only live ones are measured. */
const CIRCLING_MAX_AGE_MS = 2 * 60_000;

// Gone dark: a ship under way whose AIS reports stopped arriving. Under way,
// transponders report every 2-30 seconds, so minutes of silence is a real gap
// (lost coverage, a switched-off set, a failure: the finding never says which).
const DARK_AFTER_MS = 8 * 60_000;
/** About 5 knots: making way, not drifting at anchor. */
const DARK_MIN_SPEED_MPS = 2.6;
/** It must have been watched a while first, or every ship at the edge of coverage flags. */
const DARK_WATCHED_MS = 10 * 60_000;
/** The ghost fades out of the list this long after the last contact. */
const DARK_LINGER_MS = 45 * 60_000;
/**
 * Only the newest losses are published: at the edge of terrestrial coverage
 * going silent is routine. The cap is applied when publishing, never to the
 * held set — evicting held ghosts would re-detect them next sweep and churn
 * the event log forever.
 */
const DARK_MAX = 30;

/** Two converging aircraft drop out of the gates and back as reports land; hold findings briefly. */
const CONVERGING_HOLD_MS = 2 * 60_000;
/** A rare aircraft dropping out of coverage for a minute is still the same sighting. */
const RARE_HOLD_MS = 3 * 60_000;

/** If not one ship reported inside this window, it's the feed that's silent, not a ship. */
const FEED_QUIET_MS = 90_000;

interface Held {
  finding: Finding;
  lastPositiveAt: number;
}

/**
 * The floor's watchers: sweeps the picture every 20 seconds for circling
 * aircraft, ships gone silent under way, and converging military pairs, and
 * keeps the resulting findings list stable while each condition persists.
 */
export class FindingsService {
  private readonly circlingHeld = new Map<string, Held>();
  private readonly darkHeld = new Map<string, Held>();
  private readonly convergingHeld = new Map<string, Held>();
  private readonly rareHeld = new Map<string, Held>();
  private readonly now: () => number;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private published: Finding[] = [];
  private signature = '[]';
  private lastSweepMs = 0;
  /** The first sweep finds what predates the watch: it publishes, but logs no events. */
  private seeded = false;
  /** Since when the sea feed has delivered without a gap; null while it's quiet. */
  private seaLiveSince: number | null = null;

  constructor(private readonly opts: FindingsServiceOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.intervalMs = opts.intervalMs ?? SWEEP_MS;
  }

  start(): void {
    // A watcher bug must degrade, not take the floor down: a sweep that throws
    // is logged and the next one tries again.
    this.timer ??= setInterval(() => {
      try {
        this.sweep();
      } catch (err) {
        log.error('findings sweep failed', { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
      }
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  items(): Finding[] {
    return this.published;
  }

  health(): Record<string, unknown> {
    return {
      circling: this.circlingHeld.size,
      dark: this.darkHeld.size,
      converging: this.convergingHeld.size,
      rare: this.rareHeld.size,
      lastSweepMs: this.lastSweepMs,
    };
  }

  /** One pass of every watcher. Public so tests drive it directly. */
  sweep(): void {
    const started = performance.now();
    const now = this.now();
    const tracks = this.opts.world.tracks();
    const live = new Set<string>();
    for (const t of tracks) live.add(t.id);

    this.sweepCircling(tracks, live, now);
    this.sweepDark(tracks, now);
    this.sweepConverging(tracks, live, now);
    this.sweepRare(tracks, live, now);
    this.seeded = true;
    this.lastSweepMs = Math.round(performance.now() - started);
    this.publish();
  }

  private event(kind: 'finding-started' | 'finding-ended', finding: Finding, time: number, resolved?: boolean): void {
    if (this.seeded) this.opts.onEvent?.(kind, finding, time, resolved);
  }

  private sweepCircling(tracks: readonly Track[], live: Set<string>, now: number): void {
    for (const t of tracks) {
      if (t.domain !== 'air' || t.speedMps < CIRCLING_MIN_SPEED_MPS || now - t.observedAt > CIRCLING_MAX_AGE_MS) continue;
      const data = this.opts.world.path(t.id);
      if (!data) continue;
      const c = circling(data, now);
      if (!c) continue;
      const id = `circling:${t.id}`;
      const held = this.circlingHeld.get(id);
      const finding: Finding = {
        id,
        kind: 'circling',
        tracks: [t.id],
        domain: 'air',
        name: nameOf(t),
        detail: `${c.turns.toFixed(1)} turns in ${c.minutes} min · radius ${km(c.radiusM)} km`,
        lat: c.lat,
        lon: c.lon,
        since: held?.finding.since ?? now,
      };
      if (held) {
        held.finding = finding;
        held.lastPositiveAt = now;
      } else {
        this.circlingHeld.set(id, { finding, lastPositiveAt: now });
        this.event('finding-started', finding, now);
      }
    }
    this.expire(this.circlingHeld, live, now, CIRCLING_HOLD_MS);
  }

  private sweepDark(tracks: readonly Track[], now: number): void {
    // When no sea report is fresh, the silence is ours, not the ships': the
    // AIS feed pauses while nobody watches, and an outage looks the same.
    // The watcher stands aside rather than call every under-way ship dark —
    // and a ship's loss only counts if it reported while this live spell was
    // already running, or every gap would end in a wall of false ghosts.
    let freshestSea = Infinity;
    for (const t of tracks) {
      if (t.domain === 'sea' && now - t.observedAt < freshestSea) freshestSea = now - t.observedAt;
    }
    const feedLive = freshestSea < FEED_QUIET_MS;
    if (!feedLive) this.seaLiveSince = null;
    else this.seaLiveSince ??= now;
    for (const t of tracks) {
      const id = `dark:${t.id}`;
      if (t.source !== 'ais' || t.domain !== 'sea') continue;
      const age = now - t.observedAt;
      if (age < DARK_AFTER_MS) {
        // Reporting again (or still): any ghost it left behind is resolved.
        const held = this.darkHeld.get(id);
        if (held) {
          this.darkHeld.delete(id);
          this.event('finding-ended', held.finding, now, true);
        }
        continue;
      }
      if (this.darkHeld.has(id)) continue; // since and detail keep the facts at loss time
      if (!feedLive || this.seaLiveSince === null || t.observedAt < this.seaLiveSince) continue;
      if (t.speedMps < DARK_MIN_SPEED_MPS) continue;
      const data = this.opts.world.path(t.id);
      if (!data || data.length < 6 || t.observedAt - data[2]! < DARK_WATCHED_MS) continue;
      const finding: Finding = {
        id,
        kind: 'dark',
        tracks: [t.id],
        domain: 'sea',
        name: nameOf(t),
        detail: `AIS contact lost · was making ${Math.round(mpsToKnots(t.speedMps))} kn`,
        lat: t.lat,
        lon: t.lon,
        since: t.observedAt,
      };
      this.darkHeld.set(id, { finding, lastPositiveAt: now });
      this.event('finding-started', finding, now);
    }
    // Ghosts outlive their tracks (the store drops a silent ship long before
    // the ghost should fade), so expiry here is by time since last contact.
    for (const [id, held] of this.darkHeld) {
      if (now - held.finding.since > DARK_LINGER_MS) {
        this.darkHeld.delete(id);
        this.event('finding-ended', held.finding, now);
      }
    }
  }

  private sweepConverging(tracks: readonly Track[], live: Set<string>, now: number): void {
    for (const pair of convergingPairs(tracks, now)) {
      const [first, second] = [pair.a, pair.b].sort((x, y) => (x.id < y.id ? -1 : 1));
      const id = `conv:${first!.id}|${second!.id}`;
      const held = this.convergingHeld.get(id);
      const minutes = Math.max(1, Math.round(pair.approach.tcpaS / 60));
      const finding: Finding = {
        id,
        kind: 'converging',
        tracks: [first!.id, second!.id],
        domain: 'air',
        name: `${nameOf(first!)} × ${nameOf(second!)}`,
        detail: `CPA ${km(pair.approach.cpaM)} km in ${minutes} min · closing ${Math.round(mpsToKnots(pair.approach.closingMps))} kn`,
        lat: (pair.a.lat + pair.b.lat) / 2,
        lon: midLon(pair.a.lon, pair.b.lon),
        since: held?.finding.since ?? now,
      };
      if (held) {
        held.finding = finding;
        held.lastPositiveAt = now;
      } else {
        this.convergingHeld.set(id, { finding, lastPositiveAt: now });
        this.event('finding-started', finding, now);
      }
    }
    this.expire(this.convergingHeld, live, now, CONVERGING_HOLD_MS);
  }

  private sweepRare(tracks: readonly Track[], live: Set<string>, now: number): void {
    for (const { track: t, label } of rareSightings(tracks, now)) {
      if (this.opts.isPrivate?.(t)) continue;
      const id = `rare:${t.id}`;
      const held = this.rareHeld.get(id);
      const fleet = t.typeCode ? this.opts.fleetOf?.(t.typeCode) : undefined;
      const parts = [label];
      // Only when the database says so: a count is a fact, not a guess.
      if (fleet && fleet > 0) parts.push(`1 of ${fleet} in the aircraft database`);
      parts.push(`${(Math.round(metresToFeet(t.altitudeM ?? 0) / 100) * 100).toLocaleString('en-GB')} ft`);
      const finding: Finding = {
        id,
        kind: 'rare',
        tracks: [t.id],
        domain: 'air',
        name: nameOf(t),
        detail: parts.join(' · '),
        lat: t.lat,
        lon: t.lon,
        since: held?.finding.since ?? now,
      };
      if (held) {
        held.finding = finding;
        held.lastPositiveAt = now;
      } else {
        this.rareHeld.set(id, { finding, lastPositiveAt: now });
        this.event('finding-started', finding, now);
      }
    }
    this.expire(this.rareHeld, live, now, RARE_HOLD_MS);
  }

  /** Drop findings whose condition lapsed (or whose tracks left the picture). */
  private expire(held: Map<string, Held>, live: Set<string>, now: number, holdMs: number): void {
    for (const [id, h] of held) {
      const gone = h.finding.tracks.some((t) => !live.has(t));
      if (gone || now - h.lastPositiveAt > holdMs) {
        held.delete(id);
        this.event('finding-ended', h.finding, now);
      }
    }
  }

  private publish(): void {
    const items = [
      ...[...this.convergingHeld.values()].map((h) => h.finding),
      ...[...this.rareHeld.values()].map((h) => h.finding).sort((a, b) => a.since - b.since),
      ...[...this.circlingHeld.values()].map((h) => h.finding).sort((a, b) => a.since - b.since),
      ...[...this.darkHeld.values()]
        .map((h) => h.finding)
        .sort((a, b) => b.since - a.since)
        .slice(0, DARK_MAX),
    ];
    const signature = JSON.stringify(items);
    if (signature === this.signature) return;
    this.signature = signature;
    this.published = items;
    this.opts.onChange?.(items);
  }
}

/** What the operator calls a track: its callsign (a ship's name), else its bare id. */
function nameOf(t: Track): string {
  return t.callsign ?? t.id.split(':')[1]!.toUpperCase();
}

function km(m: number): string {
  return (m / 1000).toFixed(1);
}

/** Midpoint longitude, the short way around the antimeridian. */
function midLon(a: number, b: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const mid = a + d / 2;
  return mid > 180 ? mid - 360 : mid < -180 ? mid + 360 : mid;
}
