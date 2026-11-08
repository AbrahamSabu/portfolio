import fs from 'node:fs';
import path from 'node:path';
import { isSatelliteGroup, SATELLITE_GROUPS, type SatelliteGroup, type TrafficKind } from '@watchfloor/shared';

/** Every setting in one place, read once at startup. See .env.example. */
export interface Config {
  port: number;
  host: string;
  tickMs: number;
  staticDir: string;
  /** Where the live picture is saved between restarts; null to keep nothing. */
  pictureFile: string | null;
  /** The aircraft database index (`npm run aircraft-db`); null to use reported types only. */
  aircraftDb: string | null;
  /** Political news from GDELT (`NEWS=off` to stop it); `file` keeps the day's stories across restarts. */
  news: { enabled: boolean; file: string | null };
  /** Earthquakes (USGS) and disasters (GDACS) on the map; `HAZARDS=off` to stop them. */
  hazards: boolean;
  /** Orbital elements from CelesTrak for the satellite layer; `SATELLITES=off` to stop them. */
  satellites: { groups: SatelliteGroup[]; refreshMs: number; cacheDir: string | null; baseUrl?: string };
  /**
   * Which feeds run. Defaults to the live world: aircraft from OpenSky
   * everywhere, filled in from adsb.lol and adsb.fi (free, no key) where
   * you're zoomed in, and ships from AISStream; `sim` runs the offline simulator.
   */
  feeds: FeedName[];
  /** The area every feed covers: the simulator's geography and live feeds' bounding box. */
  scenario: string;
  sim: {
    seed: number;
  };
  opensky: {
    /**
     * 'world' (default) polls everywhere (4 credits a poll), so panning
     * anywhere finds aircraft already there; 'scenario' polls the scenario's
     * bounding box; 'viewport' polls only what browsers are looking at.
     */
    area: 'scenario' | 'world' | 'viewport';
    /** REST API base; set only to point at a proxy or a local stub. */
    apiUrl?: string;
    /** OAuth2 client credentials; without them the feed polls anonymously. */
    credentials?: { clientId: string; clientSecret: string };
    pollMs: number;
  };
  adsblol: {
    /** API base; set only to point at a local stub. */
    apiUrl?: string;
    /** While someone is watching. */
    pollMs: number;
    /** The scenario's area while nobody is watching, so the picture is ready when someone opens the page. */
    warmPollMs: number;
  };
  /** adsb.fi: the same kind of network, with a documented limit (1 request a second). */
  adsbfi: Config['adsblol'];
  ais: {
    /** AISStream API key. Without one the feed runs but only reports that it's missing. */
    apiKey?: string;
    /**
     * 'world' (default) streams everywhere AISStream hears; 'scenario' streams
     * the scenario's bounding box; 'viewport' streams only what browsers are
     * looking at.
     */
    area: 'scenario' | 'world' | 'viewport';
    /**
     * Viewport mode on a small public server: views wider than this many
     * square degrees aren't streamed (AIS_MAX_AREA; 0, the default, streams
     * any). The opening globe would otherwise ask for every ship in the world.
     */
    maxArea: number;
    /** Stream URL; set only to point at a local stub. */
    url?: string;
  };
  /**
   * Per-visitor limits, for a server open to the public. `addressHeaders`:
   * the header a trusted proxy sets to the visitor's address
   * (CLIENT_IP_HEADER, e.g. `cf-connecting-ip` behind Cloudflare, as on
   * Render); none means the socket's own address. `maxPerAddress`: the
   * connections one address may hold (MAX_CONNECTIONS_PER_ADDRESS, 0 = no
   * limit). `maxRooms`: ops rooms open at once (ROOMS_MAX).
   */
  visitors: { addressHeaders: string[]; maxPerAddress: number; maxRooms: number; allowedOrigins: string[] };
}

export const FEED_NAMES = ['sim', 'opensky', 'adsblol', 'adsbfi', 'ais'] as const;
export type FeedName = (typeof FEED_NAMES)[number];

/** Parse a comma-separated feed list such as "sim,opensky". Order and duplicates don't matter. */
export function parseFeeds(raw: string | undefined): FeedName[] {
  if (raw === undefined || raw.trim() === '') return ['opensky', 'adsblol', 'adsbfi', 'ais'];
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const name of names) {
    if (!(FEED_NAMES as readonly string[]).includes(name)) {
      throw new Error(`FEEDS: unknown feed "${name}". Available: ${FEED_NAMES.join(', ')}`);
    }
  }
  if (names.length === 0) throw new Error('FEEDS must name at least one feed');
  return FEED_NAMES.filter((n) => names.includes(n));
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
  }
  return n;
}

