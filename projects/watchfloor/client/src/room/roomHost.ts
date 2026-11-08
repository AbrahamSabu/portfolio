import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  isRoomCode,
  joinUrl,
  normalizeRoomCode,
  screenLabels,
  SCREEN_KIND_LABEL,
  type ClientMessage,
  type ConsoleCallsign,
  type ConsolePresence,
  type RemoteKey,
  type RoomAction,
  type RoomServerMessage,
  type ScenarioInfo,
  type ScreenKind,
  type ScreenName,
  type ScreenPresence,
  type ScreenStatus,
} from '@watchfloor/shared';
import { fly, type CameraTarget } from '../map/camera';
import type { TrackLayer } from '../map/trackLayer';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { readKind, writeKind, writeRole } from './deviceRole';
import { PresenceMarkers } from './presenceMarkers';
import { RemotePointer } from './remotePointer';
import { RoomDialog } from './roomDialog';
import { roomView, trackName, type RoomState } from './roomView';
import { canRide } from '../map/rideAlong';
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
  /** Ride Along (J): a console can put this screen in an aircraft's cockpit. */
  ride: { readonly riding: string | null; start(id: string): void; stop(): void; subscribe(listener: () => void): unknown };
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
  /** What this screen is, as chosen in the dialog (or guessed): phones see it by this name. */
  private kind: ScreenKind = readKind();
  private readonly dialog: RoomDialog;
  private readonly markers: PresenceMarkers;
  /** Consoles' pointer mode: a mouse on this screen, driven from a phone. */
  private readonly pointer = new RemotePointer();
  private readonly chip: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private toastTimer: number | undefined;

  constructor(private readonly deps: RoomHostDeps) {
    this.dialog = new RoomDialog({
      open: () => this.open(),
      join: (code) => this.join(code),
      leave: () => this.leave(),
      kind: (kind) => this.setKind(kind),
      controller: () => this.becomeController(),
    });
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
    if (deps.live && isRoomCode(linked)) {
      this.state = { kind: 'joining', code: linked };
      writeRole('screen'); // the link asked for a screen, so that's what this device is now
    }

    // Closing this page (not hiding it, not the back-forward cache) leaves at
    // once: a main screen ends its room instead of the phones waiting out the
    // server's grace period, and another screen frees its place.
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted && (this.state.kind === 'open' || this.state.kind === 'screen')) deps.send({ type: 'room-leave' });
    });
    // Tell the room what this screen shows whenever that changes.
    onLayerChange(deps.layers(), () => this.reportStatus());
    deps.selection.subscribe(() => this.reportStatus());
    deps.ride.subscribe(() => this.reportStatus());
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
          this.say(`This screen joined room ${message.code} as ${SCREEN_KIND_LABEL[this.kind]}`);
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
        // A console that left mid-press would otherwise hold the map in a drag for good.
        if (this.pointer.holder !== null && !message.consoles.some((c) => c.callsign === this.pointer.holder)) this.pointer.reset();
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
        // The code is kept: a screen turned away (full, busy) can still go to the console page for the same room.
        const code = 'code' in this.state ? this.state.code : undefined;
        this.state = { kind: 'ended', reason: message.reason, as, ...(code ? { code } : {}) };
        this.screens = [];
        this.consoles = [];
        this.markers.set([]);
        this.pointer.reset();
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
    writeRole('screen');
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
      case 'point':
        this.pointer.move(from, action.dx, action.dy);
        return;
      case 'click':
        this.pointer.click(from);
        return;
      case 'press':
        this.pointer.press(from, action.down);
        return;
      case 'key':
        this.pressKey(action.key);
        return;
      case 'ride':
        if (action.id === null) {
          this.deps.ride.stop();
          this.say(`${who} ended the ride`);
        } else this.ride(action.id, who);
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

  /** A console asked to ride along with an aircraft: select it, then into the cockpit, as J would. */
  private ride(id: string, who: string): void {
    const { store, selection, ride } = this.deps;
    const track = store.get(id);
    if (!canRide(track)) {
      this.say(track ? `${who} picked ${trackName(track)}, which reports no altitude to ride at` : `${who} sent a track that has left the picture`);
      return;
    }
    this.takeCamera();
    // Selecting another aircraft ends a ride already under way (rideAlong.ts), so this one can start.
    selection.select(id);
    ride.start(id);
    this.say(`${who} is riding along with ${trackName(track)}`);
  }

  /**
   * A console pressed one of the map's keys: the keydown a keyboard would
   * send, so every shortcut works as typed. Two differences, since the phone
   * can't see a keyboard's context: a key ends the tour and then does its job
   * (typed, it would only end the tour; G, Y and K, the tour, the score and
   * the skin, leave it riding), and Escape closes an open dialog
   * itself (browsers ignore a synthetic Escape on their dialogs).
   */
  private pressKey(key: RemoteKey): void {
    this.dialog.close();
    const { tour } = this.deps;
    if (tour.active && key !== 'G' && key !== 'Y' && key !== 'K') tour.stop();
    if (key === 'Escape') {
      const open = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (open) {
        open.close();
        return;
      }
    }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: key.length === 1 ? key.toLowerCase() : key, bubbles: true, cancelable: true }));
  }

  /** What this screen is, chosen in the dialog: remembered here, and the room hears it with the next status. */
  private setKind(kind: ScreenKind): void {
    this.kind = kind;
    writeKind(kind);
    this.reportStatus();
    this.render();
  }

  /** This device becomes a controller: off to the console page (leaving the room on the way out, at pagehide). */
  private becomeController(): void {
    writeRole('control');
    const s = this.state;
    const code = s.kind === 'screen' || s.kind === 'joining' || s.kind === 'ended' ? s.code : undefined;
    location.assign(code ? joinUrl(location.origin, code) : `${location.origin}/console.html`);
  }

  private takeCamera(): void {
    this.dialog.close();
    if (this.deps.tour.active) this.deps.tour.stop();
    if (this.deps.timeline.open) this.deps.timeline.setOpen(false);
  }

  /** Tell the room what this screen shows, when that changed since it last heard. */
  private reportStatus(): void {
    if (!this.inRoom) return;
    const status: ScreenStatus = {
      layers: layerState(this.deps.layers()),
      tour: this.deps.tour.active,
      follow: this.deps.selection.follow,
      kind: this.kind,
    };
    const riding = this.deps.ride.riding;
    if (riding) status.riding = riding;
    const selected = this.deps.selection.id;
    if (selected) status.selected = selected;
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
    this.dialog.render(roomView(s, location, this.deps.live, import.meta.env.VITE_LIVE_URL), { screens: this.screens, consoles: this.consoles }, (id) => {
      const track = this.deps.store.get(id);
      return track ? trackName(track) : 'a track not on this screen';
    }, self, this.kind);
    // Always there on a live server (the static demo has no rooms): the way in for anyone who doesn't know Q.
    this.chip.hidden = !this.deps.live;
    this.chip.classList.toggle('in-room', this.inRoom);
    if (!this.inRoom) {
      this.chip.querySelector('[data-code]')!.textContent = 'Ops room';
      this.chip.querySelector<HTMLElement>('[data-count]')!.hidden = true;
      this.chip.title = 'Ops room: phones and other screens (Q)';
    } else if (s.kind === 'open' || s.kind === 'screen') {
      const label = s.kind === 'open' ? `Room ${s.code}` : `${screenLabels(this.screens).get(s.name) ?? SCREEN_KIND_LABEL[this.kind]} · ${s.code}`;
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
