import { airportCode } from '../map/airports';
import { searchPalette, type PaletteMatch, type PaletteSources } from '../state/paletteSearch';
import { PLATFORM_LABEL } from './format';

const KIND_LABEL: Record<PaletteMatch['kind'], string> = {
  track: 'Track',
  airport: 'Airport',
  chokepoint: 'Chokepoint',
  area: 'Watch area',
};

/**
 * The search palette (/ or Ctrl K): one box that finds tracks by callsign,
 * squawk or type, airports by code or name, chokepoints and watch areas,
 * and hands the pick to main.ts to take the camera there. Modal over the
 * map; typing searches as you go, arrows choose, Enter or a click goes.
 */
export class Palette {
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private results: PaletteMatch[] = [];
  private active = 0;
  /** What had focus when the palette opened: it gets it back when the palette closes. */
  private opener: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly sources: () => PaletteSources,
    private readonly onPick: (match: PaletteMatch) => void,
  ) {
    this.input = root.querySelector('input')!;
    this.list = root.querySelector('[data-results]')!;
    this.empty = root.querySelector('[data-empty]')!;
    // A click on the dimmed map behind the box closes, like Escape.
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) this.setOpen(false);
    });
    this.input.addEventListener('input', () => this.search());
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    this.list.addEventListener('click', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('[data-i]');
      if (row) this.pick(Number(row.dataset.i));
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.root.hidden = !open;
    if (open) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.input.value = '';
      this.search();
      this.input.focus();
    } else {
      // Back where the operator was (a button, the map): focus used to land on the body.
      if (this.opener?.isConnected && document.activeElement === this.input) this.opener.focus();
      this.opener = null;
    }
  }

  private onKey(event: KeyboardEvent): void {
    // The global shortcuts must not see these: Escape here closes the palette, not a panel behind it.
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.setOpen(false);
    } else if (event.key === 'Tab') {
      // Modal: the input is the only control, and Tab used to walk off behind the backdrop.
      event.preventDefault();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const n = this.results.length;
      if (n > 0) this.active = (this.active + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.render();
    } else if (event.key === 'Enter') {
      this.pick(this.active);
    }
  }

  private pick(i: number): void {
    const match = this.results[i];
    if (!match) return;
    this.setOpen(false);
    this.onPick(match);
  }

  private search(): void {
    this.results = searchPalette(this.input.value, this.sources());
    this.active = 0;
    this.render();
  }

  private render(): void {
    this.list.replaceChildren(
      ...this.results.map((match, i) => {
        const row = document.createElement('li');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === this.active));
        row.className = i === this.active ? 'palette-row palette-active' : 'palette-row';
        row.id = `palette-option-${i}`;
        row.dataset.i = String(i);
        const [titleText, detailText] = describe(match);
        const title = document.createElement('span');
        title.className = 'palette-title';
        title.textContent = titleText;
        const detail = document.createElement('span');
        detail.className = 'palette-detail';
        detail.textContent = detailText;
        const kind = document.createElement('span');
        kind.className = 'palette-kind';
        kind.textContent = KIND_LABEL[match.kind];
        row.append(title, detail, kind);
        return row;
      }),
    );
    this.input.setAttribute('aria-expanded', String(this.results.length > 0));
    // The highlighted result, for a screen reader (the arrows move it; it was never announced).
    if (this.results.length > 0) this.input.setAttribute('aria-activedescendant', `palette-option-${this.active}`);
    else this.input.removeAttribute('aria-activedescendant');
    const query = this.input.value.trim();
    const miss = query.length > 0 && this.results.length === 0;
    this.empty.hidden = !miss;
    this.empty.textContent = miss ? `Nothing matches "${query}". Try a callsign, squawk, type, airport code, chokepoint or watch area.` : '';
  }
}

/** The row's two lines; names come from feeds, so textContent only. */
function describe(match: PaletteMatch): [title: string, detail: string] {
  switch (match.kind) {
    case 'track': {
      const t = match.track;
      const bits = [PLATFORM_LABEL[t.platform], t.model, t.squawk ? `squawk ${t.squawk}` : undefined];
      return [t.callsign ?? (t.id.split(':')[1] ?? t.id).toUpperCase(), bits.filter(Boolean).join(' · ')];
    }
    case 'airport': {
      const a = match.airport;
      return [`${airportCode(a)} · ${a.name}`, a.city];
    }
    case 'chokepoint':
      return [match.chokepoint.name, 'Shipping chokepoint'];
    case 'area':
      return [match.area.name, 'Watch area'];
  }
}