/** CLIENT_IP_HEADER: header names, separated by commas, in the order to try them. */
export function parseAddressHeaders(raw: string | undefined): string[] {
  const names = (raw ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  const bad = names.find((h) => !/^[a-z0-9-]+$/.test(h));
  if (bad !== undefined) throw new Error(`CLIENT_IP_HEADER must be header names separated by commas (got "${bad}")`);
  return names;
}

/** ALLOWED_ORIGINS: page origins other than the server's own host that may open a socket, separated by commas. */
export function parseOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  for (const o of origins) {
    try {
      const u = new URL(o);
      if (!/^https?:$/.test(u.protocol) || u.pathname !== '/' || u.search || u.hash) throw new Error('not an origin');
    } catch {
      throw new Error(`ALLOWED_ORIGINS must be origins such as https://watchfloor.example.com (got "${o}")`);
    }
  }
  return origins;
}

/** What the running feeds add up to, for the hello message. */
export function trafficKind(feeds: readonly FeedName[]): TrafficKind {
  const simulated = feeds.includes('sim');
  const live = feeds.some((f) => f !== 'sim');
  return simulated && live ? 'mixed' : live ? 'live' : 'simulated';
}

/** An optional http(s) base URL from the environment, without a trailing slash. */
function httpUrl(name: string): string | undefined {
  const url = process.env[name]?.trim().replace(/\/+$/, '') || undefined;
  if (!url) return undefined;
  let protocol = '';
  try {
    protocol = new URL(url).protocol;
  } catch {
    // reported below
  }
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`${name} must be an http(s) URL (got "${url}")`);
  return url;
}

/**
 * adsb.lol settings. It's free, but run by volunteers, so the load stays
 * light: one request every 10 s per area while someone watches (the map
 * dead-reckons in between), and one every 30 s for the home area while nobody
 * does. 30 s keeps unwatched aircraft inside their live window, so a page
 * opening on them shows them live, not faded.
 */
function adsbLolConfig(): Config['adsblol'] {
  const apiUrl = httpUrl('ADSBLOL_API_URL');
  return {
    ...(apiUrl ? { apiUrl } : {}),
    pollMs: int('ADSBLOL_POLL_S', 10, 5, 600) * 1000,
    warmPollMs: int('ADSBLOL_WARM_POLL_S', 30, 10, 3600) * 1000,
  };
}

/**
 * adsb.fi settings. Its documented limit is 1 request a second, so it can be
 * asked every 5 s while someone watches: with adsb.lol every 10 s, the
 * picture refreshes every few seconds, and either one alone keeps it alive.
 */
function adsbFiConfig(): Config['adsbfi'] {
  const apiUrl = httpUrl('ADSBFI_API_URL');
  return {
    ...(apiUrl ? { apiUrl } : {}),
    pollMs: int('ADSBFI_POLL_S', 5, 2, 600) * 1000,
    warmPollMs: int('ADSBFI_WARM_POLL_S', 30, 10, 3600) * 1000,
  };
}

/**
 * AISStream settings. A missing key isn't an error here: the feed reports it
 * in the status bar, which is more useful than a server that won't start.
 */
function aisConfig(): Config['ais'] {
  const apiKey = process.env.AISSTREAM_API_KEY?.trim() || undefined;
  const area = (process.env.AIS_AREA || 'world').trim().toLowerCase();
  if (area !== 'scenario' && area !== 'world' && area !== 'viewport') {
    throw new Error(`AIS_AREA must be scenario, world or viewport (got "${area}")`);
  }
  const url = process.env.AISSTREAM_URL?.trim() || undefined;
  if (url) {
    let protocol = '';
    try {
      protocol = new URL(url).protocol;
    } catch {
      // reported below
    }
    if (protocol !== 'wss:' && protocol !== 'ws:') throw new Error(`AISSTREAM_URL must be a ws(s) URL (got "${url}")`);
  }
  return { ...(apiKey ? { apiKey } : {}), area, maxArea: int('AIS_MAX_AREA', 0, 0, 64_800), ...(url ? { url } : {}) };
}

/**
 * OpenSky settings. The default interval is set by the daily credit budget
 * (1 credit per poll for a box up to 25 square degrees): anonymous users get
 * 400 a day, so 60 s lasts about 6.7 hours; an account gets 4,000, so 15 s
 * lasts about 16.7 hours. The floor is OpenSky's data resolution (10 s
 * anonymous, 5 s with an account); polling faster returns the same data.
 */
