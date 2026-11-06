import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseSatelliteCatalog, type SatelliteGroup } from '@watchfloor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { celestrakUrl, parseCelestrak } from './celestrak';
import { loadGroup, MAX_REFUSALS, MIN_REFRESH_MS, SatelliteService } from './satelliteService';

/** Five objects cut from CelesTrak's real `stations` group of 2026-11-06. */
const STATIONS = fs.readFileSync(new URL('./fixtures/stations-2026-11-06.json', import.meta.url), 'utf8');
const FETCHED = Date.UTC(2026, 10, 6, 18, 0);
const HOUR = 3_600_000;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setup(answer: (group: string) => Response | Promise<Response>, opts: { groups?: SatelliteGroup[]; cacheDir?: string } = {}) {
  let now = FETCHED;
  const asked: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const cacheDir = opts.cacheDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'wf-sat-'));
  dirs.push(cacheDir);
  const service = new SatelliteService({
    groups: opts.groups ?? ['stations', 'weather'],
    refreshMs: 6 * HOUR,
    cacheDir,
    fetch: (async (url: string) => {
      const group = /GROUP=(\w+)/.exec(url)![1]!;
      asked.push(group);
      return answer(group);
    }) as unknown as typeof fetch,
    now: () => now,
    random: () => 0,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => {},
  });
  const advance = (ms: number) => (now += ms);
  return { service, asked, timers, cacheDir, advance, now: () => now };
}

describe('parseCelestrak', () => {
  it('reads the real file, six-digit catalogue numbers included', () => {
    const parsed = parseCelestrak(JSON.parse(STATIONS), FETCHED)!;
    expect(parsed.skipped).toBe(0);
    expect(parsed.satellites.map((s) => s.id)).toEqual([25544, 48274, 49044, 67683, 100057]);
  });

  it('drops elements a month stale and repeated catalogue numbers', () => {
    const records = JSON.parse(STATIONS) as Record<string, unknown>[];
    const parsed = parseCelestrak([...records, records[0]], FETCHED + 40 * 24 * HOUR)!;
    expect(parsed.satellites).toEqual([]);
    expect(parsed.skipped).toBe(6);
    expect(parseCelestrak({ error: 'nope' }, FETCHED)).toBeNull();
  });

  it('asks the .org host for OMM JSON', () => {
    expect(celestrakUrl('https://celestrak.org', 'starlink')).toBe('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json');
  });
});

describe('SatelliteService', () => {
  it('downloads each missing group once, in turn, and serves them gzipped with an ETag', async () => {
    const { service, asked, timers } = setup((group) => new Response(group === 'stations' ? STATIONS : '[]', { status: 200 }));
    await service.start();
    expect(parseSatelliteCatalog(JSON.parse(service.response()!.json.toString()))?.groups.map((g) => g.status)).toEqual(['pending', 'pending']);
    // Stations first, then weather a few seconds later: one timer at a time, never two downloads at once.
    expect(timers).toHaveLength(1);
    timers.shift()!.fn();
    await settle();
    expect(asked).toEqual(['stations']);
    const response = service.response()!;
    const catalog = parseSatelliteCatalog(JSON.parse(zlib.gunzipSync(response.gzip!).toString()))!;
    expect(catalog.groups[0]).toMatchObject({ group: 'stations', status: 'ok', fetchedAt: FETCHED });
    expect(catalog.groups[0]!.satellites).toHaveLength(5);
    expect(response.etag).toMatch(/^W\/"sat-/);
    expect(timers).toHaveLength(1);
  });

  it('keeps a downloaded group on disk, so a restart does not download it again', async () => {
    const first = setup(() => new Response(STATIONS), { groups: ['stations'] });
    await first.service.start();
    first.timers.shift()!.fn();
    await settle();
    expect(loadGroup(first.cacheDir, 'stations')?.satellites).toHaveLength(5);

    const again = setup(() => new Response(STATIONS), { groups: ['stations'], cacheDir: first.cacheDir });
    again.advance(HOUR);
    await again.service.start();
    expect(again.asked).toEqual([]);
    // Next due when the saved copy turns six hours old, not now.
    expect(again.timers[0]!.ms).toBe(5 * HOUR);
    expect(again.service.health()).toMatchObject({ stations: { satellites: 5, status: 'ok' } });
  });

  it('keeps the copy it has after a refusal, waits at least two hours, and stops after repeated refusals', async () => {
    let refuse = false;
    const { service, timers, advance } = setup(
      () => (refuse ? new Response('GP data has not updated since your last successful download', { status: 403 }) : new Response(STATIONS)),
      { groups: ['stations'] },
    );
    await service.start();
    timers.shift()!.fn();
    await settle();
    refuse = true;
    for (let i = 1; i <= MAX_REFUSALS; i++) {
      const timer = timers.shift()!;
      expect(timer.ms).toBeGreaterThanOrEqual(i === 1 ? 6 * HOUR : MIN_REFRESH_MS);
      advance(timer.ms);
      timer.fn();
      await settle();
      expect(service.state('stations').satellites).toHaveLength(5);
    }
    // Repeating a refused request won't change the answer: no timer is left, and the log says so.
    expect(timers).toHaveLength(0);
    expect(service.health()).toMatchObject({ stations: { status: 'failing', nextAttemptAt: 'stopped' } });
    expect(String(service.state('stations').lastError)).toContain('HTTP 403');
  });

  it('retries sooner when CelesTrak never answered, backing off', async () => {
    const { service, timers, advance } = setup(
      () => {
        throw new Error('getaddrinfo ENOTFOUND celestrak.org');
      },
      { groups: ['stations'] },
    );
    await service.start();
    timers.shift()!.fn();
    await settle();
    const first = timers.shift()!;
    expect(first.ms).toBe(15 * 60_000);
    advance(first.ms);
    first.fn();
    await settle();
    expect(timers.shift()!.ms).toBe(30 * 60_000);
    expect(service.health()).toMatchObject({ stations: { status: 'failing', satellites: 0 } });
  });

  it('never follows a redirect, which CelesTrak counts as an error', async () => {
    const { service, timers } = setup(() => new Response(null, { status: 301, headers: { location: 'https://celestrak.org/' } }), {
      groups: ['stations'],
    });
    await service.start();
    timers.shift()!.fn();
    await settle();
    expect(service.state('stations').refusals).toBe(1);
  });
});

/** Lets the download's awaits (fetch, body, file writes, gzip) finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 5));
}
