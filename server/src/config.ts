import fs from 'node:fs';
import path from 'node:path';

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
}

export const FEED_NAMES = ['sim'] as const;
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
  };
}
