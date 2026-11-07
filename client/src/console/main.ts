import './console.css';
import {
  isRemoteKey,
  isRoomCode,
  normalizeRoomCode,
  REMOTE_KEYS,
  screenLabels,
  screenUrl,
  type ConsoleCallsign,
  type RoomAction,
  type RoomClosedReason,
  type ScreenName,
  type ScreenPresence,
  type TrackDetails,
} from '@watchfloor/shared';
import { shapeFor, shapeSvg } from '../map/shapes';
import { Connection, defaultSocketUrl, type ConnectionState } from '../net/connection';
import { readRole, writeRole } from '../room/deviceRole';
import { trackName } from '../room/roomView';
import { ServerClock } from '../state/clock';
import { TrackStore } from '../state/trackStore';
import { DEFAULT_QUERY, queryTracks, type DomainFilter } from '../state/trackQuery';
import { trafficLabel } from '../ui/format';
import { SHORTCUTS } from '../ui/shortcuts';
import { ConsoleList } from './consoleList';
import { REFUSAL, codeFromSearch, detailFacts, trackKind } from './consoleText';
import { LayerSwitches } from './layerSwitches';
import { PlacesPanel } from './places';
import { Pacer } from './pacer';
import { RemotePad, type PadMode } from './remotePad';

/**
 * The phone console of the ops room (console.html): join a room by code
 * (a device opened from the room's link is first asked whether it shows the
 * map or controls a screen), pick which screen to steer by name (Laptop,
 * TV...), then
 * send it a track from the list, move its map with the remote, switch its
 * layers, or fly it to a place. Every screen shows what this phone has
 * open. No map library: light enough for any phone.
 */

