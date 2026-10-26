import fs from 'node:fs';
import path from 'node:path';

/** Every setting in one place, read once at startup. See .env.example. */
export interface Config {
  port: number;
  host: string;
  tickMs: number;
  staticDir: string;
  sim: {
    enabled: boolean;
    scenario: string;
    seed: number;
  };
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

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be true or false (got "${raw}")`);
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
  return {
    port: int('PORT', 8080, 1, 65535),
    host: process.env.HOST || '127.0.0.1',
    tickMs: int('TICK_MS', 1000, 100, 10_000),
    staticDir: path.resolve(process.cwd(), process.env.STATIC_DIR || '../client/dist'),
    sim: {
      enabled: bool('SIM_ENABLED', true),
      scenario: process.env.SIM_SCENARIO || 'english-channel',
      seed: int('SIM_SEED', 42, 0, 2 ** 32 - 1),
    },
  };
}
