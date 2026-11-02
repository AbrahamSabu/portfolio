import { emergencyOf, type BriefEvent, type BriefMessage, type Finding, type Hazard, type Track } from '@watchfloor/shared';
import { findingEnded, findingStarted, hazardSeen, significantHazard, squawkEnded, squawkStarted } from './compose';

/** The brief covers one watch handover's worth of history. */
const WINDOW_MS = 24 * 3_600_000;
/** A hard cap so a chatty day can't grow without bound. The oldest go first. */
const MAX_EVENTS = 500;
/** How often the squawk watch sweeps the picture. */
const SWEEP_MS = 5_000;

export interface BriefServiceOptions {
  tracks: () => readonly Track[];
  intervalMs?: number;
  now?: () => number;
}

interface Squawking {
  name: string;
  squawk: string;
  since: number;
}

/**
 * The rolling log behind the handover brief: emergency squawks starting and
 * ending, the watchers' findings, significant hazards appearing. Each line
 * is composed when it happens, from the facts in hand, and the brief is the
 * log read back — so every sentence is traceable and none is invented later.
 */
export class BriefService {
  private readonly events: BriefEvent[] = [];
  private readonly startedAt: number;
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly squawking = new Map<string, Squawking>();
  /** Hazards already seen; null until the first list (those predate the log). */
  private hazardIds: Set<string> | null = null;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: BriefServiceOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.intervalMs = opts.intervalMs ?? SWEEP_MS;
    this.startedAt = this.now();
  }

  start(): void {
    this.timer ??= setInterval(() => this.sweep(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  health(): Record<string, unknown> {
    return { events: this.events.length, squawking: this.squawking.size };
  }

  /** The brief as sent to a browser that asks. */
  message(): BriefMessage {
    const now = this.now();
    this.prune(now);
    return {
      type: 'brief',
      serverTime: now,
      sinceTime: Math.max(this.startedAt, now - WINDOW_MS),
      events: [...this.events],
    };
  }

  /** Wired to FindingsService.onEvent. */
  onFinding(kind: 'finding-started' | 'finding-ended', finding: Finding, time: number, resolved = false): void {
    if (kind === 'finding-started') {
      this.add({ time, kind, text: findingStarted(finding), lat: finding.lat, lon: finding.lon, trackId: finding.tracks[0]! });
      return;
    }
    const text = findingEnded(finding, time, resolved);
    if (text) this.add({ time, kind, text, lat: finding.lat, lon: finding.lon, trackId: finding.tracks[0]! });
  }

  /** Wired beside the hub's hazard broadcast: logs significant hazards as they appear. */
  onHazards(items: Hazard[]): void {
    if (this.hazardIds === null) {
      this.hazardIds = new Set(items.map((h) => h.id));
      return;
    }
    const now = this.now();
    for (const h of items) {
      if (this.hazardIds.has(h.id)) continue;
      this.hazardIds.add(h.id);
      if (significantHazard(h)) this.add({ time: now, kind: 'hazard', text: hazardSeen(h), lat: h.lat, lon: h.lon });
    }
  }

  /** One pass of the squawk watch. Public so tests drive it directly. */
  sweep(): void {
    const now = this.now();
    const tracks = this.opts.tracks();
    const seen = new Set<string>();
    for (const t of tracks) {
      const meaning = emergencyOf(t);
      if (!meaning || !t.squawk) continue;
      seen.add(t.id);
      const current = this.squawking.get(t.id);
      if (current && current.squawk === t.squawk) continue;
      if (current) this.add({ time: now, kind: 'squawk-ended', text: squawkEnded(current.name, current.squawk, now - current.since), trackId: t.id });
      const name = t.callsign ?? t.id.split(':')[1]!.toUpperCase();
      this.squawking.set(t.id, { name, squawk: t.squawk, since: now });
      this.add({ time: now, kind: 'squawk-started', text: squawkStarted(t, meaning), lat: t.lat, lon: t.lon, trackId: t.id });
    }
    for (const [id, s] of this.squawking) {
      if (seen.has(id)) continue;
      this.squawking.delete(id);
      this.add({ time: now, kind: 'squawk-ended', text: squawkEnded(s.name, s.squawk, now - s.since), trackId: id });
    }
  }

  private add(event: BriefEvent): void {
    this.events.push(event);
    this.prune(event.time);
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (this.events.length > 0 && (this.events[0]!.time < cutoff || this.events.length > MAX_EVENTS)) this.events.shift();
  }
}