const el = <T extends HTMLElement = HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in console.html`);
  return node as T;
};

/** A send is answered by the screen moving; the button rests this long so a double tap sends once. */
const SEND_REST_MS = 1_000;
/** How long a line such as "Sent to MAIN." stays. */
const NOTE_MS = 2_500;
/** Like the main page: a phone in a pocket closes its socket after a quiet minute hidden. */
const HIDDEN_STOP_MS = 60_000;

type Tab = 'tracks' | 'remote' | 'keys' | 'layers' | 'places' | 'room';

const store = new TrackStore();
const clock = new ServerClock();

// The room, as the server last told it. In memory only: a reload joins afresh.
let code = codeFromSearch(location.search);
if (code) el<HTMLInputElement>('join-code').value = code;
// A device that chose to show the map goes straight there; one that hasn't chosen yet is asked first.
const remembered = readRole();
if (code && remembered === 'screen') location.replace(screenUrl(location.origin, code));
let choosing = code !== null && remembered !== 'control';
let token: string | undefined;
let callsign: ConsoleCallsign | null = null;
let refusal: string | null = null;
let link: ConnectionState = { status: 'connecting' };
let traffic = '';

/** The connected screens, and the one this phone steers (kept while it's away, so it comes back to it). */
let screens: ScreenPresence[] = [];
let target: ScreenName = 'MAIN';
/** The steered screen's selection as last seen: when it changes there, its card opens here. */
let seenSelected: string | undefined;
/** What people call each screen (Laptop, TV...); kept for the steered one while it's away. */
let labels = new Map<ScreenName, string>();
let tab: Tab = 'tracks';

// What this phone has open.
let opened: string | null = null;
let details: TrackDetails | undefined;
let sentAt = 0;
let noteTimer: number | undefined;

let domain: DomainFilter = 'all';
let search = '';

const targetHere = () => screens.some((s) => s.name === target);
const targetStatus = () => screens.find((s) => s.name === target)?.status;
const targetLabel = () => labels.get(target) ?? target;

/** Controls go out paced, so a tap right after a slide isn't dropped by the server (pacer.ts). */
const pacer = new Pacer((to, action) => connection.send({ type: 'room-control', to, action }));

/** Ask the steered screen to do something; nothing goes out while it's away. */
function control(action: RoomAction): void {
  if (callsign && targetHere()) pacer.push(target, action);
}

function note(text: string): void {
  const line = el('note');
  line.textContent = text;
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => (line.textContent = ''), NOTE_MS);
}

const list = new ConsoleList(el('rows'), el('rows-sizer'), (id) => openTrack(id));
const switches = new LayerSwitches(el('layer-switches'), (layer, on) => control({ do: 'layer', layer, on }));
const places = new PlacesPanel(el<HTMLInputElement>('place-search'), el('place-list'), (place) => {
  control({ do: 'fly', lon: place.lon, lat: place.lat, zoom: place.zoom });
  note(`${targetLabel()} is flying to ${place.label}.`);
});
const pad = new RemotePad(el('pad'), (action) => control(action));
const PAD_HINT: Record<PadMode, string> = {
  pan: 'Drag to move the map · pinch to zoom',
  pointer: 'Slide to move the pointer · tap to click · hold, then slide to drag · two fingers move the map',
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-pad-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.padMode as PadMode;
    pad.setMode(mode);
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pad-mode]')) b.setAttribute('aria-pressed', String(b === button));
    el('pad-hint').textContent = PAD_HINT[mode];
  });
}

const connection = new Connection(defaultSocketUrl(), {
  onMessage(message, receivedAt) {
    clock.update(message.serverTime, receivedAt);
    switch (message.type) {
      case 'hello':
        store.setStaleness(message.staleness);
        traffic = trafficLabel(message.traffic, message.scenario?.name);
        // A new socket: rejoin (the token keeps our callsign) and ask again about the open track.
        if (code && !choosing) join();
        if (opened) connection.send({ type: 'track', id: opened });
        break;
      // The store's own subscription redraws the list for these.
      case 'snapshot':
        store.applySnapshot(message.tracks, message.trails);
        return;
      case 'delta':
        store.applyDelta(message.upserts, message.removals, message.serverTime);
        return;
      case 'details':
        if (message.id === opened) {
          details = message.details;
          renderDetails();
        }
        break;
      case 'room':
        if (message.role !== 'console') break;
        code = message.code;
        token = message.token;
        callsign = message.callsign;
        refusal = null;
        connection.send({ type: 'room-look', id: opened });
        break;
      case 'room-presence': {
        screens = message.screens;
        labels = new Map([...labels, ...screenLabels(screens)]);
        // Two-way: what's picked on the steered screen (by its pointer, or at the screen) opens here.
        const selected = targetStatus()?.selected;
        if (selected !== seenSelected) {
          seenSelected = selected;
          if (selected && selected !== opened && store.get(selected)) openTrack(selected);
        }
        break;
      }
      case 'room-closed':
        // After Leave the room the server may confirm; that's no news.
        if (callsign !== null || code) leaveRoom(message.reason);
        break;
    }
    render();
  },
  onState(state) {
    link = state;
    render();
    // A phone left open across a server update heals itself, as the main page does.
    if (state.status === 'incompatible') window.setTimeout(() => location.reload(), 5000);
  },
});

function join(): void {
  if (code) connection.send({ type: 'room-join', code, ...(token ? { token } : {}) });
}

/**
 * Turned away, the room ended, or (null) this phone left: back to the join
 * screen, the code left in the box to correct or retry.
 */
function leaveRoom(reason: RoomClosedReason | null): void {
  refusal = reason ? REFUSAL[reason] : null;
  if (code && reason && reason !== 'closed') el<HTMLInputElement>('join-code').value = code;
  code = null; // so a reconnect doesn't retry it
  callsign = null;
  token = undefined;
  screens = [];
  labels = new Map();
  target = 'MAIN';
  tab = 'tracks';
  closeTrack();
  history.replaceState(null, '', location.pathname);
}

function openTrack(id: string): void {
  opened = id;
  details = undefined;
  connection.send({ type: 'track', id });
  connection.send({ type: 'room-look', id });
  // The phone's own Back button closes the details, as it would any page.
  history.pushState({ console: 'details' }, '');
  render();
  window.scrollTo(0, 0);
}

function closeTrack(): void {
  if (!opened) return;
  opened = null;
  details = undefined;
  connection.send({ type: 'room-look', id: null });
  render();
}

window.addEventListener('popstate', () => closeTrack());
el('back').addEventListener('click', () => {
  if (history.state?.console === 'details') history.back();
  else closeTrack();
});

el('send').addEventListener('click', () => {
  if (!opened) return;
  control({ do: 'show', id: opened });
  sentAt = Date.now();
  note(`Sent to ${targetLabel()}.`);
  window.setTimeout(render, SEND_REST_MS);
  render();
});

// Ride along: the screen selects the aircraft and drops into its cockpit (J there); again to leave.
el('ride').addEventListener('click', () => {
  if (!opened) return;
  const riding = targetStatus()?.riding === opened;
  control({ do: 'ride', id: riding ? null : opened });
  note(riding ? `Left the ride on ${targetLabel()}.` : `Riding along on ${targetLabel()}.`);
  render();
});

// What the steered screen has selected, shown on the other tabs: a tap opens its card.
el('picked').addEventListener('click', () => {
  const selected = targetStatus()?.selected;
  if (!selected) return;
  tab = 'tracks';
  if (opened !== selected) openTrack(selected);
  render();
});

// Follow, from the card: the steered screen's camera stays on the track it has selected (this one).
el('follow').addEventListener('click', () => {
  const status = targetStatus();
  if (!opened || status?.selected !== opened) return;
  control({ do: 'follow', on: !status.follow });
});

// The Keys tab: the map key's shortcuts, pressed on the steered screen. Esc first: it closes what a key opened.
const KEY_LABEL = new Map(SHORTCUTS.map(([k, label]) => [k === 'Esc' ? 'Escape' : k, label]));
el('key-grid').replaceChildren(
  ...['Escape' as const, ...REMOTE_KEYS.filter((k) => k !== 'Escape')].map((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'console-shortcut';
    const kbd = document.createElement('kbd');
    kbd.textContent = key === 'Escape' ? 'Esc' : key;
    const label = document.createElement('span');
    label.textContent = KEY_LABEL.get(key) ?? key;
    button.append(kbd, label);
    button.addEventListener('click', () => {
      if (isRemoteKey(key)) control({ do: 'key', key });
    });
    return button;
  }),
);

// The first question, for a device opened from the room's link: show the map here, or control a screen?
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-role]')) {
  button.addEventListener('click', () => {
    if (!code) return;
    if (button.dataset.role === 'screen') {
      writeRole('screen');
      location.assign(screenUrl(location.origin, code));
      return;
    }
    writeRole('control');
    choosing = false;
    join();
    render();
  });
}

// The Room tab: show the map on this device instead, or leave.
el('become-screen').addEventListener('click', () => {
  if (!code) return;
  writeRole('screen');
  connection.send({ type: 'room-leave' });
  location.assign(screenUrl(location.origin, code));
});
el('leave-room').addEventListener('click', () => {
  connection.send({ type: 'room-leave' });
  leaveRoom(null);
  render();
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  button.addEventListener('click', () => {
    tab = button.dataset.tab as Tab;
    if (tab === 'places') void places.load();
    render();
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-act]')) {
  button.addEventListener('click', () => {
    const status = targetStatus();
    switch (button.dataset.act) {
      case 'zoom-in':
        control({ do: 'zoom', by: 1 });
        break;
      case 'zoom-out':
        control({ do: 'zoom', by: -1 });
        break;
      case 'home':
        control({ do: 'home' });
        note(`${targetLabel()} is going back to the opening view.`);
        break;
      case 'follow':
        control({ do: 'follow', on: !status?.follow });
        break;
      case 'clear':
        control({ do: 'clear' });
        break;
      case 'tour':
        control({ do: 'tour', on: !status?.tour });
        break;
    }
  });
}

el<HTMLFormElement>('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const typed = normalizeRoomCode(el<HTMLInputElement>('join-code').value);
  if (!isRoomCode(typed)) {
    refusal = 'Room codes are four letters and digits, like K7QX.';
    render();
    return;
  }
  code = typed;
  refusal = null;
  choosing = false;
  writeRole('control'); // typed into the console: this device controls
  history.replaceState(null, '', `${location.pathname}?room=${code}`);
  join();
  render();
});

el('search').addEventListener('input', (event) => {
  search = (event.target as HTMLInputElement).value;
  renderList();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-domain]')) {
  button.addEventListener('click', () => {
    domain = button.dataset.domain as DomainFilter;
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-domain]')) b.setAttribute('aria-pressed', String(b === button));
    renderList();
  });
}

// The list and the open card follow the picture; deltas come once a second.
store.subscribe(() => {
  renderList();
  if (opened) renderDetails();
});
window.setInterval(() => opened && renderDetails(), 1000);

let hiddenTimer: number | undefined;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenTimer = window.setTimeout(() => connection.stop(), HIDDEN_STOP_MS);
  } else {
    window.clearTimeout(hiddenTimer);
    connection.start();
  }
});

function render(): void {
  const inRoom = callsign !== null;
  el('name').textContent = inRoom ? `CONSOLE ${callsign}` : 'Console';
  el('sub').textContent = linkText() ?? (inRoom ? `Room ${code} · ${traffic}` : traffic || 'Connected');
  const lamp = el('lamp');
  lamp.dataset.state = link.status;
  lamp.title = link.status === 'open' ? 'Connected' : 'Not connected';

  el('steer').hidden = !inRoom;
  renderTargets();
  const away = el('main-away');
  away.hidden = !inRoom || targetHere();
  away.textContent = `${targetLabel()} is away (hidden or reconnecting). It gets your controls when it's back.`;

  el('choose').hidden = inRoom || !choosing;
  el('choose-code').textContent = code ?? '';
  el('join').hidden = inRoom || choosing;

  // On every tab but Tracks (where it opens as the card), what the steered screen has selected:
  // click a plane with the pointer, and its name shows here without leaving the pad.
  const picked = el<HTMLButtonElement>('picked');
  const selected = targetStatus()?.selected;
  const pickedTrack = selected ? store.get(selected) : undefined;
  picked.hidden = !inRoom || tab === 'tracks' || !pickedTrack;
  if (pickedTrack) picked.textContent = `On ${targetLabel()}: ${trackName(pickedTrack)} · ${trackKind(pickedTrack)} ›`;
  el('join-lede').textContent =
    code && !refusal ? `Joining room ${code}…` : 'Type the code shown on the main screen. Press Q there to show it.';
  const error = el('join-error');
  error.hidden = !refusal;
  error.textContent = refusal ?? '';

  el('tabs').hidden = !inRoom;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  el('list').hidden = !inRoom || tab !== 'tracks' || opened !== null;
  el('details').hidden = !inRoom || tab !== 'tracks' || opened === null;
  el('remote').hidden = !inRoom || tab !== 'remote';
  el('layers').hidden = !inRoom || tab !== 'layers';
  el('keys').hidden = !inRoom || tab !== 'keys';
  el('keys-lede').textContent = `Pressed on ${targetLabel()}, as if typed there. Pointer mode on the Remote tab clicks what they open.`;
  for (const b of el('key-grid').querySelectorAll('button')) b.disabled = !targetHere() || link.status !== 'open';
  el('places').hidden = !inRoom || tab !== 'places';
  el('room').hidden = !inRoom || tab !== 'room';
  if (inRoom && tab === 'room') renderRoom();
  if (inRoom) renderList();
  if (opened) renderDetails();
  renderRemote();
  el('layers-lede').textContent = `What ${targetLabel()} shows. Each switch changes that screen only.`;
  switches.render(targetStatus()?.layers, targetHere() && link.status === 'open');
}

