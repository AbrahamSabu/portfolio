import type { Map as MapLibreMap } from 'maplibre-gl';
import type { ClientMessage, ConsolePresence, RoomServerMessage } from '@watchfloor/shared';
import { fly } from '../map/camera';
import type { TrackLayer } from '../map/trackLayer';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { PresenceMarkers } from './presenceMarkers';
import { RoomDialog } from './roomDialog';
import { roomView, trackName, type RoomState } from './roomView';
import './room.css';

export interface RoomHostDeps {
  map: MapLibreMap;
  store: TrackStore;
  layer: TrackLayer;
  selection: Selection;
  send: (message: ClientMessage) => void;
  /** Hands the camera over before showing a console's track: stops a tour, leaves a replay. */
  takeCamera: () => void;
  /** False in the static demo: there is no server for phones to join. */
  live: boolean;
}

/** How long "CONSOLE ALFA sent BAW123" stays up. */
const TOAST_MS = 5_000;

/**
 * The main screen's side of the ops room (Q): opens a room, shows how to
 * join (QR code, link, code), tags the tracks consoles have open, and shows
 * the tracks they send. It all lasts as long as the page: a reload or a
 * closed room starts again from nothing.
 */
export class RoomHost {
  private state: RoomState = { kind: 'none' };
  private consoles: ConsolePresence[] = [];
  private readonly dialog: RoomDialog;
  private readonly markers: PresenceMarkers;
  private readonly chip: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private toastTimer: number | undefined;

  constructor(private readonly deps: RoomHostDeps) {
    this.dialog = new RoomDialog(() => this.leave());
    this.markers = new PresenceMarkers(deps.map, deps.layer);
    this.chip = makeChip();
    this.chip.addEventListener('click', () => this.toggle());
    // First in the top bar's right-hand group, where status chips live.
    document.querySelector('.topbar-end')?.prepend(this.chip);
    this.toast = document.createElement('p');
    this.toast.className = 'room-toast';
    this.toast.setAttribute('role', 'status');
    this.toast.hidden = true;
    (document.querySelector('.app') ?? document.body).append(this.toast);
  }

  /** Q: the first press opens a room and shows how to join; later presses show or hide that. */
  toggle(): void {
    if (this.dialog.open) {
      this.dialog.close();
      return;
    }
    if (this.deps.live && (this.state.kind === 'none' || this.state.kind === 'ended')) this.open();
    this.render();
    this.dialog.show();
  }

  /** After every hello: the socket is new, so reclaim the room (or ask again for one). */
  reconnected(): void {
    if (this.state.kind === 'open') this.deps.send({ type: 'room-open', code: this.state.code, key: this.state.key });
    else if (this.state.kind === 'opening') this.deps.send({ type: 'room-open' });
  }

  handle(message: RoomServerMessage): void {
    switch (message.type) {
      case 'room':
        if (message.role !== 'main') return;
        this.state = { kind: 'open', code: message.code, key: message.key, origins: message.origins };
        break;
      case 'room-presence':
        if (this.state.kind !== 'open') return;
        this.consoles = message.consoles;
        this.markers.set(message.consoles);
        break;
      case 'room-show':
        if (this.state.kind === 'open') this.show(message.id, message.from);
        return;
      case 'room-closed':
        // After Close room the server confirms; nothing more to do.
        if (this.state.kind === 'none') return;
        this.state = { kind: 'ended', reason: message.reason };
        this.consoles = [];
        this.markers.set([]);
        break;
    }
    this.render();
  }

  private open(): void {
    this.state = { kind: 'opening' };
    this.deps.send({ type: 'room-open' });
  }

  private leave(): void {
    this.deps.send({ type: 'room-leave' });
    this.state = { kind: 'none' };
    this.consoles = [];
    this.markers.set([]);
    this.dialog.close();
    this.render();
  }

  /** A console sent a track: take the camera there and select it, as a search pick would. */
  private show(id: string, from: string): void {
    const { store, layer, selection, map } = this.deps;
    const track = store.get(id);
    if (!track) {
      this.say(`CONSOLE ${from} sent a track that has left the picture`);
      return;
    }
    this.dialog.close();
    this.deps.takeCamera();
    selection.setFollow(false);
    selection.select(id);
    const pos = layer.positionOf(id) ?? { lon: track.lon, lat: track.lat };
    fly(map, { center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 7) });
    this.say(`CONSOLE ${from} sent ${trackName(track)}`);
  }

  private say(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), TOAST_MS);
  }

  private render(): void {
    const view = roomView(this.state, location, this.deps.live);
    this.dialog.render(view, this.consoles, (id) => {
      const track = this.deps.store.get(id);
      return track ? trackName(track) : 'a track not on this screen';
    });
    this.chip.hidden = this.state.kind !== 'open';
    if (this.state.kind === 'open') {
      this.chip.querySelector('[data-code]')!.textContent = `Room ${this.state.code}`;
      const count = this.chip.querySelector<HTMLElement>('[data-count]')!;
      count.textContent = String(this.consoles.length);
      count.hidden = this.consoles.length === 0;
      this.chip.title = `Ops room ${this.state.code}: ${this.consoles.length} console${this.consoles.length === 1 ? '' : 's'} (Q)`;
    }
  }
}

function makeChip(): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'topbar-button room-chip';
  chip.hidden = true;
  chip.setAttribute('aria-haspopup', 'dialog');
  chip.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" /><path d="M7 12h2" /></svg>' +
    '<span data-code></span><span class="room-chip-count" data-count hidden></span>';
  return chip;
}
