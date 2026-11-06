import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  isRoomCode,
  normalizeRoomCode,
  type ClientMessage,
  type ConsoleCallsign,
  type ConsolePresence,
  type RoomAction,
  type RoomServerMessage,
  type ScenarioInfo,
  type ScreenName,
  type ScreenPresence,
  type ScreenStatus,
} from '@watchfloor/shared';
import { fly, type CameraTarget } from '../map/camera';
import type { TrackLayer } from '../map/trackLayer';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { PresenceMarkers } from './presenceMarkers';
import { RoomDialog } from './roomDialog';
import { roomView, trackName, type RoomState } from './roomView';
import { LAYER_LABEL, layerState, onLayerChange, setLayer, type LayerSettings } from './screenControl';
import './room.css';

export interface RoomHostDeps {
  map: MapLibreMap;
  store: TrackStore;
  layer: TrackLayer;
  selection: Selection;
  send: (message: ClientMessage) => void;
  tour: { readonly active: boolean; start(): void; stop(): void };
  timeline: { readonly open: boolean; setOpen(open: boolean): void };
  /** The layer settings, the same objects the keys and the Layers menu change. */
  layers: () => LayerSettings;
  /** False in the static demo: there is no server for phones to join. */
  live: boolean;
}

/** How long a line such as "CONSOLE ALFA sent BAW123" stays up: past the camera's flight (up to 5 s). */
const TOAST_MS = 8_000;
/** The tour starts and stops without telling anyone, so the status is also checked this often. */
const STATUS_CHECK_MS = 1_000;

/**
 * This screen's side of the ops room (Q). It either hosts a room as MAIN
 * (QR code and code for phones, a link for other screens) or joins one as
 * another screen; either way it tags the tracks consoles have open, does
 * what a console asks of it, and tells the room what it is showing, so a
 * console's switches tell the truth. It all lasts as long as the page.
 */
export class RoomHost {
  private state: RoomState = { kind: 'none' };
  private screens: ScreenPresence[] = [];
  private consoles: ConsolePresence[] = [];
  /** Where the picture opened: the Home action goes back there. */
  private home: CameraTarget = { center: [0, 20], zoom: 1.5 };
  private sentStatus = '';
  private readonly dialog: RoomDialog;
  private readonly markers: PresenceMarkers;
  private readonly chip: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private toastTimer: number | undefined;

