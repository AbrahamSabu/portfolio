import airportsUrl from '../data/airports.json?url';
import { parseAirports, type Airport } from '../map/airports';
import { CHOKEPOINTS, centreOf } from '../state/chokepoints';
import { searchPalette, type PaletteMatch } from '../state/paletteSearch';

/** Where a pick takes the steered screen, and how the list names it. */
export interface PlaceTarget {
  label: string;
  detail: string;
  lon: number;
  lat: number;
  zoom: number;
}

/** An airport close enough to see its traffic; a chokepoint's narrows. */
export function placeTarget(match: PaletteMatch): PlaceTarget | null {
  switch (match.kind) {
    case 'airport': {
      const a = match.airport;
      return { label: a.name, detail: [a.code, a.iata, a.city].filter(Boolean).join(' · '), lon: a.lon, lat: a.lat, zoom: 9 };
    }
    case 'chokepoint': {
      const c = match.chokepoint;
      const [lon, lat] = centreOf(c.box);
      return { label: c.name, detail: 'Shipping chokepoint', lon, lat, zoom: 8 };
    }
    default:
      return null;
  }
}

/** Chokepoints until something is typed: they're the places a ship-watcher checks first. */
const SUGGESTIONS: PlaceTarget[] = CHOKEPOINTS.map((chokepoint) => placeTarget({ kind: 'chokepoint', chokepoint })!);

/**
 * The Places tab: search airports and shipping chokepoints with the main
 * map's own search scoring (codes beat names, prefixes beat substrings), and
 * fly the steered screen to a pick. Airports load the first time the tab
 * opens: the track list never needs them.
 */
export class PlacesPanel {
  private airports: Airport[] | null = null;
  private loading = false;
  private shown: PlaceTarget[] = [];

  constructor(
    private readonly input: HTMLInputElement,
    private readonly list: HTMLElement,
    onPick: (place: PlaceTarget) => void,
  ) {
    input.addEventListener('input', () => this.render());
    list.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      const place = row ? this.shown[Number(row.dataset.index)] : undefined;
      if (place) onPick(place);
    });
    this.render();
  }

  async load(): Promise<void> {
    if (this.airports || this.loading) return;
    this.loading = true;
    try {
      const res = await fetch(airportsUrl);
      this.airports = res.ok ? parseAirports(await res.json()) : [];
    } catch {
      this.airports = []; // chokepoints still work
    }
    this.loading = false;
    this.render();
  }

  private render(): void {
    const query = this.input.value.trim();
    this.shown = query
      ? searchPalette(query, { tracks: [], airports: this.airports ?? [], areas: [] }, 25)
          .map(placeTarget)
          .filter((p): p is PlaceTarget => p !== null)
      : SUGGESTIONS;
    const rows: HTMLElement[] = this.shown.map((place, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'console-place';
      row.dataset.index = String(index);
      const label = document.createElement('span');
      label.className = 'console-place-name';
      label.textContent = place.label;
      const detail = document.createElement('span');
      detail.className = 'console-place-detail';
      detail.textContent = place.detail;
      row.append(label, detail);
      return row;
    });
    if (query && rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'console-lede';
      empty.textContent = this.loading ? 'Loading airports…' : 'Nothing by that name or code.';
      rows.push(empty);
    }
    this.list.replaceChildren(...rows);
  }
}
