import type { Track } from '@watchfloor/shared';
import { AFFILIATION_COLOR, type TrackLayer } from '../map/trackLayer';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import {
  AFFILIATION_LABEL,
  PLATFORM_LABEL,
  formatSource,
  formatAge,
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
  private readonly staleNote: HTMLElement;
  private readonly followButton: HTMLButtonElement;
  private readonly swatch: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
    private readonly selection: Selection,
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
    this.staleNote = q('[data-stale-note]');
    this.followButton = q<HTMLButtonElement>('[data-follow]');
    this.swatch = q('[data-swatch]');

    q('[data-close]').addEventListener('click', () => selection.select(null));
    this.followButton.addEventListener('click', () => selection.setFollow(!selection.follow));

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
    this.swatch.style.background = AFFILIATION_COLOR[track.affiliation];
    this.set('lat', formatLat(pos.lat));
    this.set('lon', formatLon(pos.lon));
    this.set('course', formatCourse(track.courseDeg));
    this.set('speed', formatSpeed(track.speedMps));
    this.set('altitude', formatAltitude(track.altitudeM));
    this.altitudeRow.hidden = track.domain !== 'air';
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
