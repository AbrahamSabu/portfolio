import type { IControl } from 'maplibre-gl';
import type { RegionDraw } from '../map/regionDraw';
import type { RegionLayer } from '../map/regionLayer';
import type { Region, RegionEvent, RegionStore, RegionWatch } from '../state/regions';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatNewsTime, PLATFORM_LABEL } from './format';

const LOG_MAX = 50;

export const EVENT_WORD: Record<RegionEvent['type'], string> = { enter: 'Entered', exit: 'Left', lost: 'Lost contact in' };

/**
 * Watch areas: draw one (W, or the button here), name it and say what to
 * watch, see each area's count, and an activity log of entries, exits and
 * lost contacts (the last 50, this page only). Areas are kept in this
 * browser; alerts happen only while the page is open.
 */
export class RegionPanel {
  private readonly form: HTMLFormElement;
  private readonly list: HTMLElement;
  private readonly logList: HTMLElement;
  private pending: [number, number][] | null = null;
  private readonly log: { event: RegionEvent; text: string }[] = [];
  /** Per area, how many tracks have left the picture inside it since the page opened. */
  private readonly gone = new Map<string, number>();
  private readonly since = Date.now();
  private readonly openListeners = new Set<() => void>();

  constructor(
    private readonly root: HTMLElement,
    private readonly regions: RegionStore,
    private readonly watch: RegionWatch,
    private readonly draw: RegionDraw,
    layer: RegionLayer,
    store: TrackStore,
    selection: Selection,
  ) {
    this.form = root.querySelector('[data-form]')!;
    this.list = root.querySelector('[data-list]')!;
    this.logList = root.querySelector('[data-log]')!;
    root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    root.querySelector('[data-draw]')!.addEventListener('click', () => this.startDrawing());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    this.form.querySelector('[data-discard]')!.addEventListener('click', () => this.discard());
    this.list.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-id]');
      const region = button && regions.get(button.dataset.id!);
      if (!region) return;
      if (button.dataset.action === 'delete') {
        regions.remove(region.id);
        watch.forget(region.id);
      } else layer.show(region);
    });
    this.logList.addEventListener('click', (event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-track]')?.dataset.track;
      if (id && store.get(id)) selection.select(id);
    });
    regions.subscribe(() => this.renderList());
    this.renderList();
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    for (const listener of this.openListeners) listener();
  }

  onOpenChange(listener: () => void): void {
    this.openListeners.add(listener);
  }

  /** Draw a new area; the panel steps out of the way meanwhile and comes back to name it. */
  startDrawing(): void {
    this.setOpen(false);
    this.draw.start((ring) => {
      this.pending = ring;
      this.form.hidden = false;
      const name = this.form.elements.namedItem('name') as HTMLInputElement;
      name.value = `Area ${this.regions.regions.length + 1}`;
      this.setOpen(true);
      name.select();
    });
  }

  private save(): void {
    if (!this.pending) return;
    const field = (n: string) => this.form.elements.namedItem(n) as HTMLInputElement;
    const watch = (this.form.querySelector<HTMLInputElement>('input[name="watch"]:checked')?.value ?? 'both') as Region['watch'];
    this.regions.add({
      id: `r${Date.now().toString(36)}`,
      name: field('name').value.trim().slice(0, 40) || 'Area',
      ring: this.pending,
      watch,
      militaryOnly: field('military').checked,
      onEnter: field('enter').checked,
      onExit: field('exit').checked,
    });
    this.discard();
  }

  private discard(): void {
    this.pending = null;
    this.form.hidden = true;
    this.form.reset();
  }

  /** Log the watch's events, newest first. */
  record(events: readonly RegionEvent[]): void {
    if (events.length === 0) return;
    let logged = false;
    for (const event of events) {
      // Busy areas lose tracks every few seconds (landings, receiver range): counted, not logged one by one.
      if (event.type === 'lost') this.gone.set(event.regionId, (this.gone.get(event.regionId) ?? 0) + 1);
      else {
        this.log.unshift({ event, text: this.describe(event) });
        logged = true;
      }
    }
    this.log.length = Math.min(this.log.length, LOG_MAX);
    if (logged) this.renderLog();
  }

  /** "Entered Approaches · ULYSSES (Passenger ship)". */
  describe(event: RegionEvent): string {
    const region = this.regions.get(event.regionId);
    return `${EVENT_WORD[event.type]} ${region?.name ?? 'a deleted area'} · ${event.callsign ?? 'No name'} (${PLATFORM_LABEL[event.platform]})`;
  }

  refreshCounts(): void {
    for (const el of this.list.querySelectorAll<HTMLElement>('[data-count]')) {
      const id = el.dataset.count!;
      const gone = this.gone.get(id) ?? 0;
      const left = gone ? ` · ${gone} left the picture inside since ${formatNewsTime(this.since)} (landed, out of receiver range or switched off)` : '';
      el.textContent = `${this.watch.insideOf(id).length} inside${left}`;
    }
  }

  private renderList(): void {
    const items = this.regions.regions.map((r) => {
      const li = document.createElement('li');
      li.className = 'region-item';
      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'region-show';
      show.dataset.id = r.id;
      const name = document.createElement('span');
      name.className = 'region-name';
      name.textContent = r.name;
      const what = document.createElement('span');
      what.className = 'region-what';
      const kinds = r.watch === 'air' ? 'Aircraft' : r.watch === 'sea' ? 'Ships' : 'Aircraft and ships';
      const alerts = [r.onEnter && 'entering', r.onExit && 'leaving'].filter(Boolean).join(' and ');
      what.textContent = `${r.militaryOnly ? `Military ${kinds.toLowerCase()}` : kinds} · ${alerts ? `alerts on ${alerts}` : 'no alerts'}`;
      const count = document.createElement('span');
      count.className = 'region-count';
      count.dataset.count = r.id;
      show.append(name, what, count);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-button';
      del.dataset.id = r.id;
      del.dataset.action = 'delete';
      del.setAttribute('aria-label', `Delete ${r.name}`);
      del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
      li.append(show, del);
      return li;
    });
    this.list.replaceChildren(...items);
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'region-empty';
      empty.textContent = 'No areas yet. Draw one to be told when aircraft or ships cross into or out of it.';
      this.list.append(empty);
    }
    this.refreshCounts();
  }

  private renderLog(): void {
    this.logList.replaceChildren(
      ...this.log.map(({ event, text }) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.track = event.trackId;
        button.dataset.type = event.type;
        const time = document.createElement('time');
        time.textContent = formatNewsTime(event.at);
        const what = document.createElement('span');
        what.textContent = text;
        button.append(time, what);
        li.append(button);
        return li;
      }),
    );
  }
}

/** The map button under the filter's that opens the panel. */
export class RegionControl implements IControl {
  private button: HTMLButtonElement | null = null;

  constructor(private readonly panel: RegionPanel) {
    panel.onOpenChange(() => this.update());
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Watch areas (W draws one)';
    button.setAttribute('aria-label', 'Watch areas');
    button.setAttribute('aria-controls', 'region-panel');
    button.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 9 2.5l4.5 4-2 6.5-7.5-1.5z" stroke-dasharray="2.2 1.6"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/></svg>';
    button.addEventListener('click', () => this.panel.setOpen(!this.panel.open));
    container.append(button);
    this.button = button;
    this.update();
    return container;
  }

  onRemove(): void {
    this.button?.parentElement?.remove();
    this.button = null;
  }

  private update(): void {
    this.button?.setAttribute('aria-expanded', String(this.panel.open));
  }
}
