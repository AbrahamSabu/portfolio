import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Track } from '@watchfloor/shared';
import { AFFILIATION_COLOR, type TrackLayer } from '../map/trackLayer';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import { DEFAULT_QUERY, nextSort, queryTracks, type DomainFilter, type SortKey, type TrackQuery } from '../state/trackQuery';
import type { TrackStore } from '../state/trackStore';
import { PLATFORM_LABEL, formatAltitude, formatDuration, formatSpeed } from './format';

/** Ages tick even when no reports arrive, so the table refreshes at least this often. */
const REFRESH_MS = 1000;

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/** The cells of one row, kept so updates can change text in place. */
interface Row {
  tr: HTMLTableRowElement;
  swatch: HTMLElement;
  callsign: HTMLElement;
  type: HTMLElement;
  speed: HTMLElement;
  altitude: HTMLElement;
  age: HTMLElement;
}

/**
 * A sortable, filterable table of every track. Selecting a row selects the
 * track on the map, and selecting on the map highlights the row.
 *
 * Rows are kept per track id and only moved when the order changes, rather
 * than rebuilt every second. That keeps scroll position, hover and keyboard
 * focus stable while the picture updates underneath.
 */
export class TrackList {
  private query: TrackQuery = { ...DEFAULT_QUERY };
  private readonly rows = new Map<string, Row>();
  private readonly tbody: HTMLTableSectionElement;
  private readonly count: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly search: HTMLInputElement;
  /** The row that takes Tab focus into the table (roving tabindex). */
  private focusId: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly toggle: HTMLButtonElement,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
    private readonly selection: Selection,
    private readonly map: MapLibreMap,
  ) {
    const q = <T extends HTMLElement>(sel: string) => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`Track list is missing ${sel}`);
      return el;
    };
    this.tbody = q<HTMLTableSectionElement>('[data-rows]');
    this.count = q('[data-count]');
    this.empty = q('[data-empty]');
    this.search = q<HTMLInputElement>('[data-search]');

    toggle.addEventListener('click', () => this.setOpen(!this.open));
    q('[data-close]').addEventListener('click', () => this.setOpen(false));

    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-domain]')) {
      button.addEventListener('click', () => {
        this.query = { ...this.query, domain: button.dataset.domain as DomainFilter };
        this.render();
      });
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sort]')) {
      button.addEventListener('click', () => {
        this.query = nextSort(this.query, button.dataset.sort as SortKey);
        this.render();
      });
    }
    this.search.addEventListener('input', () => {
      this.query = { ...this.query, search: this.search.value };
      this.render();
    });

    this.tbody.addEventListener('click', (event) => {
      const id = rowId(event.target);
      if (id) this.choose(id);
    });
    this.tbody.addEventListener('keydown', (event) => this.onKey(event));

    store.subscribe(() => this.render());
    selection.subscribe(() => this.syncSelection(true));
    window.setInterval(() => this.render(), REFRESH_MS);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    // Lets the CSS move the map controls out from under the panel.
    document.body.toggleAttribute('data-list-open', open);
    if (open) {
      this.render();
      this.syncSelection(true);
    }
  }

  /** Open the list and put the cursor in the search box. */
  focusSearch(): void {
    this.setOpen(true);
    this.search.focus();
    this.search.select();
  }

  /** Select a track from the list and bring it into view on the map. */
  private choose(id: string): void {
    this.selection.select(id);
    this.focusId = id;
    const pos = this.layer.positionOf(id);
    if (pos) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.map.easeTo({ center: [pos.lon, pos.lat], duration: reduce ? 0 : 400 });
    }
    // On a phone the list and the details panel would share the same bottom
    // sheet space, so hand over to the details.
    if (window.matchMedia('(max-width: 640px)').matches) this.setOpen(false);
  }

  private render(): void {
    if (this.root.hidden) return;
    const now = this.clock.now();
    const tracks = queryTracks(this.store.all(), this.query, now);

    this.count.textContent =
      tracks.length === this.store.size ? String(tracks.length) : `${tracks.length} of ${this.store.size}`;
    this.empty.hidden = tracks.length > 0;
    this.renderControls();

    // Remember focus: moving a focused row in the DOM would drop it.
    const focused = document.activeElement instanceof HTMLTableRowElement ? document.activeElement : null;

    const keep = new Set<string>();
    tracks.forEach((track, index) => {
      keep.add(track.id);
      const row = this.rows.get(track.id) ?? this.createRow(track.id);
      this.fill(row, track, now);
      // Only touch the DOM when this row isn't already in place.
      if (this.tbody.children[index] !== row.tr) this.tbody.insertBefore(row.tr, this.tbody.children[index] ?? null);
    });
    for (const [id, row] of this.rows) {
      if (keep.has(id)) continue;
      row.tr.remove();
      this.rows.delete(id);
    }

    if (focused && document.activeElement !== focused && focused.isConnected) focused.focus({ preventScroll: true });
    this.syncSelection(false);
  }

  private renderControls(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-domain]')) {
      button.setAttribute('aria-pressed', String(button.dataset.domain === this.query.domain));
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-sort]')) {
      const th = button.closest('th');
      if (!th) continue;
      if (button.dataset.sort === this.query.sort) th.setAttribute('aria-sort', ARIA_SORT[this.query.dir]);
      else th.removeAttribute('aria-sort');
    }
  }

  private createRow(id: string): Row {
    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.tabIndex = -1;
    const cell = (className?: string) => {
      const td = tr.insertCell();
      if (className) td.className = className;
      return td;
    };
    const first = cell('track-cell-callsign');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const callsign = document.createElement('span');
    first.append(swatch, callsign);
    const row: Row = {
      tr,
      swatch,
      callsign,
      type: cell(),
      speed: cell('num'),
      altitude: cell('num'),
      age: cell('num'),
    };
    this.rows.set(id, row);
    return row;
  }

  private fill(row: Row, track: Track, now: number): void {
    const stale = this.store.status(track, now) === 'stale';
    const name = track.callsign ?? track.id;
    setText(row.callsign, name);
    row.callsign.classList.toggle('track-cell-muted', !track.callsign);
    row.swatch.style.background = AFFILIATION_COLOR[track.affiliation];
    setText(row.type, PLATFORM_LABEL[track.platform]);
    // Long names are cut off with an ellipsis, so the full text is on hover.
    setTitle(row.callsign.parentElement, name);
    setTitle(row.type, PLATFORM_LABEL[track.platform]);
    setText(row.speed, formatSpeed(track.speedMps));
    setText(row.altitude, track.domain === 'air' ? formatAltitude(track.altitudeM) : '—');
    setText(row.age, formatDuration(now - track.observedAt));
    row.tr.classList.toggle('track-row-stale', stale);
  }

  /** Mark the selected row, keep one row tabbable, and optionally scroll the selection into view. */
  private syncSelection(reveal: boolean): void {
    const selectedId = this.selection.id;
    if (selectedId && this.rows.has(selectedId)) this.focusId = selectedId;
    if (!this.focusId || !this.rows.has(this.focusId)) this.focusId = this.tbody.rows[0]?.dataset.id ?? null;

    for (const [id, row] of this.rows) {
      row.tr.setAttribute('aria-selected', String(id === selectedId));
      row.tr.tabIndex = id === this.focusId ? 0 : -1;
    }
    if (reveal && selectedId && !this.root.hidden) {
      this.rows.get(selectedId)?.tr.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Arrow keys move between rows; Enter or Space selects. */
  private onKey(event: KeyboardEvent): void {
    const current = event.target instanceof HTMLTableRowElement ? event.target : null;
    if (!current) return;
    const rows = this.tbody.rows;
    let next: HTMLTableRowElement | null | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = current.nextElementSibling as HTMLTableRowElement | null;
        break;
      case 'ArrowUp':
        next = current.previousElementSibling as HTMLTableRowElement | null;
        break;
      case 'Home':
        next = rows[0];
        break;
      case 'End':
        next = rows[rows.length - 1];
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (current.dataset.id) this.choose(current.dataset.id);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!next) return;
    current.tabIndex = -1;
    next.tabIndex = 0;
    this.focusId = next.dataset.id ?? null;
    next.focus();
  }
}

function rowId(target: EventTarget | null): string | undefined {
  return target instanceof Element ? target.closest<HTMLElement>('tr[data-id]')?.dataset.id : undefined;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setTitle(el: HTMLElement | null, text: string): void {
  if (el && el.title !== text) el.title = text;
}
