import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NewsItem } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { loadNews, NewsService, saveNews } from './newsService';

const fixture = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const NOW = Date.UTC(2026, 9, 30, 12, 20);
const LAST_UPDATE = '73139 0524 http://data.gdeltproject.org/gdeltv2/20261030121500.export.CSV.zip\n';

/** GDELT with one batch (12:15); earlier batches 404 unless listed in `fail`. */
function fakeGdelt(fail: string[] = []) {
  const asked: string[] = [];
  const fetch = (async (url: string) => {
    const name = url.slice(url.lastIndexOf('/') + 1);
    asked.push(name);
    if (fail.some((f) => name.startsWith(f))) return new Response('busy', { status: 503 });
    if (name === 'lastupdate.txt') return new Response(LAST_UPDATE);
    if (name.startsWith('20261030121500.')) return new Response(fixture(name));
    return new Response('not found', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, asked };
}

/** Request gaps run at once (and are recorded); the next round is held. */
function fakeTimers() {
  const gaps: number[] = [];
  const held: number[] = [];
  const setTimer = (fn: () => void, ms: number) => {
    if (ms <= 5_000) {
      gaps.push(ms);
      queueMicrotask(fn);
    } else held.push(ms);
    return 0;
  };
  return { gaps, held, setTimer };
}

describe('NewsService', () => {
  it('reads the newest batch and the ones before it, politely', async () => {
    const gdelt = fakeGdelt();
    const timers = fakeTimers();
    const added: NewsItem[][] = [];
    const news = new NewsService({ fetch: gdelt.fetch, now: () => NOW, setTimer: timers.setTimer, backfill: 2, onStories: (s) => added.push(s) });
    await news.check();
    expect(gdelt.asked).toEqual([
      'lastupdate.txt',
      '20261030121500.export.CSV.zip',
      '20261030121500.gkg.csv.zip',
      '20261030120000.export.CSV.zip', // 404s: tried again next round
      '20261030114500.export.CSV.zip',
    ]);
    // Every request after the first waited for the gap (the fake clock stands still).
    expect(timers.gaps).toEqual([5_000, 5_000, 5_000, 5_000]);
    expect(news.items()).toHaveLength(6);
    expect(added).toEqual([news.items()]);
    expect(timers.held).toEqual([3 * 60_000]);

    gdelt.asked.length = 0;
    await news.check();
    expect(gdelt.asked).toEqual(['lastupdate.txt', '20261030120000.export.CSV.zip', '20261030114500.export.CSV.zip']);
  });

  it('gives up on a batch still missing an hour after a newer one', async () => {
    const gdelt = fakeGdelt();
    const news = new NewsService({ fetch: gdelt.fetch, now: () => NOW, setTimer: fakeTimers().setTimer, backfill: 5 });
    await news.check();
    gdelt.asked.length = 0;
    await news.check();
    // 12:00 to 11:15 are retried; 11:00 (75 minutes before 12:15) was given up.
    expect(gdelt.asked).toEqual(['lastupdate.txt', ...['1200', '1145', '1130', '1115'].map((t) => `20261030${t}00.export.CSV.zip`)]);
  });

  it('backs off when GDELT fails, and tries the batch again', async () => {
    const gdelt = fakeGdelt(['20261030121500.gkg']);
    const timers = fakeTimers();
    const news = new NewsService({ fetch: gdelt.fetch, now: () => NOW, setTimer: timers.setTimer, backfill: 0, random: () => 1 });
    await news.check();
    expect(news.items()).toHaveLength(0);
    expect(news.health()).toMatchObject({ lastError: 'HTTP 503 for 20261030121500.gkg.csv.zip' });
    expect(timers.held).toEqual([3 * 60_000]); // backoff starts below the regular check, which wins
    expect(news.toSaved().stamps).toEqual([]);
  });

  it('restores saved stories, drops those over a day old, and skips batches already read', async () => {
    const gdelt = fakeGdelt();
    const timers = fakeTimers();
    const first = new NewsService({ fetch: gdelt.fetch, now: () => NOW, setTimer: timers.setTimer, backfill: 0 });
    await first.check();
    const saved = first.toSaved();
    expect(saved.stamps).toEqual(['20261030121500']);
    const old = { ...saved.items[0]!, id: 'old', url: 'https://example.org/old', headline: 'An old story about something', publishedAt: NOW - 25 * 3_600_000 };

    gdelt.asked.length = 0;
    const second = new NewsService({ fetch: gdelt.fetch, now: () => NOW, setTimer: timers.setTimer, backfill: 0, saved: { ...saved, items: [...saved.items, old] } });
    expect(second.items()).toEqual(saved.items);
    await second.check();
    expect(gdelt.asked).toEqual(['lastupdate.txt']);
  });
});

describe('saved news file', () => {
  it('round-trips, and drops anything malformed', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-news-')), 'news.json');
    const item: NewsItem = {
      id: '1',
      headline: 'Parliament passes the budget',
      url: 'https://example.org/a',
      outlet: 'example.org',
      lat: 51.5,
      lon: -0.12,
      place: 'London, United Kingdom',
      kind: 'politics',
      publishedAt: NOW,
    };
    await saveNews(file, { stamps: ['20261030121500'], items: [item] });
    expect(loadNews(file)).toEqual({ stamps: ['20261030121500'], items: [item] });

    fs.writeFileSync(file, JSON.stringify({ version: 1, stamps: ['x', '20261030121500'], items: [item, { ...item, url: 'javascript:alert(1)' }, { ...item, kind: 'gossip' }] }));
    expect(loadNews(file)).toEqual({ stamps: ['20261030121500'], items: [item] });
    expect(loadNews(path.join(path.dirname(file), 'missing.json'))).toBeNull();
  });
});
