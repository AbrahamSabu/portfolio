import type { Domain } from './track';

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

export type StalenessRules = Record<Domain, StalenessRule>;

export const DEFAULT_STALENESS: StalenessRules = {
  air: { staleAfterMs: 30_000, dropAfterMs: 120_000 },
  sea: { staleAfterMs: 90_000, dropAfterMs: 600_000 },
};

export type TrackStatus = 'live' | 'stale';

export function trackStatus(ageMs: number, rule: StalenessRule): TrackStatus {
  return ageMs > rule.staleAfterMs ? 'stale' : 'live';
}
