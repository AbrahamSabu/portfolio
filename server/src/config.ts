import fs from 'node:fs';
import path from 'node:path';
import type { TrafficKind } from '@watchfloor/shared';

/** Every setting in one place, read once at startup. See .env.example. */
export interface Config {
  port: number;
  host: string;
  tickMs: number;
  staticDir: string;
  /** Which feeds run. Defaults to the simulator so the demo works offline. */
  feeds: FeedName[];
  /** The area every feed covers: the simulator's geography and live feeds' bounding box. */
  scenario: string;
  sim: {
    seed: number;
  };
  opensky: {
    /**
     * 'scenario' polls the scenario's bounding box; 'world' polls everywhere
     * (4 credits a poll); 'viewport' polls only what browsers are looking at.
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
    pollMs: number;
  };
  ais: {
    /** AISStream API key. Without one the feed runs but only reports that it's missing. */
    apiKey?: string;
    /**
     * 'scenario' streams the scenario's bounding box; 'world' streams
     * everywhere; 'viewport' streams only what browsers are looking at.
     */
    area: 'scenario' | 'world' | 'viewport';
    /** Stream URL; set only to point at a local stub. */
    url?: string;
  };
}

export const FEED_NAMES = ['sim', 'opensky', 'adsblol', 'ais'] as const;
export type FeedName = (typeof FEED_NAMES)[number];

/** Parse a comma-separated feed list such as "sim,opensky". Order and duplicates don't matter. */
export function parseFeeds(raw: string | undefined): FeedName[] {
  if (raw === undefined || raw.trim() === '') return ['sim'];
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
 * adsb.lol settings. It's free, but run by volunteers: 30 s keeps the load
 * light, and it only ever polls views up to region size.
 */
function adsbLolConfig(): Config['adsblol'] {
  const apiUrl = httpUrl('ADSBLOL_API_URL');
  return { ...(apiUrl ? { apiUrl } : {}), pollMs: int('ADSBLOL_POLL_S', 30, 10, 600) * 1000 };
}

/**
 * AISStream settings. A missing key isn't an error here: the feed reports it
 * in the status bar, which is more useful than a server that won't start.
 */
function aisConfig(): Config['ais'] {
  const apiKey = process.env.AISSTREAM_API_KEY?.trim() || undefined;
  const area = (process.env.AIS_AREA || 'scenario').trim().toLowerCase();
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
  return { ...(apiKey ? { apiKey } : {}), area, ...(url ? { url } : {}) };
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
  const pollS = int('OPENSKY_POLL_S', authed ? 15 : 60, authed ? 5 : 10, 3600);
  const area = (process.env.OPENSKY_AREA || 'scenario').trim().toLowerCase();
  if (area !== 'scenario' && area !== 'world' && area !== 'viewport') {
    throw new Error(`OPENSKY_AREA must be scenario, world or viewport (got "${area}")`);
  }
  const apiUrl = httpUrl('OPENSKY_API_URL');
  return {
    area,
    ...(apiUrl ? { apiUrl } : {}),
    ...(authed ? { credentials: { clientId, clientSecret } } : {}),
    pollMs: pollS * 1000,
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
    feeds: parseFeeds(process.env.FEEDS),
    // SIM_SCENARIO is the old name, kept so existing .env files still work.
    scenario: process.env.SCENARIO || process.env.SIM_SCENARIO || 'english-channel',
    sim: {
      seed: int('SIM_SEED', 42, 0, 2 ** 32 - 1),
    },
    opensky: openSkyConfig(),
    adsblol: adsbLolConfig(),
    ais: aisConfig(),
  };
}
