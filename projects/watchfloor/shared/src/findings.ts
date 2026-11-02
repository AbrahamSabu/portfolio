import type { Domain } from './track';

/**
 * Something a server-side watcher noticed in the picture: an aircraft flying
 * circles, a ship that stopped transmitting while under way, two military
 * aircraft converging. Findings are observations of geometry and silence,
 * never claims about intent, and their wording states only what was measured.
 */
export interface Finding {
  /** Stable while the finding persists: `circling:<trackId>`, `dark:<trackId>`, `conv:<idA>|<idB>`. */
  id: string;
  kind: FindingKind;
  /** The track ids involved; the first is the one to select or follow. */
  tracks: string[];
  domain: Domain;
  /** What the operator calls it: callsign or vessel name, else the bare id. */
  name: string;
  /** The measurement, e.g. "4.2 turns in 11 min · radius 2.3 km". */
  detail: string;
  lat: number;
  lon: number;
  /** When the condition was first met (ms). */
  since: number;
}

export type FindingKind = 'circling' | 'dark' | 'converging';
export const FINDING_KINDS: readonly FindingKind[] = ['circling', 'dark', 'converging'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** A finding checked field by field, or null: its text goes into the page. */
export function parseFinding(v: unknown): Finding | null {
  if (typeof v !== 'object' || v === null) return null;
  const f = v as Record<string, unknown>;
  if (!text(f.id, 300) || !text(f.name, 80) || !text(f.detail, 200)) return null;
  if (!FINDING_KINDS.includes(f.kind as FindingKind) || (f.domain !== 'air' && f.domain !== 'sea')) return null;
  if (!Array.isArray(f.tracks) || f.tracks.length === 0 || f.tracks.length > 4) return null;
  if (!f.tracks.every((t): t is string => text(t, 130))) return null;
  if (!finite(f.lat) || !finite(f.lon) || Math.abs(f.lat) > 90 || Math.abs(f.lon) > 180 || !finite(f.since)) return null;
  return {
    id: f.id,
    kind: f.kind as FindingKind,
    tracks: f.tracks,
    domain: f.domain,
    name: f.name,
    detail: f.detail,
    lat: f.lat,
    lon: f.lon,
    since: f.since,
  };
}

/**
 * One line of the handover brief: something that happened while the floor was
 * watching, worded by the server from the facts at hand when it happened.
 */
export interface BriefEvent {
  time: number;
  kind: BriefEventKind;
  /** One factual sentence, e.g. "RYR4XW began squawking 7700 (Emergency) near 51.2°N 3.4°E." */
  text: string;
  /** Where it happened, when it happened somewhere. */
  lat?: number;
  lon?: number;
  /** The track involved, for Show (it may have left the picture since). */
  trackId?: string;
}

export type BriefEventKind = 'squawk-started' | 'squawk-ended' | 'finding-started' | 'finding-ended' | 'hazard';
export const BRIEF_EVENT_KINDS: readonly BriefEventKind[] = [
  'squawk-started',
  'squawk-ended',
  'finding-started',
  'finding-ended',
  'hazard',
];

export function parseBriefEvent(v: unknown): BriefEvent | null {
  if (typeof v !== 'object' || v === null) return null;
  const e = v as Record<string, unknown>;
  if (!finite(e.time) || !text(e.text, 300) || !BRIEF_EVENT_KINDS.includes(e.kind as BriefEventKind)) return null;
  const event: BriefEvent = { time: e.time, kind: e.kind as BriefEventKind, text: e.text };
  if (finite(e.lat) && finite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180) {
    event.lat = e.lat;
    event.lon = e.lon;
  }
  if (text(e.trackId, 130)) event.trackId = e.trackId;
  return event;
}