  constructor(private readonly deps: RoomHostDeps) {
    this.dialog = new RoomDialog({ open: () => this.open(), join: (code) => this.join(code), leave: () => this.leave() });
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

    // A link with ?screen=K7QX (from the main screen's dialog) joins that room as a screen.
    const linked = normalizeRoomCode(new URLSearchParams(location.search).get('screen') ?? '');
    if (deps.live && isRoomCode(linked)) this.state = { kind: 'joining', code: linked };

    // Closing this page (not hiding it, not the back-forward cache) leaves at
    // once: a main screen ends its room instead of the phones waiting out the
    // server's grace period, and another screen frees its place.
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted && (this.state.kind === 'open' || this.state.kind === 'screen')) deps.send({ type: 'room-leave' });
    });
    // Tell the room what this screen shows whenever that changes.
    onLayerChange(deps.layers(), () => this.reportStatus());
    deps.selection.subscribe(() => this.reportStatus());
    window.setInterval(() => this.reportStatus(), STATUS_CHECK_MS);
    this.render();
  }

  /** Q: show the dialog (open a room, join one, or see the room), or hide it again. */
  toggle(): void {
    if (this.dialog.open) {
      this.dialog.close();
      return;
    }
    this.render();
    this.dialog.show();
  }

  /** After every hello: the socket is new, so reclaim or rejoin (or ask again). */
  reconnected(scenario: ScenarioInfo | null): void {
    if (scenario) this.home = { center: [scenario.center.lon, scenario.center.lat], zoom: scenario.zoom };
    this.sentStatus = ''; // the room hasn't heard from this socket yet
    const s = this.state;
    if (s.kind === 'open') this.deps.send({ type: 'room-open', code: s.code, key: s.key });
    else if (s.kind === 'opening') this.deps.send({ type: 'room-open' });
    else if (s.kind === 'joining') this.deps.send({ type: 'room-join', code: s.code, as: 'screen' });
    else if (s.kind === 'screen') this.deps.send({ type: 'room-join', code: s.code, token: s.token, as: 'screen' });
  }

  handle(message: RoomServerMessage): void {
    switch (message.type) {
      case 'room': {
        if (message.role === 'console') return;
        const joined = this.state.kind === 'joining';
        this.state =
          message.role === 'main'
            ? { kind: 'open', code: message.code, key: message.key, origins: message.origins }
            : { kind: 'screen', code: message.code, name: message.name, token: message.token };
        if (joined && message.role === 'screen') {
          this.dialog.close();
          this.say(`This screen joined room ${message.code} as ${message.name}`);
        }
        this.sentStatus = '';
        this.reportStatus();
        break;
      }
      case 'room-presence':
        if (!this.inRoom) return;
        this.screens = message.screens;
        this.consoles = message.consoles;
        this.markers.set(message.consoles);
        break;
      case 'room-control':
        if (this.inRoom) this.act(message.from, message.action);
        return;
      case 'room-closed': {
        const was = this.state.kind;
        // After Close room or Leave the server confirms; nothing more to do.
        if (was === 'none') return;
        const as = was === 'joining' || was === 'screen' ? 'screen' : 'main';
        if (was === 'open' || was === 'screen') {
          this.say(message.reason === 'not-found' ? 'The ops room closed while this screen was away' : 'The ops room has closed');
        }
        this.state = { kind: 'ended', reason: message.reason, as };
        this.screens = [];
        this.consoles = [];
        this.markers.set([]);
        // A screen joined by link has no dialog up yet: show it why.
        if (was === 'joining') this.dialog.show();
        break;
      }
    }
    this.render();
  }

  private get inRoom(): boolean {
    return this.state.kind === 'open' || this.state.kind === 'screen';
  }

  private open(): void {
    this.state = { kind: 'opening' };
    this.deps.send({ type: 'room-open' });
    this.render();
  }

  private join(code: string): void {
    this.state = { kind: 'joining', code };
    this.deps.send({ type: 'room-join', code, as: 'screen' });
    this.render();
  }

  private leave(): void {
    this.deps.send({ type: 'room-leave' });
    this.state = { kind: 'none' };
    this.screens = [];
    this.consoles = [];
    this.markers.set([]);
    this.dialog.close();
    this.render();
  }

  /** What a console asked of this screen. Camera moves take the camera from a tour or a replay first. */
  private act(from: ConsoleCallsign, action: RoomAction): void {
    const { map, selection, tour } = this.deps;
    const who = `CONSOLE ${from}`;
    switch (action.do) {
      case 'show':
        this.show(action.id, who);
        return;
      case 'pan': {
        this.takeCamera();
        const box = map.getContainer();
        // Drag the map with your finger: the picture moves the way the finger did.
        map.panBy([-action.dx * box.clientWidth, -action.dy * box.clientHeight], { animate: false });
        return;
      }
      case 'zoom':
        this.takeCamera();
        map.zoomTo(map.getZoom() + action.by, { duration: 250 });
        return;
      case 'home':
        this.takeCamera();
        fly(map, this.home);
        this.say(`${who} went back to the opening view`);
        return;
      case 'fly':
        this.takeCamera();
        fly(map, { center: [action.lon, action.lat], zoom: action.zoom });
        this.say(`${who} moved this screen`);
        return;
      case 'follow':
        selection.setFollow(action.on);
        return;
      case 'clear':
        selection.select(null);
        this.say(`${who} cleared the selection`);
        return;
      case 'tour':
        if (action.on) {
          this.dialog.close();
          tour.start();
        } else tour.stop();
        this.say(`${who} ${action.on ? 'started' : 'stopped'} the tour`);
        this.reportStatus();
        return;
      case 'layer':
        setLayer(this.deps.layers(), action.layer, action.on);
        this.say(`${who} turned ${LAYER_LABEL[action.layer]} ${action.on ? 'on' : 'off'}`);
        return;
    }
  }

  /** A console sent a track: take the camera there and select it, as a search pick would. */
  private show(id: string, who: string): void {
    const { store, layer, selection, map } = this.deps;
    const track = store.get(id);
    if (!track) {
      this.say(`${who} sent a track that has left the picture`);
      return;
    }
    this.takeCamera();
    selection.setFollow(false);
    selection.select(id);
    const pos = layer.positionOf(id) ?? { lon: track.lon, lat: track.lat };
    fly(map, { center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 7) });
    this.say(`${who} sent ${trackName(track)}`);
  }

  private takeCamera(): void {
    this.dialog.close();
    if (this.deps.tour.active) this.deps.tour.stop();
    if (this.deps.timeline.open) this.deps.timeline.setOpen(false);
  }

  /** Tell the room what this screen shows, when that changed since it last heard. */
  private reportStatus(): void {
    if (!this.inRoom) return;
    const status: ScreenStatus = { layers: layerState(this.deps.layers()), tour: this.deps.tour.active, follow: this.deps.selection.follow };
    const json = JSON.stringify(status);
    if (json === this.sentStatus) return;
    this.sentStatus = json;
    this.deps.send({ type: 'room-status', status });
  }

  private say(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), TOAST_MS);
  }

  private render(): void {
    const s = this.state;
    const self: ScreenName | null = s.kind === 'open' ? 'MAIN' : s.kind === 'screen' ? s.name : null;
    this.dialog.render(roomView(s, location, this.deps.live), { screens: this.screens, consoles: this.consoles }, (id) => {
      const track = this.deps.store.get(id);
      return track ? trackName(track) : 'a track not on this screen';
    }, self);
    this.chip.hidden = !this.inRoom;
    if (s.kind === 'open' || s.kind === 'screen') {
      const label = s.kind === 'open' ? `Room ${s.code}` : `${s.name} · ${s.code}`;
      this.chip.querySelector('[data-code]')!.textContent = label;
      const count = this.chip.querySelector<HTMLElement>('[data-count]')!;
      count.textContent = String(this.consoles.length);
      count.hidden = this.consoles.length === 0;
      const consoles = `${this.consoles.length} console${this.consoles.length === 1 ? '' : 's'}`;
      this.chip.title = `Ops room ${s.code}: ${consoles}, ${this.screens.length} screen${this.screens.length === 1 ? '' : 's'} (Q)`;
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
