import type { NewsItem } from '@watchfloor/shared';

/** Once the new stories have been shown, keep cycling through those this recent. */
export const RECENT_MS = 2 * 3_600_000;

/**
 * Which story pops up next. New stories come first, in the order they came
 * (most political first within a batch); when none are waiting, it cycles
 * through the last two hours, newest first, so there is always something
 * on screen. Only stories the map shows (`inView`) are picked; ones off
 * screen wait in the queue and are still in the ticker.
 */
export class NewsRotation {
  private readonly queue: string[] = [];
  /** The recent story shown last, to carry on after it. */
  private lastRecent: string | undefined;

  /** Newly arrived stories, to be shown before anything else. */
  enqueue(stories: readonly NewsItem[]): void {
    for (const s of stories) if (!this.queue.includes(s.id)) this.queue.push(s.id);
  }

  next(stories: readonly NewsItem[], now: number, inView: (story: NewsItem) => boolean): NewsItem | null {
    const byId = new Map(stories.map((s) => [s.id, s]));
    // Drop queued stories that are gone; take the first one in view.
    for (let i = this.queue.length - 1; i >= 0; i--) if (!byId.has(this.queue[i]!)) this.queue.splice(i, 1);
    const queued = this.queue.findIndex((id) => inView(byId.get(id)!));
    if (queued >= 0) return byId.get(this.queue.splice(queued, 1)[0]!)!;

    const recent = stories.filter((s) => now - s.publishedAt <= RECENT_MS && inView(s));
    if (recent.length === 0) return null;
    const after = recent.findIndex((s) => s.id === this.lastRecent);
    const story = recent[(after + 1) % recent.length]!;
    this.lastRecent = story.id;
    return story;
  }
}
