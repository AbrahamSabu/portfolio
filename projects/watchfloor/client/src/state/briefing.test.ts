import type { NewsItem } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { briefing } from './briefing';

const NOW = Date.UTC(2026, 9, 31, 12, 0);
const story = (id: string, headline: string, importance: number, hoursAgo = 0, place = 'Paris, France'): NewsItem => ({
  id,
  headline,
  url: `https://example.org/${id}`,
  outlet: 'example.org',
  lat: 48.85,
  lon: 2.35,
  place,
  kind: 'politics',
  publishedAt: NOW - hoursAgo * 3_600_000,
  importance,
});

describe('briefing', () => {
  it('lists the most important of the last six hours first', () => {
    const list = briefing(
      [
        story('a', 'Senate passes budget after long night', 20),
        story('b', 'Coalition talks collapse in Berlin', 30, 1, 'Berlin, Germany'),
        story('c', 'Old news from yesterday morning about tariffs', 60, 7),
      ],
      NOW,
    );
    expect(list.map((e) => e.story.id)).toEqual(['b', 'a']);
  });

  it('lists a story told more than once once, ranked up for it', () => {
    const list = briefing(
      [
        story('lone', 'Minister resigns over procurement scandal', 26, 0, 'Madrid, Spain'),
        story('t1', 'Ceasefire talks resume in Cairo with Hamas delegation', 22, 0, 'Cairo, Egypt'),
        story('t2', 'Hamas delegation arrives in Cairo for ceasefire talks', 20, 1, 'Cairo, Egypt'),
        story('t3', 'Egypt hosts ceasefire talks as delegation lands in Cairo', 18, 2, 'Cairo, Egypt'),
      ],
      NOW,
    );
    expect(list).toEqual([
      { story: expect.objectContaining({ id: 't1' }), related: 2 },
      { story: expect.objectContaining({ id: 'lone' }), related: 0 },
    ]);
  });

  it("doesn't group stories that only share their place, or a word or two of long headlines", () => {
    const list = briefing(
      [
        story('a', 'Delhi minister files nomination for Rajya Sabha seat', 20, 0, 'Delhi, India'),
        story('b', 'Delhi leaders pay floral tributes to Patel on birth anniversary', 20, 0, 'Delhi, India'),
        story('c', 'Election officials count postal votes slowly across northern Lagos districts', 20, 0, 'Lagos, Nigeria'),
        story('d', 'Election officials resign in Lima', 20, 0, 'Lima, Peru'),
      ],
      NOW,
    );
    expect(list).toHaveLength(4);
  });

  it('prefers newer when equally important, treats a missing importance as 0, and keeps to the size', () => {
    const topics = ['Budget', 'Tariffs', 'Strike', 'Border', 'Summit', 'Census', 'Refinery', 'Drought', 'Pension', 'Harbour', 'Satellite', 'Railway'];
    const items = topics.map((t, i) => story(`s${i}`, `${t} dispute`, 10, i * 0.25));
    items.push({ ...story('old-file', 'Story saved before importance existed', 0), importance: undefined });
    const list = briefing(items, NOW);
    expect(list).toHaveLength(8);
    expect(list[0]!.story.id).toBe('s0');
    expect(list.some((e) => e.story.id === 'old-file')).toBe(false);
  });
});
