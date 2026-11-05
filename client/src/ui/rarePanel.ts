import type { Finding } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';
import type { FindingStore } from '../state/findings';
import { formatAge, formatNewsTime } from './format';

/** Ages ("2 h ago") move on even when nothing new arrives. */
const REFRESH_MS = 60_000;

/**
 * The Rare aircraft tab: every rare type in the air now, and the ones seen
 * in the last 24 hours, so they're there to look at whenever, not only in
 * the moment a card pops up. The top bar's button shows how many are flying.
 * A live one is selected and followed onto; a past one flies to where it was
 * last seen. Either way the panel steps aside for the map.
 */
export class RarePanel {
  private readonly live: HTMLOListElement;
  private readonly recent: HTMLOListElement;
  private readonly liveEmpty: HTMLElement;
  private readonly recentEmpty: HTMLElement;
  private readonly count: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly button: HTMLButtonElement,
    private readonly findings: FindingStore,
    private readonly map: MapLibreMap,
    private readonly now: () => number,
    private readonly showLive: (finding: Finding) => void,
  ) {
    this.live = root.querySelector('[data-live]')!;
    this.recent = root.querySelector('[data-recent]')!;
    this.liveEmpty = root.querySelector('[data-live-empty]')!;
    this.recentEmpty = root.querySelector('[data-recent-empty]')!;
    this.count = button.querySelector('[data-count]')!;
    button.addEventListener('click', () => this.setOpen(!this.open));
    root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    root.addEventListener('click', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-finding]');
      if (row) this.pick(row.dataset.finding!, row.dataset.when === 'live');
    });
    findings.subscribe(() => this.render());
    window.setInterval(() => this.render(), REFRESH_MS);
    this.render();
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) this.render();
  }

  private pick(id: string, live: boolean): void {
    if (live) {
      const f = this.findings.get(id);
      if (f) this.showLive(f);
    } else {
      const f = this.findings.recent.find((r) => r.id === id);
      if (f) fly(this.map, { center: [f.lon, f.lat], zoom: Math.max(this.map.getZoom(), 6) });
    }
    this.setOpen(false);
  }

  private render(): void {
    const live = this.findings.items.filter((f) => f.kind === 'rare');
    // The button says how many are flying, even with the panel closed.
    this.count.hidden = live.length === 0;
    this.count.textContent = String(live.length);
    this.button.classList.toggle('rare-chip-live', live.length > 0);
    if (!this.open) return;
    const now = this.now();
    this.live.replaceChildren(...live.map((f) => this.row(f, 'live', `In the air since ${formatNewsTime(f.since)}`)));
    this.liveEmpty.hidden = live.length > 0;
    const recent = this.findings.recent.filter((f) => f.kind === 'rare');
    this.recent.replaceChildren(
      ...recent.map((f) =>
        this.row(f, 'recent', `Seen ${formatNewsTime(f.since)}–${formatNewsTime(f.endedAt ?? f.since)} · ${formatAge(Math.max(0, now - (f.endedAt ?? f.since)))}`),
      ),
    );
    this.recentEmpty.hidden = recent.length > 0;
  }

  /** One aircraft: its type first (that's the point), then callsign, the facts, and when. */
  private row(f: Finding, when: 'live' | 'recent', time: string): HTMLLIElement {
    const [type, ...facts] = f.detail.split(' · ');
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rare-item';
    button.dataset.finding = f.id;
    button.dataset.when = when;
    const head = document.createElement('span');
    head.className = 'rare-item-type';
    head.textContent = type ?? f.detail;
    const name = document.createElement('span');
    name.className = 'rare-item-name';
    name.textContent = f.name;
    const detail = document.createElement('span');
    detail.className = 'rare-item-facts';
    detail.textContent = facts.join(' · ');
    const meta = document.createElement('span');
    meta.className = 'rare-item-time';
    meta.textContent = time;
    button.append(head, name, detail, meta);
    item.append(button);
    return item;
  }
}