function openSkyConfig(): Config['opensky'] {
  const clientId = process.env.OPENSKY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim() || '';
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('Set both OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET, or neither to poll anonymously');
  }
  const authed = Boolean(clientId);
  const area = (process.env.OPENSKY_AREA || 'world').trim().toLowerCase();
  if (area !== 'scenario' && area !== 'world' && area !== 'viewport') {
    throw new Error(`OPENSKY_AREA must be scenario, world or viewport (got "${area}")`);
  }
  // A world poll costs 4 credits, so even an account's 4,000 a day last only
  // about 4 h at 15 s; 60 s stretches them to 16.7 h of viewing. A scenario
  // box costs 1, so an account can afford 15 s there.
  const pollS = int('OPENSKY_POLL_S', authed && area === 'scenario' ? 15 : 60, authed ? 5 : 10, 3600);
  const apiUrl = httpUrl('OPENSKY_API_URL');
  return {
    area,
    ...(apiUrl ? { apiUrl } : {}),
    ...(authed ? { credentials: { clientId, clientSecret } } : {}),
    pollMs: pollS * 1000,
  };
}

/**
 * CelesTrak groups for the satellite layer, such as "stations,weather". Not
 * `active` (every satellite, ~13,000): Starlink is part of it, and CelesTrak
 * asks for one or the other, never both.
 */
export function parseSatelliteGroups(raw: string | undefined): SatelliteGroup[] {
  if (raw === undefined || raw.trim() === '') return [...SATELLITE_GROUPS];
  if (raw.trim().toLowerCase() === 'off') return [];
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const name of names) {
    if (!isSatelliteGroup(name)) throw new Error(`SATELLITES: unknown group "${name}". Available: ${SATELLITE_GROUPS.join(', ')}, or off`);
  }
  return SATELLITE_GROUPS.filter((g) => names.includes(g));
}

/**
 * Satellites: each group is downloaded at most once per refresh interval
 * (6 h by default; CelesTrak updates every 2 h and refuses repeats sooner)
 * and kept on disk, so restarts don't download again.
 */
function satellitesConfig(): Config['satellites'] {
  const baseUrl = httpUrl('CELESTRAK_URL');
  return {
    groups: parseSatelliteGroups(process.env.SATELLITES),
    refreshMs: int('SATELLITES_REFRESH_H', 6, 2, 72) * 3_600_000,
    cacheDir:
      process.env.SATELLITES_CACHE?.trim().toLowerCase() === 'off'
        ? null
        : path.resolve(process.cwd(), process.env.SATELLITES_CACHE || '../.cache/satellites'),
    ...(baseUrl ? { baseUrl } : {}),
  };
}

/**
 * Load a .env file if there is one (repo root or current directory).
 * Real environment variables always win over the file.
 */
function loadEnvFile(): void {
  for (const candidate of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env')]) {
    if (fs.existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

export function loadConfig(): Config {
  loadEnvFile();
  // Fail loudly rather than silently running the simulator for someone who turned it off.
  if (process.env.SIM_ENABLED !== undefined) {
    throw new Error('SIM_ENABLED has been replaced by FEEDS (for example FEEDS=sim). See .env.example.');
  }
  return {
    port: int('PORT', 8080, 1, 65535),
    host: process.env.HOST || '127.0.0.1',
    tickMs: int('TICK_MS', 1000, 100, 10_000),
    staticDir: path.resolve(process.cwd(), process.env.STATIC_DIR || '../client/dist'),
    pictureFile:
      process.env.PICTURE_FILE?.trim().toLowerCase() === 'off'
        ? null
        : path.resolve(process.cwd(), process.env.PICTURE_FILE || '../.cache/picture.json'),
    aircraftDb:
      process.env.AIRCRAFT_DB?.trim().toLowerCase() === 'off'
        ? null
        : path.resolve(process.cwd(), process.env.AIRCRAFT_DB || '../.cache/aircraft-db'),
    news: {
      enabled: process.env.NEWS?.trim().toLowerCase() !== 'off',
      file:
        process.env.NEWS_FILE?.trim().toLowerCase() === 'off'
          ? null
          : path.resolve(process.cwd(), process.env.NEWS_FILE || '../.cache/news.json'),
    },
    hazards: process.env.HAZARDS?.trim().toLowerCase() !== 'off',
    satellites: satellitesConfig(),
    feeds: parseFeeds(process.env.FEEDS),
    // SIM_SCENARIO is the old name, kept so existing .env files still work.
    scenario: process.env.SCENARIO || process.env.SIM_SCENARIO || 'cork',
    sim: {
      seed: int('SIM_SEED', 42, 0, 2 ** 32 - 1),
    },
    opensky: openSkyConfig(),
    adsblol: adsbLolConfig(),
    adsbfi: adsbFiConfig(),
    ais: aisConfig(),
    visitors: {
      addressHeaders: parseAddressHeaders(process.env.CLIENT_IP_HEADER),
      maxPerAddress: int('MAX_CONNECTIONS_PER_ADDRESS', 0, 0, 1000),
      maxRooms: int('ROOMS_MAX', 16, 1, 1000),
      allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
    },
  };
}
