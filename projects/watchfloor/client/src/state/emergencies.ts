import { emergencyOf, type Track } from '@watchfloor/shared';

export interface Emergency {
  id: string;
  squawk: string;
  /** "Emergency", "Radio failure", "Unlawful interference". */
  meaning: string;
  /** When the code was first seen on this track (server ms). */
  since: number;
}

/**
 * Aircraft squawking an emergency code. A single report isn't enough: a
 * transponder passing through 7700 while the crew dials another code, or a
 * garbled reply, would raise a false alarm, so a code counts once a second
 * report (a later position) carries it too. An emergency ends when the
 * aircraft changes code or leaves the picture.
 */
export class EmergencyWatch {
  /** Tracks with an emergency code: the code, when first seen, and from which report. */
  private readonly seen = new Map<string, { squawk: string; since: number; firstReport: number }>();
  private readonly confirmed = new Map<string, Emergency>();

  /** Look at every track once; returns the emergencies that just became confirmed. */
  update(tracks: Iterable<Track>, now: number): Emergency[] {
    const present = new Set<string>();
    const fresh: Emergency[] = [];
    for (const t of tracks) {
      const meaning = emergencyOf(t);
      if (!meaning || !t.squawk) continue;
      present.add(t.id);
      const seen = this.seen.get(t.id);
      if (!seen || seen.squawk !== t.squawk) {
        this.seen.set(t.id, { squawk: t.squawk, since: now, firstReport: t.observedAt });
        this.confirmed.delete(t.id);
        continue;
      }
      if (!this.confirmed.has(t.id) && t.observedAt > seen.firstReport) {
        const emergency = { id: t.id, squawk: t.squawk, meaning, since: seen.since };
        this.confirmed.set(t.id, emergency);
        fresh.push(emergency);
      }
    }
    for (const id of [...this.seen.keys()]) {
      if (present.has(id)) continue;
      this.seen.delete(id);
      this.confirmed.delete(id);
    }
    return fresh;
  }

  /** Confirmed emergencies, oldest first. */
  get active(): Emergency[] {
    return [...this.confirmed.values()].sort((a, b) => a.since - b.since);
  }
}
