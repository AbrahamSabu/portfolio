import type { NewsItem } from '@watchfloor/shared';

/** The briefing covers this much of the day. */
export const BRIEFING_WINDOW_MS = 6 * 3_600_000;
export const BRIEFING_SIZE = 8;

export interface BriefingEntry {
  story: NewsItem;
  /** Other stories in the window about the same thing (left out of the list). */
  related: number;
}

/** Words too common in headlines to say two are about the same thing. */
const COMMON = new Set(
  'about after against amid back been biggest calls could from have into just more most news over plan said says than that their them they this what when will with would year years week first last ahead'.split(' '),
);

/** A headline's telling words: four letters or more, lower case. */
function wordsOf(headline: string): Set<string> {
  const words = headline.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return new Set(words.filter((w) => !COMMON.has(w)));
}

interface Scored {
  story: NewsItem;
  words: Set<string>;
  rank: number;
}

/**
 * Same story, told twice: at least three telling words in common, and they
 * make up much of the shorter headline. Place names don't count: two Delhi
 * stories both saying "Delhi" aren't the same story (measured: they were
 * grouped five at a time before this).
 */
function sameStory(a: Scored, b: Scored): boolean {
  let shared = 0;
  for (const w of a.words) if (b.words.has(w)) shared++;
  return shared >= 3 && shared / Math.min(a.words.size, b.words.size) >= 0.4;
}

/** A headline's telling words, less those naming the story's own place. */
function storyWords(story: NewsItem): Set<string> {
  const place = wordsOf(story.place);
  return new Set([...wordsOf(story.headline)].filter((w) => !place.has(w)));
}

/**
 * The top stories of the last six hours, for the briefing. Each story's
 * own weight is its importance (how widely covered, how political) less a
 * little for age; then stories about the same thing are grouped, the
 * weightiest telling it, and a group gains weight with every retelling (a
 * story that keeps coming back across batches matters). Headlines are
 * never merged or rewritten: the list shows one outlet's own words.
 */
export function briefing(items: readonly NewsItem[], now: number, size = BRIEFING_SIZE, windowMs = BRIEFING_WINDOW_MS): BriefingEntry[] {
  const scored: Scored[] = items
    .filter((s) => now - s.publishedAt <= windowMs && s.publishedAt <= now + 60_000)
    .map((story) => ({
      story,
      words: storyWords(story),
      rank: (story.importance ?? 0) - 2 * (Math.max(0, now - story.publishedAt) / 3_600_000),
    }))
    .sort((a, b) => b.rank - a.rank || b.story.publishedAt - a.story.publishedAt);

  const groups: { lead: Scored; size: number }[] = [];
  for (const s of scored) {
    const group = groups.find((g) => sameStory(g.lead, s));
    if (group) group.size++;
    else groups.push({ lead: s, size: 1 });
  }
  return groups
    .map((g) => ({ g, weight: g.lead.rank + 6 * Math.log2(g.size) }))
    .sort((a, b) => b.weight - a.weight || b.g.lead.story.publishedAt - a.g.lead.story.publishedAt)
    .slice(0, size)
    .map(({ g }) => ({ story: g.lead.story, related: g.size - 1 }));
}
