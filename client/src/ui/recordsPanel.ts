import type { Board, RecordEntry } from '@watchfloor/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fly } from '../map/camera';

/**
 * The Leaderboard tab: who holds the records in the picture right now, the
 * highest, fastest and biggest aircraft, the busiest airlines, the fastest
 * ships and so on, three places each. The server works the boards out (it
 * knows which aircraft asked not to be tracked, and leaves them off) and
 * sends them every half minute. A place is a track: picking it selects it
 * and flies there, and the panel steps aside for the map.
 */
export class RecordsPanel {
  private boards: Board[] = [];
  private readonly body: HTMLElement;
  private readonly empty: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly button: HTMLButtonElement,
    private readonly map: MapLibreMap,
    /** Select a track if it's still in the picture; false if it isn't. */
    private readonly select: (trackId: string) => boolean,
    /** Called when the panel opens, so another in the same place can close. */
    private readonly onOpen: () => void = () => {},
  ) {
    this.body = root.querySelector('[data-boards]')!;
    this.empty = root.querySelector('[data-empty]')!;
    button.addEventListener('click', () => this.setOpen(!this.open));
    root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    root.addEventListener('click', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-board]');
      const entry = row && this.boards.find((b) => b.id === row.dataset.board)?.entries[Number(row.dataset.place)];
      if (entry) this.pick(entry);
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.onOpen();
      this.render();
    }
  }

  /** The latest boards from the server. */
  load(boards: Board[]): void {
    this.boards = boards;
    if (this.open) this.render();
  }

  private pick(entry: RecordEntry): void {
    const selected = entry.trackId !== undefined && this.select(entry.trackId);
    if (entry.lat !== undefined && entry.lon !== undefined) {
      fly(this.map, { center: [entry.lon, entry.lat], zoom: Math.max(this.map.getZoom(), selected ? 6 : 5) });
    }
    this.setOpen(false);
  }

  private render(): void {
    this.empty.hidden = this.boards.length > 0;
    this.body.replaceChildren(...this.boards.map((b) => this.section(b)));
  }

  private section(board: Board): HTMLElement {
    const section = document.createElement('section');
    section.className = 'records-board';
    const title = document.createElement('h3');
    title.className = 'rare-group';
    title.textContent = board.title;
    section.append(title);
    if (board.note) {
      const note = document.createElement('p');
      note.className = 'records-note';
      note.textContent = board.note;
      section.append(note);
    }
    const list = document.createElement('ol');
    list.className = 'rare-list';
    list.append(...board.entries.map((e, i) => this.row(board, e, i)));
    section.append(list);
    return section;
  }

  /** One place: its rank, who holds it, the figure, and what it is. */
  private row(board: Board, e: RecordEntry, place: number): HTMLLIElement {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rare-item record-item';
    button.dataset.board = board.id;
    button.dataset.place = String(place);
    const rank = document.createElement('span');
    rank.className = 'record-rank';
    rank.textContent = String(place + 1);
    const name = document.createElement('span');
    name.className = 'rare-item-type';
    name.textContent = e.name;
    const value = document.createElement('span');
    value.className = 'rare-item-name';
    value.textContent = e.value;
    button.append(rank, name, value);
    if (e.detail) {
      const detail = document.createElement('span');
      detail.className = 'rare-item-facts';
      detail.textContent = e.detail;
      button.append(detail);
    }
    item.append(button);
    return item;
  }
}
