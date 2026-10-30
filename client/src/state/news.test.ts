import type { NewsItem } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { NewsRotation } from './newsRotation';
import { NewsStore } from './newsStore';

const NOW = Date.UTC(2026, 9, 30, 12, 20);
const story = (id: string, minutesAgo: number, lon = 0): NewsItem => ({
  id,
  headline: `Story ${id} about the government`,
  url: `https://example.org/${id}`,
  outlet: 'example.org',
  lat: 50,
  lon,
  place: 'Somewhere, Country',
  kind: 'politics',
  publishedAt: NOW - minutesAgo * 60_000,
});

describe('NewsStore', () => {
  it('replaces on connect, adds batches newest first, and only calls added stories new', () => {
    const store = new NewsStore();
    const heard: string[][] = [];
    store.subscribe((added) => heard.push(added.map((s) => s.id)));
    store.apply({ replace: true, items: [story('b', 20), story('a', 35), story('old', 25 * 60)] }, NOW);
    store.apply({ replace: false, items: [story('c', 5), story('d', 5), story('b', 20)] }, NOW);
    expect(store.items.map((s) => s.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(heard).toEqual([[], ['c', 'd']]);
    expect(store.get('a')?.id).toBe('a');

    // A reconnect replaces everything, so nothing doubles.
    store.apply({ replace: true, items: [story('c', 5)] }, NOW);
    expect(store.items.map((s) => s.id)).toEqual(['c']);
    expect(store.get('a')).toBeUndefined();
  });
});

describe('NewsRotation', () => {
  const everywhere = () => true;

  it('shows new stories first, then cycles through the last two hours', () => {
    const stories = [story('new1', 2), story('new2', 2), story('r1', 30), story('r2', 90), story('stale', 180)];
    const rotation = new NewsRotation();
    rotation.enqueue([stories[0]!, stories[1]!]);
    const shown = Array.from({ length: 7 }, () => rotation.next(stories, NOW, everywhere)?.id);
    expect(shown).toEqual(['new1', 'new2', 'new1', 'new2', 'r1', 'r2', 'new1']);
  });

  it('skips stories off screen, keeping new ones queued until they come into view', () => {
    const stories = [story('east', 2, 100), story('west', 2, -100)];
    const rotation = new NewsRotation();
    rotation.enqueue(stories);
    const west = (s: NewsItem) => s.lon < 0;
    expect(rotation.next(stories, NOW, west)?.id).toBe('west');
    expect(rotation.next(stories, NOW, everywhere)?.id).toBe('east');
    expect(rotation.next([], NOW, everywhere)).toBeNull();
  });
});
