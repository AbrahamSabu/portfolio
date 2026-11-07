import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SatelliteCatalog } from '@watchfloor/shared';
import { DemoCatalog } from './demoCatalog';

const STATIONS: unknown = JSON.parse(readFileSync(new URL('../../../server/src/space/fixtures/stations-2026-11-06.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
const HOUR = 3_600_000;

/** The Cache API, as far as the demo uses it. */
function memoryCache(): Cache {
  const kept = new Map<string, string>();
  return {
    async match(url: string) {
      const body = kept.get(url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(url: string, res: Response) {
      kept.set(url, await res.text());
    },
  } as unknown as Cache;
}

/** CelesTrak, answering every group with the stations fixture, or with the status given for a group. */
function celestrak(statusFor: (group: string) => number = () => 200) {
  const asked: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const group = new URL(url).searchParams.get('GROUP')!;
    asked.push(group);
    inits.push(init);
    const status = statusFor(group);
    return status === 200 ? new Response(JSON.stringify(STATIONS), { status }) : new Response('', { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked, inits };
}

/** One visit to the demo page: loads, then leaves (no 2-hour timer left behind). */
async function visit(fetch: typeof globalThis.fetch, cache: Cache | null, now: number) {
  const catalogs: SatelliteCatalog[] = [];
  const catalog = new DemoCatalog((c) => catalogs.push(c), () => {}, { fetch, openCache: async () => cache, now: () => now });
  await catalog.start();
  catalog.stop();
  return { status: catalog.status, last: catalogs.at(-1) };
}

describe("the demo's satellites, from CelesTrak in the visitor's browser", () => {
  it('downloads each group once, small ones first, never following a redirect', async () => {
    const service = celestrak();
    const { status, last } = await visit(service.fetch, memoryCache(), NOW);
    expect(service.asked).toEqual(['stations', 'weather', 'starlink']);
    expect(service.inits.every((init) => init?.redirect === 'manual')).toBe(true);
    expect(status).toBe('ready');
    expect(last!.groups.map((g) => [g.group, g.status, g.satellites.length > 0])).toEqual([
      ['stations', 'ok', true],
      ['weather', 'ok', true],
      ['starlink', 'ok', true],
    ]);
  });

  it("serves a reload within 2 hours from the visitor's copy, and downloads again after CelesTrak updates", async () => {
    const cache = memoryCache();
    const first = await visit(celestrak().fetch, cache, NOW);
    const reload = celestrak();
    const second = await visit(reload.fetch, cache, NOW + HOUR);
    expect(reload.asked).toEqual([]);
    expect(second.last!.groups[0]!.satellites).toEqual(first.last!.groups[0]!.satellites);
    const later = celestrak();
    await visit(later.fetch, cache, NOW + 3 * HOUR);
    expect(later.asked).toEqual(['stations', 'weather', 'starlink']);
  });

  it("keeps the visitor's older copy when CelesTrak refuses, and says a group with none is failing", async () => {
    const cache = memoryCache();
    await visit(celestrak().fetch, cache, NOW);
    const refusing = celestrak((group) => (group === 'starlink' ? 403 : 200));
    const { status, last } = await visit(refusing.fetch, cache, NOW + 3 * HOUR);
    expect(status).toBe('ready');
    expect(last!.groups[2]!.satellites.length).toBeGreaterThan(0); // the copy from the first visit
    const fresh = await visit(celestrak((group) => (group === 'starlink' ? 403 : 200)).fetch, memoryCache(), NOW);
    expect(fresh.last!.groups[2]).toMatchObject({ group: 'starlink', status: 'failing', satellites: [] });
  });

  it('downloads nothing without the Cache API, since it could not keep to one download per update', async () => {
    const service = celestrak();
    const { status } = await visit(service.fetch, null, NOW);
    expect(service.asked).toEqual([]);
    expect(status).toBe('unavailable');
  });

  it('says unavailable when CelesTrak refuses everything and there is no copy', async () => {
    const { status, last } = await visit(celestrak(() => 503).fetch, memoryCache(), NOW);
    expect(status).toBe('unavailable');
    expect(last).toBeUndefined();
  });
});
