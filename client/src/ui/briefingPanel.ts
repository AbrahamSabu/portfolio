import type { NewsItem } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import { NEWS_KIND_LABEL, newsIconSvg } from '../map/newsIcons';
import { briefing } from '../state/briefing';
import type { NewsSettings, NewsStore } from '../state/newsStore';
import type { Selection } from '../state/selection';
import type { StoredToggle } from '../state/storedToggle';
import { formatAge, formatNewsPlace, formatNewsTime } from './format';

/** Ages and the six-hour window move on even when no batch arrives. */
const REFRESH_MS = 60_000;

/**
 * The briefing: the last six hours' top political stories in a panel on
 * the right, most important first (`state/briefing.ts`). Choosing one flies
 * the map there and opens its card. The operator can close it (×, the B
 * key or the top bar button bring it back; the choice is remembered). It
 * steps aside while a track's details have the right side, and goes with
 * the rest of the news when news is turned off.
 */
export class BriefingPanel {
  private readonly list: HTMLOListElement;
  private readonly empty: HTMLElement;
  private signature = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    private readonly news: NewsStore,
    private readonly settings: NewsSettings,
    private readonly open: StoredToggle,
    private readonly selection: Selection,
    private readonly now: () => number,
    private readonly onPick: (id: string) => void,
  ) {
    this.list = root.querySelector('[data-list]')!;
    this.empty = root.querySelector('[data-empty]')!;
    root.querySelector('[data-close]')!.addEventListener('click', () => open.set(false));
    this.list.addEventListener('click', (event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id;
      const story = id ? news.get(id) : undefined;
      if (story) this.pick(story);
    });
    news.subscribe(() => this.render());
    settings.subscribe(() => this.applyVisibility());
    open.subscribe(() => this.applyVisibility());
    selection.subscribe(() => this.applyVisibility());
    window.setInterval(() => this.render(), REFRESH_MS);
    this.applyVisibility();
    this.render();
  }

  private applyVisibility(): void {
    const visible = this.open.value && this.settings.shown && !this.selection.id;
    if (this.root.hidden === !visible) return;
    this.root.hidden = !visible;
    if (visible) this.render();
  }

  /** Centre the story (closer in, if the globe is far out) and open its card. */
  private pick(story: NewsItem): void {
    fly(this.map, { center: [story.lon, story.lat], zoom: Math.max(this.map.getZoom(), 3.5) });
    this.onPick(story.id);
  }

  private render(): void {
    if (this.root.hidden) return;
    const now = this.now();
    const entries = briefing(this.news.items, now);
    // Rebuilt only when something shown changes (a minute's ages, a new batch).
    const signature = entries.map((e) => `${e.story.id}:${e.related}:${Math.floor((now - e.story.publishedAt) / 60_000)}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    this.empty.hidden = entries.length > 0;
    this.list.replaceChildren(
      ...entries.map(({ story, related }, i) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'briefing-item';
        button.dataset.id = story.id;

        const rank = document.createElement('span');
        rank.className = 'briefing-rank';
        rank.textContent = String(i + 1).padStart(2, '0');

        const head = document.createElement('span');
        head.className = 'briefing-item-head';
        const icon = document.createElement('span');
        icon.className = 'briefing-icon';
        icon.innerHTML = newsIconSvg(story.kind, 12); // fixed markup, no story text
        icon.title = NEWS_KIND_LABEL[story.kind];
        const place = document.createElement('span');
        place.className = 'briefing-place';
        place.textContent = formatNewsPlace(story.place);
        head.append(icon, place);

        const headline = document.createElement('span');
        headline.className = 'briefing-headline';
        headline.textContent = story.headline;

        const meta = document.createElement('span');
        meta.className = 'briefing-meta';
        const parts = [`${formatNewsTime(story.publishedAt)} · ${formatAge(Math.max(0, now - story.publishedAt))}`, story.outlet];
        if (related > 0) parts.push(`+${related} related`);
        meta.textContent = parts.join(' · ');

        button.append(rank, head, headline, meta);
        item.append(button);
        return item;
      }),
    );
  }
}
