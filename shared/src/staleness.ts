import type { Domain, Track, TrackSource } from './track';

/**
 * How long a track can go without a report before we treat it differently.
 *
 * - staleAfterMs: the track is drawn faded and stops being dead-reckoned.
 * - dropAfterMs:  the server removes it entirely.
 *
 * Sea traffic reports far less often than air traffic (AIS can be minutes
 * apart for slow ships), so it gets much longer windows.
 */
export interface StalenessRule {
  staleAfterMs: number;
  dropAfterMs: number;
}

/**
 * Domain defaults, plus overrides for sources whose cadence is set by how we
 * fetch them rather than by the transponder. A polled feed (OpenSky) delivers
 * reports in bursts every N seconds, so its tracks need windows sized to N.
 * Always look rules up with `ruleFor`, so precedence lives in one place.
 */
export interface StalenessRules {
  byDomain: Record<Domain, StalenessRule>;
  bySource: Partial<Record<TrackSource, StalenessRule>>;
}

export const DEFAULT_STALENESS: StalenessRules = {
  byDomain: {
    air: { staleAfterMs: 30_000, dropAfterMs: 120_000 },
    sea: { staleAfterMs: 90_000, dropAfterMs: 600_000 },
  },
  bySource: {},
};

export function ruleFor(track: Pick<Track, 'source' | 'domain'>, rules: StalenessRules): StalenessRule {
  return rules.bySource[track.source] ?? rules.byDomain[track.domain];
}

/** Allowance for how old a polled report already is when it arrives (source resolution plus contact lag). */
const POLL_LATENCY_MS = 25_000;

/**
 * Windows for a feed polled every `intervalMs`.
 *
 * Just before the next poll, a report is up to latency + interval old. Going
 * stale at latency + 2 x interval means one missed or slow poll doesn't fade
 * the whole picture; two in a row does, which is the honest signal. Dropping
 * keeps at least the air default of 2 minutes and allows about six missed polls.
 */
export function polledStaleness(intervalMs: number, floor: StalenessRule): StalenessRule {
  return {
    staleAfterMs: Math.max(floor.staleAfterMs, POLL_LATENCY_MS + 2 * intervalMs),
    dropAfterMs: Math.max(floor.dropAfterMs, 6 * intervalMs),
  };
}

export type TrackStatus = 'live' | 'stale';

export function trackStatus(ageMs: number, rule: StalenessRule): TrackStatus {
  return ageMs > rule.staleAfterMs ? 'stale' : 'live';
}
