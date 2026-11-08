/**
 * A political news story placed on the map: a published headline, where it
 * happened and who reported it. Stories come from the GDELT Project, which
 * reads world news coverage and codes each article's events and places.
 * The headline is the outlet's own words, never a summary.
 */
import { cleanText } from './validate';
export interface NewsItem {
  /** Stable across batches and restarts: GDELT's event id. */
  id: string;
  headline: string;
  /** The article, http(s) only. */
  url: string;
  /** Its site, e.g. "bbc.co.uk". */
  outlet: string;
  lat: number;
  lon: number;
  /** As GDELT names the place: "Dnipro, Dnipropetrovs'ka Oblast', Ukraine". */
  place: string;
  kind: NewsKind;
  /** When GDELT published the batch it came in (ms). */
  publishedAt: number;
  /**
   * How much it matters (coverage plus how political; roughly 0-60), for the
   * briefing's top stories. Optional: news saved before it existed has none.
   */
  importance?: number;
}

/**
 * What sort of story, for its marker: armed conflict and attacks, protest,
 * elections and parties, diplomacy between states, or politics otherwise.
 */
export type NewsKind = 'conflict' | 'protest' | 'election' | 'diplomacy' | 'politics';

export const NEWS_KINDS: readonly NewsKind[] = ['conflict', 'protest', 'election', 'diplomacy', 'politics'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * A news item checked field by field, or null. Used on the saved news file
 * and in the browser: headlines and URLs go into the page, so a URL must be
 * http(s) and everything must be the right shape.
 */
export function parseNewsItem(v: unknown): NewsItem | null {
  if (typeof v !== 'object' || v === null) return null;
  const n = v as Record<string, unknown>;
  if (!text(n.id, 40) || !text(n.headline, 300) || !text(n.url, 2000) || !text(n.outlet, 200) || !text(n.place, 200)) return null;
  if (!/^https?:\/\//i.test(n.url)) return null;
  if (!finite(n.lat) || !finite(n.lon) || Math.abs(n.lat) > 90 || Math.abs(n.lon) > 180) return null;
  if (!finite(n.publishedAt) || !NEWS_KINDS.includes(n.kind as NewsKind)) return null;
  return {
    id: n.id,
    headline: cleanText(n.headline),
    url: n.url,
    outlet: cleanText(n.outlet),
    lat: n.lat,
    lon: n.lon,
    place: cleanText(n.place),
    kind: n.kind as NewsKind,
    publishedAt: n.publishedAt,
    ...(finite(n.importance) && n.importance >= 0 && n.importance <= 1000 ? { importance: Math.round(n.importance) } : {}),
  };
}
