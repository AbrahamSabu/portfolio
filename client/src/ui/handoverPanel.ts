import type { BriefMessage } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import { formatNewsTime } from './format';
import { speak } from './voice';

/** Reading a whole day aloud would outstay its welcome; the newest lines carry the watch. */
const SPOKEN_LINES = 10;

/**
 * The watch handover: the server's own log of the last 24 hours — emergency
 * squawks starting and ending, what the watchers noticed, significant hazards
 * — read back on demand. Every line was composed when it happened, from the
 * facts at hand, so the brief can't drift from the data. Newest first;
 * choosing a line flies to where it happened.
 */
export class HandoverPanel {
  private readonly list: HTMLOListElement;
  private readonly empty: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly sub: HTMLElement;
  private brief: BriefMessage | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly map: MapLibreMap,
    private readonly request: () => void,
  ) {
    this.list = root.querySelector('[data-list]')!;
    this.empty = root.querySelector('[data-empty]')!;
    this.loading = root.querySelector('[data-loading]')!;
    this.sub = root.querySelector('[data-since]')!;
    root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    root.querySelector('[data-speak]')!.addEventListener('click', () => this.readAloud());
    this.list.addEventListener('click', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-lon]');
      if (!row) return;
      fly(this.map, { center: [Number(row.dataset.lon), Number(row.dataset.lat)], zoom: Math.max(this.map.getZoom(), 6) });
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (this.root.hidden === !open) return;
    this.root.hidden = !open;
    if (!open) return;
    // Ask afresh each time: the log moved on since the last look.
    this.loading.hidden = false;
    this.empty.hidden = true;
    this.request();
  }

  /** The server's answer (routed from the connection). */
  load(message: BriefMessage): void {
    this.brief = message;
    this.loading.hidden = true;
    this.sub.textContent = `Since ${formatNewsTime(message.sinceTime)} · the floor's own log`;
    this.empty.hidden = message.events.length > 0;
    const newestFirst = [...message.events].reverse();
    this.list.replaceChildren(
      ...newestFirst.map((e) => {
        const item = document.createElement('li');
        const row = document.createElement(e.lat !== undefined ? 'button' : 'div');
        row.className = 'handover-item';
        if (row instanceof HTMLButtonElement) row.type = 'button';
        if (e.lat !== undefined && e.lon !== undefined) {
          row.dataset.lat = String(e.lat);
          row.dataset.lon = String(e.lon);
        }
        const time = document.createElement('span');
        time.className = 'handover-time';
        time.textContent = formatNewsTime(e.time);
        const text = document.createElement('span');
        text.className = 'handover-text';
        text.textContent = e.text;
        row.append(time, text);
        item.append(row);
        return item;
      }),
    );
  }

  private readAloud(): void {
    if (!this.brief) return;
    const lines = this.brief.events.slice(-SPOKEN_LINES).map((e) => e.text);
    if (lines.length === 0) {
      speak('A quiet watch: nothing in the log.');
      return;
    }
    speak(`Since ${formatNewsTime(this.brief.sinceTime)} zulu. ${lines.join(' ')}`);
  }
}
