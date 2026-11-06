import type { Track } from '@watchfloor/shared';
import { shapeFor, shapeSvg } from '../map/shapes';
import { visibleRange } from '../ui/listWindow';
import { trackName } from '../room/roomView';
import { rowFacts, trackKind } from './consoleText';

/** Fixed row height: a row's place is its index times this, so only rows in view need to exist. */
const ROW_PX = 60;
const OVERSCAN = 8;

const icons = new Map<string, string>();

/** The vehicle shape in its identity colour, as the map draws it; one SVG string per shape and colour. */
function iconFor(track: Track): string {
  const key = `${shapeFor(track).shape}:${track.affiliation}`;
  let svg = icons.get(key);
  if (!svg) {
    svg = shapeSvg(shapeFor(track).shape, track.affiliation, 28);
    icons.set(key, svg);
  }
  return svg;
}

/**
 * The phone's track list: windowed like the main screen's (a world picture
 * is thousands of rows), each row a button that opens the track's details.
 * Rows are rebuilt for the window on every change, which is cheap at a few
 * dozen.
 */
export class ConsoleList {
  private tracks: Track[] = [];
  private isStale: (track: Track) => boolean = () => false;
  private frame = 0;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly sizer: HTMLElement,
    onPick: (id: string) => void,
  ) {
    scroller.addEventListener('scroll', () => this.schedule(), { passive: true });
    window.addEventListener('resize', () => this.schedule());
    sizer.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (row?.dataset.id) onPick(row.dataset.id);
    });
  }

  set(tracks: Track[], isStale: (track: Track) => boolean): void {
    this.tracks = tracks;
    this.isStale = isStale;
    this.schedule();
  }

  private schedule(): void {
    this.frame ||= requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render(): void {
    this.sizer.style.height = `${this.tracks.length * ROW_PX}px`;
    const { start, end } = visibleRange(
      { scrollTop: this.scroller.scrollTop, height: this.scroller.clientHeight, headerHeight: 0, rowHeight: ROW_PX },
      this.tracks.length,
      OVERSCAN,
    );
    const rows: HTMLElement[] = [];
    for (let i = start; i < end; i++) rows.push(this.row(this.tracks[i]!, i));
    this.sizer.replaceChildren(...rows);
  }

  private row(track: Track, index: number): HTMLElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'console-row';
    row.setAttribute('role', 'listitem');
    row.dataset.id = track.id;
    row.style.top = `${index * ROW_PX}px`;
    row.classList.toggle('console-row-stale', this.isStale(track));
    const icon = document.createElement('span');
    icon.className = 'console-row-icon';
    icon.innerHTML = iconFor(track); // built from our own constants only
    const name = document.createElement('span');
    name.className = 'console-row-name';
    name.textContent = trackName(track); // names come from feeds: text only
    const kind = document.createElement('span');
    kind.className = 'console-row-kind';
    kind.textContent = trackKind(track);
    const facts = document.createElement('span');
    facts.className = 'console-row-facts';
    facts.textContent = rowFacts(track);
    row.append(icon, name, kind, facts);
    return row;
  }
}
