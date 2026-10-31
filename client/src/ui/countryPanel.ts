import type { Map as MapLibreMap } from 'maplibre-gl';
import { HAZARD_KIND_LABEL } from '../map/hazardIcons';
import { NEWS_KIND_LABEL, newsIconSvg } from '../map/newsIcons';
import { countryBriefing } from '../state/countryBriefing';
import type { ServerClock } from '../state/clock';
import type { HazardStore } from '../state/hazards';
import type { NewsStore } from '../state/newsStore';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatAge, formatNewsTime } from './format';

const REFRESH_MS = 5_000;
/** The basemap's country names: clicking one opens its briefing. */
const LABEL_LAYERS = ['place_country_1', 'place_country_2'];
const HIT_PX = 6;

/**
 * A country at a glance, opened by clicking its name on the map: the day's
 * news placed there, its aircraft and ships on the map (by registration and
 * flag, so not necessarily over it), and hazards that name it. Shares the
 * right side with the briefing and the airport panel.
 */
export class CountryPanel {
  private country: string | null = null;
  private timer: number | undefined;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly news: NewsStore,
    private readonly hazards: HazardStore,
    private readonly clock: ServerClock,
    private readonly selection: Selection,
    private readonly openStory: (id: string) => void,
    private readonly openHazard: (id: string) => void,
  ) {
    this.title = root.querySelector('[data-field="name"]')!;
    this.body = root.querySelector('[data-field="body"]')!;
    root.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.body.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-story], [data-hazard]');
      if (target?.dataset.story) this.openStory(target.dataset.story);
      if (target?.dataset.hazard) this.openHazard(target.dataset.hazard);
    });
    selection.subscribe(() => {
      if (selection.id) this.close();
    });
    news.subscribe(() => this.render());
  }

  get isOpen(): boolean {
    return this.country !== null;
  }

  /** The country whose name label is under a point, if any. */
  countryAt(point: { x: number; y: number }): string | undefined {
    const layers = LABEL_LAYERS.filter((l) => this.map.getLayer(l));
    if (layers.length === 0) return undefined;
    const box: [[number, number], [number, number]] = [[point.x - HIT_PX, point.y - HIT_PX], [point.x + HIT_PX, point.y + HIT_PX]];
    const props = this.map.queryRenderedFeatures(box, { layers })[0]?.properties;
    const name = props?.['name:en'] ?? props?.name;
    return typeof name === 'string' && name ? name : undefined;
  }

  open(country: string): void {
    this.selection.select(null);
    this.country = country;
    this.title.textContent = country;
    this.root.hidden = false;
    document.querySelector('.app')?.classList.add('country-open');
    this.render();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(), REFRESH_MS);
  }

  close(): void {
    if (!this.country) return;
    this.country = null;
    this.root.hidden = true;
    document.querySelector('.app')?.classList.remove('country-open');
    window.clearInterval(this.timer);
  }

  private render(): void {
    if (!this.country) return;
    const now = this.clock.now();
    const b = countryBriefing(this.country, { news: this.news.items, tracks: this.store.all(), hazards: this.hazards.items, now });
    const parts: HTMLElement[] = [];

    parts.push(heading('On the map now'));
    const facts = document.createElement('dl');
    facts.className = 'airport-rows';
    facts.append(
      el('dt', '', 'Aircraft'),
      el('dd', '', b.aircraft === 0 ? 'None registered here' : `${b.aircraft} registered here${b.militaryAircraft ? `, ${b.militaryAircraft} military` : ''}`),
      el('dt', '', 'Ships'),
      el('dd', '', b.ships === 0 ? 'None flying its flag' : `${b.ships} flying its flag`),
    );
    parts.push(facts, el('p', 'airport-credit', 'By registration and flag, not position: they may be anywhere in the world.'));

    parts.push(heading(`News · ${b.storyCount} in the last 24 h`));
    if (b.stories.length === 0) parts.push(el('p', 'airport-muted', 'No stories placed here today.'));
    else {
      const list = document.createElement('ol');
      list.className = 'briefing-list country-list';
      for (const { story, related } of b.stories) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'briefing-item';
        button.dataset.story = story.id;
        const icon = el('span', 'briefing-icon', '');
        icon.innerHTML = newsIconSvg(story.kind, 12); // fixed markup
        icon.title = NEWS_KIND_LABEL[story.kind];
        const meta = [`${formatNewsTime(story.publishedAt)} · ${formatAge(Math.max(0, now - story.publishedAt))}`, story.outlet];
        if (related > 0) meta.push(`+${related} related`);
        button.append(icon, el('span', 'briefing-headline', story.headline), el('span', 'briefing-meta', meta.join(' · ')));
        const item = document.createElement('li');
        item.append(button);
        list.append(item);
      }
      parts.push(list);
    }

    if (b.hazards.length > 0) {
      parts.push(heading('Earthquakes and disasters'));
      const list = document.createElement('ul');
      list.className = 'airport-traffic';
      for (const h of b.hazards.slice(0, 5)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.hazard = h.id;
        button.append(el('span', '', h.title), el('span', 'airport-muted', HAZARD_KIND_LABEL[h.kind]));
        const item = document.createElement('li');
        item.append(button);
        list.append(item);
      }
      parts.push(list);
    }
    this.body.replaceChildren(...parts);
  }
}

function heading(text: string): HTMLElement {
  return el('h3', 'airport-heading', text);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}
