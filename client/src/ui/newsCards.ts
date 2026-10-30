import type { NewsItem } from '@watchfloor/shared';
import { Marker, Popup, type Map as MapLibreMap } from 'maplibre-gl';
import { NEWS_KIND_LABEL, newsIconSvg } from '../map/newsIcons';
import type { NewsSettings, NewsStore } from '../state/newsStore';
import { NewsRotation } from '../state/newsRotation';
import { formatAge, formatDtg, formatNewsPlace, newsSpeech } from './format';
import { speak } from './voice';

/** How long each story stays up when it pops up by itself. */
const DWELL_MS = 9_000;
/** A story the operator opened stays until closed, or this long. */
const PINNED_MS = 45_000;
/**
 * Pointing at a card holds it, but not for ever: a mouse left resting where
 * cards appear would otherwise freeze the rotation, new stories and all
 * (it did, in testing).
 */
const MAX_HOLD_MS = 30_000;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * News cards on the map. New stories pop up one at a time where they
 * happened, then recent ones keep cycling, so the floor always has
 * something up; each is read aloud when read-aloud is on. A card the
 * operator opens (a marker or the ticker) stays until closed. Cards never
 * move the map: a story off screen waits, and is in the ticker meanwhile.
 */
export class NewsCards {
  private readonly rotation = new NewsRotation();
  private readonly popup: Popup;
  private shownId: string | undefined;
  private pinnedUntil = 0;
  private hovering = false;
  private hoverSince = 0;
  private timer: number | undefined;

  constructor(
    private readonly map: MapLibreMap,
    private readonly news: NewsStore,
    private readonly settings: NewsSettings,
    private readonly now: () => number,
  ) {
    this.popup = new Popup({
      closeButton: true,
      closeOnClick: false,
      closeOnMove: false,
      focusAfterOpen: false,
      maxWidth: '320px',
      offset: 14,
      className: 'news-popup',
    });
    this.popup.on('close', () => {
      this.shownId = undefined;
      this.pinnedUntil = 0;
    });

    news.subscribe((added) => {
      this.rotation.enqueue(added);
      // Something new: show it now rather than at the end of the current dwell.
      if (added.length > 0 && !this.pinned()) this.advance();
      // The page just got the day's stories: put one up soon, not after a full dwell.
      else if (!this.shownId) this.schedule(1_500);
    });
    settings.subscribe(() => {
      if (!settings.shown) this.close();
      else if (!this.shownId) this.advance();
      if (!settings.voice) window.speechSynthesis?.cancel();
    });
    document.addEventListener('visibilitychange', () => {
      // Back in front: put up what arrived meanwhile now, not at the next turn.
      if (!document.hidden) this.advance();
    });
    this.schedule(DWELL_MS);
  }

  /** Open one story's card, from its marker or the ticker; it stays up until closed. */
  open(id: string): void {
    const story = this.news.get(id);
    if (!story || !this.settings.shown) return;
    this.pinnedUntil = this.now() + PINNED_MS;
    this.show(story);
    this.schedule(PINNED_MS);
  }

  private pinned(): boolean {
    return this.shownId !== undefined && this.now() < this.pinnedUntil;
  }

  private schedule(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.advance(), ms);
  }

  private advance(): void {
    // Wait while the operator reads a card, the page is hidden, or a story is being read aloud.
    const speaking = this.settings.voice && window.speechSynthesis?.speaking;
    const reading = this.hovering && this.now() - this.hoverSince < MAX_HOLD_MS;
    if (!this.settings.shown || document.hidden || reading || this.pinned() || speaking) {
      this.schedule(speaking ? 1_000 : DWELL_MS);
      return;
    }
    const bounds = this.map.getBounds();
    const story = this.rotation.next(this.news.items, this.now(), (s) => bounds.contains([s.lon, s.lat]));
    if (story) this.show(story);
    else this.close();
    this.schedule(DWELL_MS);
  }

  private show(story: NewsItem): void {
    const card = buildCard(story, this.now());
    card.addEventListener('pointerenter', () => {
      this.hovering = true;
      this.hoverSince = this.now();
    });
    card.addEventListener('pointerleave', () => (this.hovering = false));
    this.hovering = false;
    this.shownId = story.id;
    this.popup.setLngLat([story.lon, story.lat]).setDOMContent(card);
    if (!this.popup.isOpen()) this.popup.addTo(this.map);
    if (!reducedMotion()) pulse(this.map, story);
    if (this.settings.voice) speakStory(story);
  }

  private close(): void {
    if (this.popup.isOpen()) this.popup.remove();
    this.shownId = undefined;
  }
}

/** The card: kind, time, place, the headline as published, and a link to the article. Text only via textContent. */
function buildCard(story: NewsItem, now: number): HTMLElement {
  const card = document.createElement('article');
  card.className = 'news-card';
  card.dataset.kind = story.kind;

  const head = document.createElement('div');
  head.className = 'news-card-head';
  const icon = document.createElement('span');
  icon.className = 'news-card-icon';
  icon.innerHTML = newsIconSvg(story.kind, 14); // fixed markup, no story text
  const kind = document.createElement('span');
  kind.className = 'news-card-kind';
  kind.textContent = NEWS_KIND_LABEL[story.kind].toUpperCase();
  const time = document.createElement('time');
  time.dateTime = new Date(story.publishedAt).toISOString();
  time.textContent = `${formatDtg(story.publishedAt)} · ${formatAge(Math.max(0, now - story.publishedAt))}`;
  head.append(icon, kind, time);

  const place = document.createElement('div');
  place.className = 'news-card-place';
  place.textContent = formatNewsPlace(story.place);

  const headline = document.createElement('p');
  headline.className = 'news-card-headline';
  headline.textContent = story.headline;

  const source = document.createElement('a');
  source.className = 'news-card-source';
  source.href = story.url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = `${story.outlet} ↗`;

  card.append(head, place, headline, source);
  return card;
}

/** A ring that grows and fades where the story is, once, to draw the eye to it. */
function pulse(map: MapLibreMap, story: NewsItem): void {
  const ring = document.createElement('div');
  ring.className = 'news-pulse';
  const marker = new Marker({ element: ring }).setLngLat([story.lon, story.lat]).addTo(map);
  ring.addEventListener('animationend', () => marker.remove());
}

function speakStory(story: NewsItem): void {
  speak(newsSpeech(story));
}