/** One button per screen to steer, plus the steered one while it's away. Rebuilt only on change. */
let targetsShown = '';
function renderTargets(): void {
  const names: ScreenName[] = screens.map((s) => s.name);
  const here = new Set(names);
  if (!here.has(target)) names.push(target);
  const key = `${names.map((n) => `${n}=${labels.get(n) ?? n}${here.has(n) ? '' : '~'}`).join('|')}#${target}`;
  if (key === targetsShown) return;
  targetsShown = key;
  el('targets').replaceChildren(
    ...names.map((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'console-target';
      const label = labels.get(name) ?? name;
      button.textContent = here.has(name) ? label : `${label} (away)`;
      button.setAttribute('aria-pressed', String(name === target));
      if (!here.has(name)) button.dataset.away = '';
      button.addEventListener('click', () => {
        target = name;
        seenSelected = targetStatus()?.selected; // only later picks there open here
        render();
      });
      return button;
    }),
  );
}

/** The Room tab: the room's code, this phone's callsign, and the screens, with the one it steers. */
function renderRoom(): void {
  el('room-code').textContent = code ?? '';
  el('room-callsign').textContent = `CONSOLE ${callsign}`;
  el('room-screens').replaceChildren(
    ...screens.map((s) => {
      const li = document.createElement('li');
      li.textContent = labels.get(s.name) ?? s.name;
      if (s.name === target) {
        li.dataset.steering = '';
        const tag = document.createElement('span');
        tag.textContent = 'Steering';
        li.append(tag);
      }
      return li;
    }),
  );
}

