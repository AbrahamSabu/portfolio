import type { Track } from '@watchfloor/shared';

/**
 * Types built in tiny numbers, by ICAO designator, with the name people know
 * them by. Hand-picked rather than "any type with few airframes": that rule
 * would mostly catch obscure homebuilt light aircraft. Every one here was
 * under 100 airframes in the tar1090 database (Nov 2026: Beluga 5, BelugaXL
 * 7, Dreamlifter 5, An-22 6, E-767 2, 707 19, U-2 35, An-124 43, E-3 54,
 * B-1 49, C-5 53, RQ-4 64, B-52 73, An-12 82). Airliners like the A380 (261)
 * and 747-400 (450) are too common to interrupt anyone.
 */
export const RARE_TYPES: Readonly<Record<string, string>> = {
  A3ST: 'Airbus Beluga',
  A337: 'Airbus BelugaXL',
  BLCF: 'Boeing 747 Dreamlifter',
  A124: 'Antonov An-124 Ruslan',
  AN22: 'Antonov An-22',
  A225: 'Antonov An-225 Mriya',
  AN12: 'Antonov An-12',
  C5M: 'Lockheed C-5 Galaxy',
  B52: 'Boeing B-52 Stratofortress',
  B1: 'Rockwell B-1 Lancer',
  E3TF: 'Boeing E-3 Sentry (AWACS)',
  E3CF: 'Boeing E-3 Sentry (AWACS)',
  E767: 'Boeing E-767 (AWACS)',
  U2: 'Lockheed U-2',
  Q4: 'Northrop Grumman RQ-4 Global Hawk',
  B703: 'Boeing 707',
};

/** A report older than this says where it was, not where it is. */
const MAX_AGE_MS = 2 * 60_000;
/** Airborne only: Belugas sit at their factories broadcasting all day. */
const MIN_ALTITUDE_M = 60;
/** About 60 knots: flying, not taxiing. */
const MIN_SPEED_MPS = 30;

/** Every rare type in flight right now, with the name it goes by. */
export function rareSightings(tracks: readonly Track[], now: number): { track: Track; label: string }[] {
  const out: { track: Track; label: string }[] = [];
  for (const t of tracks) {
    if (t.domain !== 'air' || !t.typeCode) continue;
    const label = RARE_TYPES[t.typeCode];
    if (!label) continue;
    if (now - t.observedAt > MAX_AGE_MS || (t.altitudeM ?? 0) < MIN_ALTITUDE_M || t.speedMps < MIN_SPEED_MPS) continue;
    out.push({ track: t, label });
  }
  return out;
}
