import type { Track, TrackDetails } from '@watchfloor/shared';
import { shapeSvg, shapeFor } from '../map/shapes';
import { trackIconKey, trackIconSvg } from '../map/trackIcon';
import { aircraftPhoto, type Photo } from '../net/photos';
import { commonsPhoto, shipInfo, type ShipInfo } from '../net/shipInfo';
import type { SelectedDetails } from '../state/selectedDetails';
import type { TrackLayer } from '../map/trackLayer';
import type { ServerClock } from '../state/clock';
import type { SelectedPath } from '../state/selectedPath';
import type { Selection } from '../state/selection';
import type { SymbolStyleSetting } from '../state/symbolStyle';
import type { TrackStore } from '../state/trackStore';
import {
  AFFILIATION_LABEL,
  PLATFORM_LABEL,
  formatDestination,
  formatOperator,
  formatPathSpan,
  formatShipSize,
  formatShipType,
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
  private readonly fitButton: HTMLButtonElement;
  private readonly symbol: HTMLElement;
  /** The icon last drawn, so the SVG is only rebuilt when the icon changes, not every refresh. */
  private iconKey = '';
  private readonly rows: Record<string, HTMLElement> = {};
  private readonly photoLink: HTMLAnchorElement;
  private readonly photoImg: HTMLImageElement;
  private readonly photoCredit: HTMLElement;
  private readonly photoCreditLink: HTMLAnchorElement;
  private readonly drawing: HTMLElement;
  private readonly privateNote: HTMLElement;
  private readonly airlineCredit: HTMLElement;
  private readonly wikidataCredit: HTMLElement;
  private readonly photoSource: HTMLElement;
  /** The drawing last made (shape and colour), like iconKey. */
  private drawingKey = '';
  /** The track whose photo and facts were asked for, so each selection asks once. */
  private lookedUpFor: string | null = null;
  private photo: Photo | null = null;
  private shipFacts: ShipInfo | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
    private readonly selection: Selection,
    private readonly style: SymbolStyleSetting,
    private readonly path: SelectedPath,
    private readonly details: SelectedDetails,
    fitPath: () => void,
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
    for (const el of root.querySelectorAll<HTMLElement>('[data-row]')) this.rows[el.dataset.row!] = el;
    this.photoLink = q<HTMLAnchorElement>('[data-photo-link]');
    this.photoImg = q<HTMLImageElement>('[data-photo-img]');
    this.photoCredit = q('[data-photo-credit]');
    this.photoCreditLink = q<HTMLAnchorElement>('[data-photo-credit-link]');
    this.drawing = q('[data-drawing]');
    this.privateNote = q('[data-private-note]');
    this.airlineCredit = q('[data-airline-credit]');
    this.wikidataCredit = q('[data-wikidata-credit]');
    this.photoSource = q('[data-photo-source]');

    q('[data-close]').addEventListener('click', () => selection.select(null));
    this.followButton.addEventListener('click', () => selection.setFollow(!selection.follow));

    style.subscribe(() => this.update());
    path.subscribe(() => this.update());
    details.subscribe(() => this.update());
    this.fitButton = q<HTMLButtonElement>('[data-fit-path]');
    this.fitButton.addEventListener('click', fitPath);
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

  /** Set a row's value, hiding the whole row when there's nothing to say. */
  private setRow(row: string, text: string): void {
    this.set(row, text);
    const el = this.rows[row];
    if (el) el.hidden = text === '';
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
    this.set('path', formatPathSpan(this.path, now));
    this.fitButton.disabled = this.path.points.length < 2;
    this.set('altitude', formatAltitude(track.altitudeM));
    this.altitudeRow.hidden = track.domain !== 'air';
    const aircraftType = formatAircraftType(track);
    this.set('aircraft-type', aircraftType);
    this.typeRow.hidden = aircraftType === '';
    this.set('age', formatAge(age));
    this.set('source', formatSource(track));
    this.set('id', track.id);
    this.renderDetails(track);

    this.staleNote.hidden = !stale;
    this.root.classList.toggle('details-stale', stale);

    const following = this.selection.follow;
    this.followButton.setAttribute('aria-pressed', String(following));
    this.followButton.textContent = following ? 'Stop following' : 'Follow on map';
  }

  /** Who flies it, where it's from, what a ship says about its voyage, and a picture. */
  private renderDetails(track: Track): void {
    const details = this.details.id === track.id ? this.details.details : undefined;
    const ship = details?.ship;
    const facts = this.lookedUpFor === track.id ? this.shipFacts : null;
    this.setRow('ship-type', track.domain === 'sea' ? formatShipType(ship?.aisType) : '');
    this.setRow('class', facts?.shipClass ?? '');
    this.setRow('operator', facts?.operator ?? formatOperator(details));
    this.set('country-label', track.domain === 'sea' ? 'Flag' : 'Registered in');
    this.setRow('country', details?.country ?? '');
    this.setRow('built', facts?.built ? String(facts.built) : '');
    this.setRow('destination', formatDestination(ship));
    this.setRow('size', formatShipSize(ship));
    this.setRow('imo', ship?.imo ? String(ship.imo) : '');
    this.setRow('call-sign', ship?.callSign ?? '');
    this.privateNote.hidden = !details?.private;
    this.airlineCredit.hidden = !details?.airline;
    this.wikidataCredit.hidden = !(facts && (facts.shipClass || facts.operator || facts.built));

    if (track.id !== this.lookedUpFor) {
      this.photo = null;
      this.shipFacts = null;
      this.lookedUpFor = null;
    }
    // Look up once the server has answered: it says whether an aircraft is
    // private, and gives a ship's IMO number, the surest way to find it.
    if (details && this.lookedUpFor === null) {
      this.lookedUpFor = track.id;
      void this.lookUp(track, details);
    }
    this.renderPicture(track);
  }

  /** An aircraft's photo from Planespotters; a ship's facts and photo from Wikidata and Commons. */
  private async lookUp(track: Track, details: TrackDetails): Promise<void> {
    const native = track.id.slice(track.id.indexOf(':') + 1);
    const current = () => this.lookedUpFor === track.id; // the selection may move on meanwhile
    if (track.source === 'adsb' && !details.private) {
      const photo = await aircraftPhoto(native);
      if (!current()) return;
      this.photo = photo;
    } else if (track.source === 'ais') {
      const facts = await shipInfo(native, details.ship?.imo, track.callsign);
      if (!current()) return;
      this.shipFacts = facts;
      this.update();
      const photo = facts?.image ? await commonsPhoto(facts.image) : null;
      if (!current()) return;
      this.photo = photo;
    } else {
      return;
    }
    this.update();
  }

  /** The vehicle's photo when there is one, else a large drawing of its shape. */
  private renderPicture(track: Track): void {
    const photo = this.photo;
    this.photoLink.hidden = !photo;
    this.photoCredit.hidden = !photo;
    this.drawing.hidden = !!photo;
    if (photo) {
      if (this.photoImg.src !== photo.src) {
        this.photoImg.src = photo.src;
        this.photoImg.width = photo.width;
        this.photoImg.height = photo.height;
        this.photoLink.href = photo.link;
        this.photoCreditLink.href = photo.link;
        this.photoCreditLink.textContent = photo.credit;
        this.photoSource.textContent = photo.source;
      }
      const name = track.domain === 'sea' ? (this.shipFacts?.name ?? track.callsign ?? 'this ship') : (track.model ?? 'this aircraft');
      this.photoImg.alt = `Photo of ${name}`;
      return;
    }
    // Always the top-down shape, whatever the map style: it's a picture, not a symbol.
    const { shape } = shapeFor(track);
    const key = `${shape}:${track.affiliation}`;
    if (key !== this.drawingKey) {
      this.drawing.innerHTML = shapeSvg(shape, track.affiliation, 88);
      this.drawingKey = key;
    }
  }
}
