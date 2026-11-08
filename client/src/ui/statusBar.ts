import type { Map as MapLibreMap } from 'maplibre-gl';
import type { ConnectionState } from '../net/connection';
import type { ServerClock } from '../state/clock';
import type { PictureFilter } from '../state/pictureFilter';
import type { TrackStore } from '../state/trackStore';
import type { FeedStatus } from '@watchfloor/shared';
import { describeFeeds, formatLat, formatLon } from './format';

/** Bottom strip: link health, what's on the picture, and where the pointer is. */
export class StatusBar {
  private readonly linkEl: HTMLElement;
  private readonly linkText: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly airEl: HTMLElement;
  private readonly seaEl: HTMLElement;
  private readonly staleEl: HTMLElement;
  private readonly staleWrap: HTMLElement;
  private readonly filteredEl: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly feedEl: HTMLElement;
  private state: ConnectionState = { status: 'connecting' };

  constructor(
    root: HTMLElement,
    map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly filter: PictureFilter,
    onRetry: () => void,
  ) {
    const q = <T extends HTMLElement>(sel: string) => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`Status bar is missing ${sel}`);
      return el;
    };
    this.linkEl = q('[data-link]');
    this.linkText = q('[data-link-text]');
    this.retryButton = q<HTMLButtonElement>('[data-link-retry]');
    this.airEl = q('[data-count-air]');
    this.seaEl = q('[data-count-sea]');
    this.staleEl = q('[data-count-stale]');
    this.staleWrap = q('[data-stale-wrap]');
    this.filteredEl = q('[data-filtered]');
    this.cursorEl = q('[data-cursor]');
    this.feedEl = q('[data-feed]');

    this.retryButton.addEventListener('click', onRetry);

    map.on('mousemove', (e) => {
      this.cursorEl.textContent = `${formatLat(e.lngLat.lat)}  ${formatLon(e.lngLat.lng)}`;
    });
    map.getCanvasContainer().addEventListener('mouseleave', () => (this.cursorEl.textContent = ''));

    window.setInterval(() => this.refresh(), 1000);
    filter.subscribe(() => this.refresh());
    this.refresh();
  }

  setConnection(state: ConnectionState): void {
    this.state = state;
    this.renderLink();
  }

  /** Show why live tracks may be fading: only feeds that aren't delivering get a mention. */
  setFeeds(feeds: FeedStatus[]): void {
    const text = describeFeeds(feeds);
    this.feedEl.hidden = text === '';
    if (this.feedEl.textContent !== text) this.feedEl.textContent = text;
    this.feedEl.title = text; // the bar is one line, so long text is cut off with an ellipsis
  }

  private refresh(): void {
    this.renderLink();
    const now = this.clock.now();
    let air = 0;
    let sea = 0;
    let stale = 0;
    let hidden = 0;
    // Counts are of what's shown, so they match the map; the note says when that isn't everything.
    for (const track of this.store.all()) {
      const isStale = this.store.status(track, now) === 'stale';
      if (!this.filter.passes(track, isStale)) {
        hidden++;
        continue;
      }
      if (track.domain === 'air') air++;
      else sea++;
      if (isStale) stale++;
    }
    this.filteredEl.hidden = hidden === 0;
    this.filteredEl.textContent = `${hidden} filtered out`;
    this.airEl.textContent = String(air);
    this.seaEl.textContent = String(sea);
    this.staleEl.textContent = String(stale);
    this.staleWrap.hidden = stale === 0;
  }

  private renderLink(): void {
    const s = this.state;
    this.linkEl.dataset.state = s.status;
    this.retryButton.hidden = s.status !== 'waiting';
    switch (s.status) {
      case 'connecting':
        this.linkText.textContent = 'Connecting';
        break;
      case 'open':
        this.linkText.textContent = 'Live';
        break;
      case 'waiting': {
        const seconds = Math.max(0, Math.ceil((s.retryAt - Date.now()) / 1000));
        this.linkText.textContent = s.refused
          ? `Turned away: too many connections from this address, retrying in ${seconds} s`
          : `Connection lost, retrying in ${seconds} s`;
        break;
      }
      case 'incompatible':
        this.linkText.textContent = 'The server was updated. Reload the page to reconnect.';
        break;
    }
  }
}
