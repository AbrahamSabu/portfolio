import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Track } from '@watchfloor/shared';
import { AFFILIATION_COLOR } from '../map/colors';
import type { TrackLayer } from '../map/trackLayer';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { PictureFilter } from '../state/pictureFilter';
import { DEFAULT_QUERY, nextSort, queryTracks, type DomainFilter, type SortKey, type TrackQuery } from '../state/trackQuery';
import type { TrackStore } from '../state/trackStore';
import { PLATFORM_LABEL, formatAltitude, formatDuration, formatSpeed } from './format';
import { revealScrollTop, visibleRange, type Viewport } from './listWindow';

/** Ages tick even when no reports arrive, so the table refreshes at least this often. */
const REFRESH_MS = 1000;

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;
/** Extra rows built above and below the visible ones, so fast scrolling doesn't show gaps. */
const OVERSCAN = 8;
/** Until a row has been measured. Rows are single-line, so they all share one height. */
const DEFAULT_ROW_HEIGHT = 29;

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
 *
 * Worldwide there can be 7,000+ tracks, so the list is windowed: only the
 * rows in view (plus a margin) exist, and two spacer rows give the scrollbar
 * the full height. aria-rowcount and aria-rowindex tell assistive technology
 * the real size and position. Keyboard movement goes by index in the sorted
 * list, since the next track's row may not exist yet.
 */
export class TrackList {
  private query: TrackQuery = { ...DEFAULT_QUERY };
  private readonly rows = new Map<string, Row>();
  /** The current filtered, sorted list, and each id's position in it. */
  private ordered: Track[] = [];
  private readonly indexOf = new Map<string, number>();
  private rowHeight = DEFAULT_ROW_HEIGHT;
  private windowFrame = 0;
  private readonly tbody: HTMLTableSectionElement;
  private readonly table: HTMLTableElement;
  private readonly scroller: HTMLElement;
  private readonly topSpacer: HTMLTableRowElement;
  private readonly bottomSpacer: HTMLTableRowElement;
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
    private readonly filter: PictureFilter,
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
    this.table = q<HTMLTableElement>('table');
    this.scroller = q('.track-table-wrap');
    this.topSpacer = spacerRow();
    this.bottomSpacer = spacerRow();
    this.tbody.append(this.topSpacer, this.bottomSpacer);
    // Scrolling only changes which rows are built, never the data: re-slice once per frame.
    this.scroller.addEventListener('scroll', () => {
      if (this.windowFrame) return;
      this.windowFrame = requestAnimationFrame(() => {
        this.windowFrame = 0;
        this.renderWindow(this.clock.now());
      });
    });

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
    filter.subscribe(() => this.render());
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
    const tracks = queryTracks(this.shown(now), this.query, now);
    this.ordered = tracks;
    this.indexOf.clear();
    tracks.forEach((track, index) => this.indexOf.set(track.id, index));

