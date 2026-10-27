/**
 * How a feed is doing, as far as a viewer needs to know. The server sends
 * these so the UI can say why live tracks are fading, instead of claiming
 * "live traffic" while a feed is rate limited or down.
 *
 * - ok:           delivering
 * - starting:     no successful fetch yet
 * - rate-limited: the provider asked us to wait; `until` is when polling resumes
 * - failing:      recent attempts failed; `detail` says how, `until` is the next retry
 * - standing-aside: healthy, but the current view is wider than it covers
 *                 (adsb.lol only covers about a region)
 */
export type FeedState = 'ok' | 'starting' | 'rate-limited' | 'failing' | 'standing-aside';

export interface FeedStatus {
  /** Stable id, e.g. 'opensky'. */
  feed: string;
  /** Name for people, e.g. 'OpenSky'. */
  label: string;
  state: FeedState;
  detail?: string;
  /** ms since epoch (server time). */
  until?: number;
}
