import fs from 'node:fs';
import type { Hazard } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { HazardService } from './hazardService';

const body = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function setup(responses: Record<string, () => Response>) {
  const timers: { fn: () => void; ms: number }[] = [];
  const changes: Hazard[][] = [];
  const service = new HazardService({
    fetch: (async (url: string) => {
      const key = Object.keys(responses).find((k) => url.includes(k));
      return responses[key!]!();
    }) as unknown as typeof fetch,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => {},
    random: () => 0.5,
    onChange: (items) => changes.push(items),
  });
  return { service, timers, changes };
}

describe('HazardService', () => {
  it('merges both sources and reports a change only when the list changes', async () => {
    const { service, changes } = setup({
      usgs: () => new Response(body('usgs-2.5_day-2026-10-31.json')),
      // GDACS really does start with a byte-order mark.
      gdacs: () => new Response('﻿' + body('gdacs-events4app-2026-10-31.json')),
    });
    await service.poll(service.source('usgs'));
    await service.poll(service.source('gdacs'));
    await service.poll(service.source('usgs'));
    expect(changes).toHaveLength(2);
    // Three USGS quakes and GDACS's cyclone, flood and fire; its quake isn't shown twice.
    expect(service.items()).toHaveLength(6);
    expect(service.health()).toMatchObject({ usgs: { items: 3, lastError: null }, gdacs: { items: 4, lastError: null } });
  });

  it('keeps the last list on a failure and waits longer before trying again', async () => {
    let fail = false;
    const { service, timers } = setup({
      usgs: () => (fail ? new Response('down', { status: 503 }) : new Response(body('usgs-2.5_day-2026-10-31.json'))),
    });
    await service.poll(service.source('usgs'));
    fail = true;
    await service.poll(service.source('usgs'));
    expect(service.items()).toHaveLength(3);
    expect(service.health()).toMatchObject({ usgs: { lastError: 'HTTP 503' } });
    expect(timers.at(-1)!.ms).toBeGreaterThanOrEqual(2 * 60_000);
  });
});