    this.count.textContent =
      tracks.length === this.store.size ? String(tracks.length) : `${tracks.length} of ${this.store.size}`;
    this.empty.hidden = tracks.length > 0;
    this.table.setAttribute('aria-rowcount', String(tracks.length + 1)); // plus the header row
    this.renderControls();
    this.renderWindow(now);
  }

  /** The tracks the picture filter leaves on the map; the list's own buttons and search narrow these. */
  private *shown(now: number): Iterable<Track> {
    for (const track of this.store.all()) {
      if (this.filter.passes(track, this.store.status(track, now) === 'stale')) yield track;
    }
  }

  private viewport(): Viewport {
    return {
      scrollTop: this.scroller.scrollTop,
      height: this.scroller.clientHeight,
      headerHeight: this.table.tHead?.offsetHeight ?? 0,
      rowHeight: this.rowHeight,
    };
  }

  /** Build the rows in view, reusing existing ones, and size the spacers for the rest. */
  private renderWindow(now: number): void {
    if (this.root.hidden) return;
    const tracks = this.ordered;
    const { start, end } = visibleRange(this.viewport(), tracks.length, OVERSCAN);

    // Remember focus: moving a focused row in the DOM would drop it.
    const focused = document.activeElement instanceof HTMLTableRowElement ? document.activeElement : null;

    this.topSpacer.style.height = `${start * this.rowHeight}px`;
    this.bottomSpacer.style.height = `${(tracks.length - end) * this.rowHeight}px`;

    const keep = new Set<string>();
    for (let index = start; index < end; index++) {
      const track = tracks[index]!;
      keep.add(track.id);
      const row = this.rows.get(track.id) ?? this.createRow(track.id);
      this.fill(row, track, now);
      setAttr(row.tr, 'aria-rowindex', String(index + 2)); // 1 is the header row
      // Only touch the DOM when this row isn't already in place (child 0 is the top spacer).
      const slot = this.tbody.children[index - start + 1];
      if (slot !== row.tr) this.tbody.insertBefore(row.tr, slot ?? this.bottomSpacer);
    }
    for (const [id, row] of this.rows) {
      if (keep.has(id)) continue;
      row.tr.remove();
      this.rows.delete(id);
    }

    // Measure the real row height once rows exist; if it differs, lay out again with it.
    const sample = this.rows.values().next().value?.tr.offsetHeight;
    if (sample && Math.abs(sample - this.rowHeight) > 0.5) {
      this.rowHeight = sample;
      this.renderWindow(now);
      return;
    }

    if (focused && document.activeElement !== focused && focused.isConnected) focused.focus({ preventScroll: true });
    this.syncSelection(false);
  }

  /** Scroll so the row at `index` is in view, and build it. */
  private reveal(index: number): void {
    const top = revealScrollTop(this.viewport(), index);
    if (top !== this.scroller.scrollTop) this.scroller.scrollTop = top;
    this.renderWindow(this.clock.now());
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
    if (selectedId && this.indexOf.has(selectedId)) this.focusId = selectedId;
    if (!this.focusId || !this.indexOf.has(this.focusId)) this.focusId = this.ordered[0]?.id ?? null;

    if (reveal && selectedId && !this.root.hidden) {
      const index = this.indexOf.get(selectedId);
      if (index !== undefined) {
        this.reveal(index); // re-renders the window, which calls back here without revealing
        return;
      }
    }
    // The roving tab stop must be a row that exists; if the focus row is scrolled away, use the first built row.
    const tabbable = this.focusId && this.rows.has(this.focusId) ? this.focusId : this.rows.keys().next().value;
    for (const [id, row] of this.rows) {
      setAttr(row.tr, 'aria-selected', String(id === selectedId));
      row.tr.tabIndex = id === tabbable ? 0 : -1;
    }
  }

  /** Arrow keys, Page Up/Down, Home and End move between rows; Enter or Space selects. */
  private onKey(event: KeyboardEvent): void {
    const current = event.target instanceof HTMLTableRowElement ? event.target : null;
    const id = current?.dataset.id;
    const index = id ? this.indexOf.get(id) : undefined;
    if (!id || index === undefined) return;
    const headerHeight = this.table.tHead?.offsetHeight ?? 0;
    const page = Math.max(1, Math.floor((this.scroller.clientHeight - headerHeight) / this.rowHeight) - 1);
    let target: number;
    switch (event.key) {
      case 'ArrowDown':
        target = index + 1;
        break;
      case 'ArrowUp':
        target = index - 1;
        break;
      case 'PageDown':
        target = index + page;
        break;
      case 'PageUp':
        target = index - page;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = this.ordered.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.choose(id);
        return;
      default:
        return;
    }
    event.preventDefault();
    target = Math.max(0, Math.min(this.ordered.length - 1, target));
    const nextId = this.ordered[target]?.id;
    if (!nextId || target === index) return;
    this.focusId = nextId;
    this.reveal(target); // builds the row if it was outside the window
    this.rows.get(nextId)?.tr.focus({ preventScroll: true });
  }
}

function rowId(target: EventTarget | null): string | undefined {
  return target instanceof Element ? target.closest<HTMLElement>('tr[data-id]')?.dataset.id : undefined;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setAttr(el: HTMLElement, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** An empty row that stands in for the rows outside the window. */
function spacerRow(): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'track-spacer';
  tr.setAttribute('aria-hidden', 'true');
  tr.insertCell().colSpan = 5;
  return tr;
}

function setTitle(el: HTMLElement | null, text: string): void {
  if (el && el.title !== text) el.title = text;
}
