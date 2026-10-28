import type { Provider } from '@watchfloor/shared';
import type { Circle } from './circles';

/**
 * A free ADS-B network that answers point-and-radius queries in the readsb /
 * ADSBx v2 JSON schema. Several community networks run the same software, so
 * one feed class serves them all; what differs is the URL and how hard each
 * may be asked.
 *
 * Running two at once is what keeps aircraft on the map: each network can
 * refuse us without warning (adsb.lol did, for hours, after a burst of test
 * restarts), and both feed the same `adsb:<icao24>` tracks, so the store merges
 * them and whichever answered last wins.
 */
export interface ReadsbService {
  /** Feed name in FEEDS, logs and FeedStatus. */
  feed: 'adsblol' | 'adsbfi';
  /** Viewer-facing name. */
  label: string;
  provider: Provider;
  defaultUrl: string;
  /** Path of "aircraft within R nautical miles of a point". */
  pointPath(c: Circle): string;
  /** Least time between request starts, so no poll is a burst. */
  requestGapMs: number;
  /** Polls are at least this far apart per circle: the request budget. */
  minMsPerCircle: number;
}

/**
 * adsb.lol publishes no limit ("dynamic"). Measured, Oct 2026: six requests
 * within about a second succeeded and the seventh drew a 429; 7 circles every
 * 10 s (42 a minute) drew 429s within seconds, and even 12 a minute, paced,
 * drew one about every minute. So: requests 1.2 s apart and at most 7.5 a
 * minute. One circle (the home area) still updates every 10 s.
 */
export const ADSB_LOL: ReadsbService = {
  feed: 'adsblol',
  label: 'adsb.lol',
  provider: 'adsb.lol',
  defaultUrl: 'https://api.adsb.lol',
  pointPath: (c) => `/v2/point/${c.lat}/${c.lon}/${c.radiusNm}`,
  requestGapMs: 1_200,
  minMsPerCircle: 8_000,
};

/**
 * adsb.fi documents its limit (github.com/adsbfi/opendata, Oct 2026): 1
 * request a second, radius up to 250 nm, personal non-commercial use with
 * attribution. 4xx answers count toward a temporary IP ban, so stay well
 * under: 1.2 s apart, and at most 30 a minute (a 2 s budget per circle).
 * Measured: Cork's circle answers in about 0.2 s.
 */
export const ADSB_FI: ReadsbService = {
  feed: 'adsbfi',
  label: 'adsb.fi',
  provider: 'adsb.fi',
  defaultUrl: 'https://opendata.adsb.fi/api',
  pointPath: (c) => `/v3/lat/${c.lat}/lon/${c.lon}/dist/${c.radiusNm}`,
  requestGapMs: 1_200,
  minMsPerCircle: 2_000,
};
