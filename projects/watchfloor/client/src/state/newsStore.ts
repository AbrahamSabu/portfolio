import type { NewsItem, NewsMessage } from '@watchfloor/shared';

/** As long as the server keeps them (newsService.ts KEEP_MS). */
const KEEP_MS = 24 * 3_600_000;

type Listener = (added: readonly NewsItem[]) => void;

/**
 * The day's news stories in the browser, newest first. The server sends all
 * of them after the snapshot (replacing what's here, so a reconnect can't
 * double them), then each new batch's. Listeners hear which stories are new:
 * none after a replace, because a page opening or reconnecting isn't news.
 */
export class NewsStore {
  private stories: NewsItem[] = [];
  private readonly byId = new Map<string, NewsItem>();
  private readonly listeners = new Set<Listener>();

  apply(message: Pick<NewsMessage, 'items' | 'replace'>, now: number): void {
    const cutoff = now - KEEP_MS;
    let added: NewsItem[] = [];
    if (message.replace) {
      this.stories = message.items.filter((s) => s.publishedAt >= cutoff);
    } else {
      added = message.items.filter((s) => !this.byId.has(s.id) && s.publishedAt >= cutoff);
      // Stable: within a batch the server's order (most political first) stays.
      this.stories = [...added, ...this.stories.filter((s) => s.publishedAt >= cutoff)].sort((a, b) => b.publishedAt - a.publishedAt);
    }
    this.byId.clear();
    for (const s of this.stories) this.byId.set(s.id, s);
    for (const listener of this.listeners) listener(added);
  }

  get items(): readonly NewsItem[] {
    return this.stories;
  }

  get(id: string): NewsItem | undefined {
    return this.byId.get(id);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Whether news shows at all (N key), and whether new stories are read aloud. Off by default, read-aloud especially. */
export interface NewsSettingsState {
  shown: boolean;
  voice: boolean;
}

const STORAGE_KEY = 'watchfloor.news';

export function loadNewsSettings(): NewsSettingsState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<keyof NewsSettingsState, unknown>>;
    return { shown: raw.shown !== false, voice: raw.voice === true };
  } catch {
    return { shown: true, voice: false };
  }
}

export class NewsSettings {
  private readonly listeners = new Set<() => void>();

  constructor(private current: NewsSettingsState) {}

  get shown(): boolean {
    return this.current.shown;
  }

  get voice(): boolean {
    return this.current.voice;
  }

  set(change: Partial<NewsSettingsState>): void {
    this.current = { ...this.current, ...change };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      // Private browsing: the setting just isn't remembered.
    }
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
