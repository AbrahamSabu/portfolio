import type { AirportWeather } from '@watchfloor/shared';
import type { Airport } from '../map/airports';
import { airportCode } from '../map/airports';
import { airportTraffic, type NearbyAircraft } from '../state/airportTraffic';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatAge, formatAltitude, formatNewsTime } from './format';
import { CATEGORY_MEANING, formatClouds, formatVisibility, formatWind } from './weatherFormat';

/** Traffic moves; the list is redrawn this often while the panel is open. */
const TRAFFIC_MS = 2_000;
/** Weather is asked for again after this long (the server caches it too). */
const WEATHER_MS = 10 * 60_000;
const LIST_MAX = 6;

/**
 * An airport's panel, on the right where the briefing goes (it steps
 * aside): the latest weather report, decoded with the raw report beneath,
 * and the aircraft arriving and leaving now, from the live picture.
 * Choosing an aircraft selects it (and the track's details take the panel's
 * place). Opened by clicking an airport.
 */
export class AirportPanel {
  private airport: Airport | null = null;
  private trafficTimer: number | undefined;
  private weatherTimer: number | undefined;
  private readonly fields: Record<'codes' | 'name' | 'place' | 'weather' | 'traffic', HTMLElement>;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly selection: Selection,
    private readonly countryName: (iso: string) => string | undefined,
  ) {
    const q = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    this.fields = { codes: q('codes'), name: q('name'), place: q('place'), weather: q('weather'), traffic: q('traffic') };
    root.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.fields.traffic.addEventListener('click', (event) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id) selection.select(id);
    });
    // A selected track's details take the right side.
    selection.subscribe(() => {
      if (selection.id) this.close();
    });
  }

  get isOpen(): boolean {
    return this.airport !== null;
  }

  open(airport: Airport): void {
    this.selection.select(null);
    this.airport = airport;
    this.fields.codes.textContent = [airport.iata, airport.code].filter(Boolean).join(' · ');
    this.fields.name.textContent = airport.name;
    const country = this.countryName(airport.country) ?? airport.country;
    this.fields.place.textContent = airport.city ? `${airport.city}, ${country}` : country;
    this.fields.weather.replaceChildren(text('p', 'airport-muted', 'Fetching the latest report…'));
    this.root.hidden = false;
    document.querySelector('.app')?.classList.add('airport-open');
    this.drawTraffic();
    void this.loadWeather();
    window.clearInterval(this.trafficTimer);
    window.clearInterval(this.weatherTimer);
    this.trafficTimer = window.setInterval(() => this.drawTraffic(), TRAFFIC_MS);
    this.weatherTimer = window.setInterval(() => void this.loadWeather(), WEATHER_MS);
  }

  close(): void {
    if (!this.airport) return;
    this.airport = null;
    this.root.hidden = true;
    document.querySelector('.app')?.classList.remove('airport-open');
    window.clearInterval(this.trafficTimer);
    window.clearInterval(this.weatherTimer);
  }

  private async loadWeather(): Promise<void> {
    const airport = this.airport;
    if (!airport) return;
    // The static demo has no server, and aviationweather.gov and NOAA both refuse browsers' requests: say so, rather than fail.
    if (import.meta.env.VITE_DEMO) {
      this.fields.weather.replaceChildren(text('p', 'airport-muted', "Live weather comes from the Watchfloor server, which this browser-only demo doesn't have."));
      return;
    }
    let weather: AirportWeather | null = null;
    let failed = false;
    // Weather stations are ICAO coded; airports without an ICAO code have none.
    if (/^[A-Z]{4}$/.test(airport.code)) {
      try {
        const res = await fetch(`/api/weather/${airport.code}`);
        if (!res.ok) throw new Error(String(res.status));
        weather = ((await res.json()) as { weather: AirportWeather | null }).weather;
      } catch {
        failed = true;
      }
    }
    if (this.airport !== airport) return; // another airport opened meanwhile
    this.fields.weather.replaceChildren(...(weather ? this.weatherRows(weather) : [text('p', 'airport-muted', failed ? 'The weather service could not be reached.' : 'No recent weather report for this airport.')]));
  }

  /** Decoded rows, then the raw report and its source. Text only via textContent. */
  private weatherRows(w: AirportWeather): HTMLElement[] {
    const rows: [string, string | null][] = [
      ['Wind', formatWind(w)],
      ['Visibility', formatVisibility(w.visibility)],
      ['Cloud', formatClouds(w.clouds)],
      ['Temperature', w.tempC === undefined ? null : `${w.tempC} °C${w.dewpointC === undefined ? '' : `, dew point ${w.dewpointC} °C`}`],
      ['Pressure', w.pressureHpa === undefined ? null : `${Math.round(w.pressureHpa)} hPa`],
    ];
    const list = document.createElement('dl');
    list.className = 'airport-rows';
    for (const [label, value] of rows) {
      if (!value) continue;
      list.append(text('dt', '', label), text('dd', '', value));
    }
    const head = document.createElement('div');
    head.className = 'airport-weather-head';
    if (w.category) {
      const badge = text('span', `airport-category airport-category-${w.category.toLowerCase()}`, w.category);
      badge.title = CATEGORY_MEANING[w.category];
      head.append(badge);
    }
    head.append(text('span', 'airport-muted', `Observed ${formatNewsTime(w.observedAt)}, ${formatAge(Math.max(0, this.clock.now() - w.observedAt))}`));
    const raw = text('code', 'airport-raw', w.raw);
    const credit = document.createElement('p');
    credit.className = 'airport-credit';
    const link = document.createElement('a');
    link.href = 'https://aviationweather.gov/';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'aviationweather.gov';
    credit.append('Weather: ', link, ' (NOAA)');
    return [head, list, raw, credit];
  }

  private drawTraffic(): void {
    if (!this.airport) return;
    const traffic = airportTraffic(this.airport, this.store.all());
    const groups: [string, NearbyAircraft[]][] = [
      ['Arriving', traffic.inbound],
      ['Leaving', traffic.outbound],
      ['Nearby', traffic.nearby],
    ];
    const parts: HTMLElement[] = [];
    for (const [title, list] of groups) {
      if (list.length === 0) continue;
      parts.push(text('h4', 'airport-group', `${title} · ${list.length}`));
      const ul = document.createElement('ul');
      ul.className = 'airport-traffic';
      for (const { track, distanceM } of list.slice(0, LIST_MAX)) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.id = track.id;
        button.append(
          text('span', 'airport-callsign', track.callsign ?? 'No callsign'),
          text('span', 'airport-muted', `${formatAltitude(track.altitudeM) || 'altitude unknown'} · ${Math.round(distanceM / 1000)} km`),
        );
        li.append(button);
        ul.append(li);
      }
      parts.push(ul);
    }
    if (parts.length === 0) parts.push(text('p', 'airport-muted', `No aircraft below 10,000 ft within 40 km of ${airportCode(this.airport)} right now.`));
    this.fields.traffic.replaceChildren(...parts);
  }
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = content;
  return el;
}
