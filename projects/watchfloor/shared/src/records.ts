import type { Domain } from './track';

/**
 * The leaderboard: the record holders in the picture right now (highest,
 * fastest, biggest...). Worked out by the server, which knows which aircraft
 * asked not to be tracked publicly and leaves them out, and which has the
 * airline and ship registers to put names to callsigns and hulls.
 */
export type BoardId =
  | 'highest'
  | 'fastest'
  | 'biggest'
  | 'north'
  | 'south'
  | 'airlines'
  | 'types'
  | 'fastest-ship'
  | 'longest-ship';

export const BOARD_IDS: readonly BoardId[] = ['highest', 'fastest', 'biggest', 'north', 'south', 'airlines', 'types', 'fastest-ship', 'longest-ship'];

export interface Board {
  id: BoardId;
  domain: Domain;
  /** "Highest". */
  title: string;
  /** What the figure means, when it isn't obvious: "ground speed, wind included". */
  note?: string;
  /** First place first; up to three. */
  entries: RecordEntry[];
}

/** One place on a board. */
export interface RecordEntry {
  /** Who: a callsign or name, or an airline or type for a count. */
  name: string;
  /** The figure, worded: "53,300 ft". */
  value: string;
  /** What it is, when that isn't the point: "Airbus A380". */
  detail?: string;
  /** The track that holds it (for a count, one of them), to select and fly to. */
  trackId?: string;
  lat?: number;
  lon?: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** A board checked field by field, or null: its text goes into the page. */
export function parseBoard(v: unknown): Board | null {
  if (typeof v !== 'object' || v === null) return null;
  const b = v as Record<string, unknown>;
  if (!BOARD_IDS.includes(b.id as BoardId) || (b.domain !== 'air' && b.domain !== 'sea') || !text(b.title, 60)) return null;
  if (!Array.isArray(b.entries) || b.entries.length > 5) return null;
  const board: Board = { id: b.id as BoardId, domain: b.domain, title: b.title, entries: [] };
  if (text(b.note, 120)) board.note = b.note;
  for (const raw of b.entries) {
    if (typeof raw !== 'object' || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (!text(e.name, 80) || !text(e.value, 60)) return null;
    const entry: RecordEntry = { name: e.name, value: e.value };
    if (text(e.detail, 120)) entry.detail = e.detail;
    if (text(e.trackId, 130)) entry.trackId = e.trackId;
    if (finite(e.lat) && finite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180) {
      entry.lat = e.lat;
      entry.lon = e.lon;
    }
    board.entries.push(entry);
  }
  return board;
}