function renderRemote(): void {
  const usable = targetHere() && link.status === 'open';
  const status = targetStatus();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-act]')) {
    button.disabled = !usable;
    if (button.dataset.act === 'follow') button.setAttribute('aria-pressed', String(status?.follow === true));
    if (button.dataset.act === 'tour') button.setAttribute('aria-pressed', String(status?.tour === true));
  }
  el('pad').classList.toggle('console-pad-off', !usable);
}

/** Says what's wrong with the connection, or nothing when it's fine. */
function linkText(): string | null {
  switch (link.status) {
    case 'open':
      return null;
    case 'connecting':
      return 'Connecting…';
    case 'waiting':
      return 'Connection lost, trying again…';
    case 'incompatible':
      return 'Watchfloor was updated: reloading…';
  }
}

function renderList(): void {
  if (el('list').hidden) return;
  const now = clock.now();
  const query = { ...DEFAULT_QUERY, domain, search };
  const tracks = queryTracks(store.all(), query, now);
  list.set(tracks, (t) => store.status(t, now) === 'stale');
  const total = store.size;
  el('count').textContent = tracks.length === total ? `${total} tracks` : `${tracks.length} of ${total} tracks`;
}

function renderDetails(): void {
  if (!opened) return;
  const track = store.get(opened);
  const now = clock.now();
  el('details-gone').hidden = track !== undefined;
  if (track) {
    el('details-icon').innerHTML = shapeSvg(shapeFor(track).shape, track.affiliation, 44); // our own constants only
    el('details-name').textContent = trackName(track);
    el('details-what').textContent = trackKind(track, details);
    const facts = el('details-facts');
    facts.replaceChildren(
      ...detailFacts(track, details, store.status(track, now) === 'stale', now).flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }
  const send = el<HTMLButtonElement>('send');
  const resting = Date.now() - sentAt < SEND_REST_MS;
  send.disabled = !track || !targetHere() || resting || link.status !== 'open';
  send.textContent = targetHere() ? `Send to ${targetLabel()}` : `${targetLabel()} is away`;
  // Only an aircraft reporting its altitude can be ridden (canRide in rideAlong.ts).
  const ride = el<HTMLButtonElement>('ride');
  const rideable = track !== undefined && track.domain === 'air' && track.altitudeM !== undefined;
  const riding = rideable && targetStatus()?.riding === track.id;
  ride.hidden = !rideable;
  ride.disabled = !targetHere() || link.status !== 'open';
  ride.textContent = riding ? `Leave the ride on ${targetLabel()}` : `Ride along on ${targetLabel()}`;
  ride.setAttribute('aria-pressed', String(riding));
  // Follow works on the screen's selection: offered once this track is the one selected there.
  const follow = el<HTMLButtonElement>('follow');
  const status = targetStatus();
  const selectedThere = track !== undefined && status?.selected === track.id;
  follow.hidden = !selectedThere;
  follow.disabled = !targetHere() || link.status !== 'open';
  follow.textContent = status?.follow ? `Stop following on ${targetLabel()}` : `Follow on ${targetLabel()}`;
  follow.setAttribute('aria-pressed', String(status?.follow === true));
}

render();
connection.start();
