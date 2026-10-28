import type { Track } from '@watchfloor/shared';
import { trackIconKey, trackIconSvg } from '../map/trackIcon';
import type { TrackLayer } from '../map/trackLayer';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { SymbolStyleSetting } from '../state/symbolStyle';
import type { TrackStore } from '../state/trackStore';
import {
  AFFILIATION_LABEL,
  PLATFORM_LABEL,
  formatSource,
  formatAge,
  formatAircraftType,
  formatAltitude,
  formatCourse,
  formatLat,
  formatLon,
  formatSpeed,
} from './format';

/** Readout for the selected track. Fields update in place twice a second. */
export class DetailsPanel {
  private readonly fields: Record<string, HTMLElement>;
  private readonly altitudeRow: HTMLElement;
  private readonly typeRow: HTMLElement;
  private readonly staleNote: HTMLElement;
  private readonly followButton: HTMLButtonElement;
  private readonly symbol: HTMLElement;
  /** The icon last drawn, so the SVG is only rebuilt when the icon changes, not every refresh. */
  private iconKey = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
    private readonly selection: Selection,
    private readonly style: SymbolStyleSetting,
  ) {
    const q = <T extends HTMLElement>(sel: string) => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`Details panel is missing ${sel}`);
      return el;
    };
    this.fields = {};
    for (const el of root.querySelectorAll<HTMLElement>('[data-field]')) {
      this.fields[el.dataset.field!] = el;
    }
    this.altitudeRow = q('[data-altitude-row]');
    this.typeRow = q('[data-type-row]');
    this.staleNote = q('[data-stale-note]');
    this.followButton = q<HTMLButtonElement>('[data-follow]');
    this.symbol = q('[data-symbol]');

    q('[data-close]').addEventListener('click', () => selection.select(null));
    this.followButton.addEventListener('click', () => selection.setFollow(!selection.follow));

    style.subscribe(() => this.update());
    selection.subscribe((id, previous) => {
      this.root.hidden = id === null;
      if (id !== previous) this.root.classList.remove('details-enter');
      if (id !== null && id !== previous) {
        void this.root.offsetWidth;
        this.root.classList.add('details-enter');
      }
      this.update();
    });
    window.setInterval(() => this.update(), 500);
  }

  private set(field: string, text: string): void {
    const el = this.fields[field];
    if (el && el.textContent !== text) el.textContent = text;
  }

  private update(): void {
    const id = this.selection.id;
    const track = id ? this.store.get(id) : undefined;
    if (!track) return;
    this.render(track);
  }

  private render(track: Track): void {
    const now = this.clock.now();
    const pos = this.layer.positionOf(track.id) ?? track;
    const age = now - track.observedAt;
    const stale = this.store.status(track, now) === 'stale';

    this.set('title', track.callsign ?? 'No callsign');
    this.set(
      'identity',
      `${PLATFORM_LABEL[track.platform]}, ${AFFILIATION_LABEL[track.affiliation].toLowerCase()}`,
    );
    const iconKey = trackIconKey(track, this.style.value);
    if (iconKey !== this.iconKey) {
      this.symbol.innerHTML = trackIconSvg(track, this.style.value, 34);
      this.iconKey = iconKey;
    }
    this.set('lat', formatLat(pos.lat));
    this.set('lon', formatLon(pos.lon));
    this.set('course', formatCourse(track.courseDeg));
    this.set('speed', formatSpeed(track.speedMps));
    this.set('altitude', formatAltitude(track.altitudeM));
    this.altitudeRow.hidden = track.domain !== 'air';
    const aircraftType = formatAircraftType(track);
    this.set('aircraft-type', aircraftType);
    this.typeRow.hidden = aircraftType === '';
    this.set('age', formatAge(age));
    this.set('source', formatSource(track));
    this.set('id', track.id);

    this.staleNote.hidden = !stale;
    this.root.classList.toggle('details-stale', stale);

    const following = this.selection.follow;
    this.followButton.setAttribute('aria-pressed', String(following));
    this.followButton.textContent = following ? 'Stop following' : 'Follow on map';
  }
}
