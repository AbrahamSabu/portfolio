import './console.css';
import {
  isRoomCode,
  isScreenName,
  normalizeRoomCode,
  type ConsoleCallsign,
  type RoomAction,
  type RoomClosedReason,
  type ScreenName,
  type ScreenPresence,
  type TrackDetails,
} from '@watchfloor/shared';
import { shapeFor, shapeSvg } from '../map/shapes';
import { Connection, defaultSocketUrl, type ConnectionState } from '../net/connection';
import { trackName } from '../room/roomView';
import { ServerClock } from '../state/clock';
import { TrackStore } from '../state/trackStore';
import { DEFAULT_QUERY, queryTracks, type DomainFilter } from '../state/trackQuery';
import { trafficLabel } from '../ui/format';
import { ConsoleList } from './consoleList';
import { REFUSAL, codeFromSearch, detailFacts, trackKind } from './consoleText';
import { LayerSwitches } from './layerSwitches';
import { PlacesPanel } from './places';
import { RemotePad } from './remotePad';

/**
 * The phone console of the ops room (console.html): join a room by code,
 * pick which screen to steer (the main one, or another such as a TV), then
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

type Tab = 'tracks' | 'remote' | 'layers' | 'places';

const store = new TrackStore();
const clock = new ServerClock();

// The room, as the server last told it. In memory only: a reload joins afresh.
let code = codeFromSearch(location.search);
if (code) el<HTMLInputElement>('join-code').value = code;
let token: string | undefined;
let callsign: ConsoleCallsign | null = null;
let refusal: string | null = null;
let link: ConnectionState = { status: 'connecting' };
let traffic = '';

/** The connected screens, and the one this phone steers (kept while it's away, so it comes back to it). */
let screens: ScreenPresence[] = [];
let target: ScreenName = 'MAIN';
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

/** Ask the steered screen to do something; nothing goes out while it's away. */
function control(action: RoomAction): void {
  if (callsign && targetHere()) connection.send({ type: 'room-control', to: target, action });
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
  note(`${target} is flying to ${place.label}.`);
});
new RemotePad(el('pad'), (dx, dy) => control({ do: 'pan', dx, dy }));

const connection = new Connection(defaultSocketUrl(), {
  onMessage(message, receivedAt) {
    clock.update(message.serverTime, receivedAt);
    switch (message.type) {
      case 'hello':
        store.setStaleness(message.staleness);
        traffic = trafficLabel(message.traffic, message.scenario?.name);
        // A new socket: rejoin (the token keeps our callsign) and ask again about the open track.
        if (code) join();
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
      case 'room-presence':
        screens = message.screens;
        break;
      case 'room-closed':
        leaveRoom(message.reason);
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

/** Turned away or the room ended: back to the join screen, the code left in the box to correct or retry. */
function leaveRoom(reason: RoomClosedReason): void {
  refusal = REFUSAL[reason];
  if (code && reason !== 'closed') el<HTMLInputElement>('join-code').value = code;
  code = null; // so a reconnect doesn't retry it
  callsign = null;
  token = undefined;
  screens = [];
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
  note(`Sent to ${target}.`);
  window.setTimeout(render, SEND_REST_MS);
  render();
});

// Ride along: the screen selects the aircraft and drops into its cockpit (J there); again to leave.
el('ride').addEventListener('click', () => {
  if (!opened) return;
  const riding = targetStatus()?.riding === opened;
  control({ do: 'ride', id: riding ? null : opened });
  note(riding ? `Left the ride on ${target}.` : `Riding along on ${target}.`);
  render();
});

const targetSelect = el<HTMLSelectElement>('target');
targetSelect.addEventListener('change', () => {
  if (isScreenName(targetSelect.value)) target = targetSelect.value;
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
        note(`${target} is going back to the opening view.`);
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
  away.textContent = `${target} is away (hidden or reconnecting). It gets your controls when it's back.`;

  el('join').hidden = inRoom;
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
  el('places').hidden = !inRoom || tab !== 'places';
  if (inRoom) renderList();
  if (opened) renderDetails();
  renderRemote();
  el('layers-lede').textContent = `What ${target} shows. Each switch changes that screen only.`;
  switches.render(targetStatus()?.layers, targetHere() && link.status === 'open');
}

/** The screens to steer: those in the room, plus the steered one while it's away. Rebuilt only on change. */
let targetsShown = '';
function renderTargets(): void {
  const names: ScreenName[] = screens.map((s) => s.name);
  const here = new Set(names);
  if (!here.has(target)) names.push(target);
  const key = `${names.join('|')}#${[...here].join('|')}#${target}`;
  if (key === targetsShown) return;
  targetsShown = key;
  targetSelect.replaceChildren(
    ...names.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = here.has(name) ? name : `${name} (away)`;
      option.selected = name === target;
      return option;
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
  send.textContent = targetHere() ? `Send to ${target}` : `${target} is away`;
  // Only an aircraft reporting its altitude can be ridden (canRide in rideAlong.ts).
  const ride = el<HTMLButtonElement>('ride');
  const rideable = track !== undefined && track.domain === 'air' && track.altitudeM !== undefined;
  const riding = rideable && targetStatus()?.riding === track.id;
  ride.hidden = !rideable;
  ride.disabled = !targetHere() || link.status !== 'open';
  ride.textContent = riding ? `Leave the ride on ${target}` : `Ride along on ${target}`;
  ride.setAttribute('aria-pressed', String(riding));
}

render();
connection.start();
