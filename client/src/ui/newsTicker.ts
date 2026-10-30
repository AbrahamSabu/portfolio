import type { NewsItem } from '@watchfloor/shared';
import { newsIconSvg, NEWS_KIND_LABEL } from '../map/newsIcons';
import type { NewsSettings, NewsStore } from '../state/newsStore';
import { formatNewsPlace, formatNewsTime } from './format';
import { speak } from './voice';

/** The newest this many stories run in the ticker. */
const TICKER_STORIES = 30;
/** Scrolling speed, slow enough to read a headline as it passes. */
const PX_PER_S = 55;
/** With reduced motion the ticker steps instead of scrolling. */
const STEP_MS = 8_000;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The news band above the status bar: the newest stories, running right to
 * left like a wire-service ticker, in the intel-feed style (DTG, place in
 * capitals, headline, outlet). It pauses under the pointer or keyboard
 * focus; clicking a story opens its card on the map. New stories join at
 * the end of a pass, so the line never jumps while being read. With reduced
 * motion it shows one story at a time instead.
 */
export class NewsTicker {
  private readonly strip: HTMLElement;
  private readonly voiceButton: HTMLButtonElement;
  private dirty = true;
  private step = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly news: NewsStore,
    private readonly settings: NewsSettings,
    onPick: (id: string) => void,
  ) {
    this.strip = root.querySelector<HTMLElement>('[data-strip]')!;
    this.voiceButton = root.querySelector<HTMLButtonElement>('[data-voice]')!;
    if (!('speechSynthesis' in window)) this.voiceButton.hidden = true;

    this.voiceButton.addEventListener('click', () => {
      const voice = !settings.voice;
      settings.set({ voice });
      // Say something at once, so turning it on is clearly heard to work.
      if (voice) speak('Read-aloud on. New stories will be read as they appear.');
    });
    root.querySelector('[data-hide]')?.addEventListener('click', () => settings.set({ shown: false }));
    this.strip.addEventListener('click', (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id) onPick(id);
    });
    // A pass has ended: a good moment to take in new stories.
    this.strip.addEventListener('animationiteration', () => {
      if (this.dirty) this.render();
    });

    news.subscribe(() => {
      this.dirty = true;
      // Nothing running yet (first stories, or reduced motion): show them now.
      if (this.strip.childElementCount === 0 || !this.strip.classList.contains('running')) this.render();
    });
    settings.subscribe(() => this.applySettings());
    window.setInterval(() => {
      if (reducedMotion()) {
        this.step++;
        this.render();
      }
    }, STEP_MS);
    this.applySettings();
    this.render();
  }

  private applySettings(): void {
    const appearing = this.root.hidden && this.settings.shown;
    this.root.hidden = !this.settings.shown;
    // Measured while hidden, the strip had no width: measure again.
    if (appearing) this.render();
    document.querySelector('.app')?.classList.toggle('news-off', !this.settings.shown);
    this.voiceButton.setAttribute('aria-pressed', String(this.settings.voice));
    this.voiceButton.title = this.settings.voice ? 'Stop reading stories aloud' : 'Read new stories aloud';
  }

  private render(): void {
    this.dirty = false;
    const stories = this.news.items.slice(0, TICKER_STORIES);
    this.strip.replaceChildren();
    this.strip.classList.remove('running');
    if (stories.length === 0) {
      const waiting = document.createElement('li');
      waiting.className = 'ticker-waiting';
      waiting.textContent = 'Waiting for the first news from GDELT';
      this.strip.append(waiting);
      return;
    }
    if (reducedMotion()) {
      this.strip.append(item(stories[this.step % stories.length]!, false));
      return;
    }
    // Two copies, so when the first has scrolled past, the second is exactly where the first began.
    for (const s of stories) this.strip.append(item(s, false));
    for (const s of stories) this.strip.append(item(s, true));
    const half = this.strip.scrollWidth / 2;
    this.strip.style.animationDuration = `${Math.max(20, half / PX_PER_S)}s`;
    this.strip.classList.add('running');
  }
}

function item(story: NewsItem, copy: boolean): HTMLElement {
  const li = document.createElement('li');
  if (copy) li.setAttribute('aria-hidden', 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ticker-item';
  button.dataset.id = story.id;
  button.dataset.kind = story.kind;
  if (copy) button.tabIndex = -1;
  button.title = `${NEWS_KIND_LABEL[story.kind]}: show on the map`;
  const time = document.createElement('time');
  time.className = 'ticker-time';
  time.textContent = formatNewsTime(story.publishedAt);
  const icon = document.createElement('span');
  icon.className = 'ticker-icon';
  icon.innerHTML = newsIconSvg(story.kind, 12); // fixed markup, no story text
  const place = document.createElement('span');
  place.className = 'ticker-place';
  place.textContent = formatNewsPlace(story.place);
  const headline = document.createElement('span');
  headline.className = 'ticker-headline';
  headline.textContent = story.headline;
  const outlet = document.createElement('span');
  outlet.className = 'ticker-outlet';
  outlet.textContent = story.outlet;
  button.append(time, icon, place, headline, outlet);
  li.append(button);
  return li;
}
