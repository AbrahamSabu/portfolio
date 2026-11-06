import path from 'node:path';
import { loadNews, NewsService, saveNews, type SavedNews } from '../news/newsService';

/**
 * The static demo's news: the day's political stories from GDELT, read by
 * the server's own news code and written where the demo build serves them.
 *
 *   npm run demo-news                      (then npm run build:demo)
 *   npm run demo-news -- --out <file> [--seed <saved news>]
 *
 * Stories are real and their times are when they were published: the demo
 * simulates traffic, never news. Only batches not already in hand are read:
 * those in the file this wrote last time, or in the seed (by default the
 * live server's saved news, .cache/news.json). So beside a running server a
 * run takes seconds; from nothing, a day's 96 batches take about 16 minutes,
 * because GDELT asks for 5 seconds between requests.
 */
const DEFAULT_OUT = path.resolve('../client/public-demo/news.json');
const DEFAULT_SEED = path.resolve('../.cache/news.json');
/** A day of 15-minute batches. */
const DAY_OF_BATCHES = 96;

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function merge(...sources: (SavedNews | null)[]): SavedNews | null {
  const present = sources.filter((s): s is SavedNews => s !== null);
  if (!present.length) return null;
  // NewsService drops repeats (by id, link or headline) as it takes them in.
  return { stamps: [...new Set(present.flatMap((s) => s.stamps))], items: present.flatMap((s) => s.items) };
}

async function main(): Promise<void> {
  const out = path.resolve(arg('--out') ?? DEFAULT_OUT);
  const seed = path.resolve(arg('--seed') ?? DEFAULT_SEED);
  const news = new NewsService({ saved: merge(loadNews(out), loadNews(seed)), backfill: DAY_OF_BATCHES });
  await news.check();
  // check() books the next round, as a server wants; one round is all this needs.
  news.stop();
  const saved = news.toSaved();
  const { lastError } = news.health();
  if (lastError) console.warn(`GDELT: ${String(lastError)}`);
  // An empty day means something is wrong; keep whatever the demo had.
  if (!saved.items.length) throw new Error('No stories; file not written.');
  await saveNews(out, saved);
  const newest = new Date(saved.items[0]!.publishedAt).toISOString();
  console.log(`Wrote ${saved.items.length} stories from ${saved.stamps.length} batches (newest ${newest}) to ${out}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
