import './console.css';
import { isRoomCode, normalizeRoomCode, type ConsoleCallsign, type RoomClosedReason, type TrackDetails } from '@watchfloor/shared';
import { shapeFor, shapeSvg } from '../map/shapes';
import { Connection, defaultSocketUrl, type ConnectionState } from '../net/connection';
import { trackName } from '../room/roomView';
import { ServerClock } from '../state/clock';
import { TrackStore } from '../state/trackStore';
import { DEFAULT_QUERY, queryTracks, type DomainFilter } from '../state/trackQuery';
import { trafficLabel } from '../ui/format';
import { ConsoleList } from './consoleList';
import { REFUSAL, codeFromSearch, detailFacts, trackKind } from './consoleText';

/**
 * The phone console of the ops room (console.html): join a main screen's
 * room by code, browse and search the picture, open a track, and send it to
 * the main screen. The main screen sees what this phone has open. No map
 * library: it's a list, light enough for any phone.
 */

const el = <T extends HTMLElement = HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in console.html`);
  return node as T;
};

/** A send is answered by the main screen moving; the button rests this long so a double tap sends once. */
const SEND_REST_MS = 1_000;
const SENT_SHOWN_MS = 3_000;
/** Like the main page: a phone in a pocket closes its socket after a quiet minute hidden. */
const HIDDEN_STOP_MS = 60_000;

const store = new TrackStore();
const clock = new ServerClock();

// The room, as the server last told it. In memory only: a reload joins afresh.
let code = codeFromSearch(location.search);
if (code) el<HTMLInputElement>('join-code').value = code;
let token: string | undefined;
let callsign: ConsoleCallsign | null = null;
let mainHere = true;
let refusal: string | null = null;
let link: ConnectionState = { status: 'connecting' };
let traffic = '';

// What this phone has open.
let opened: string | null = null;
let details: TrackDetails | undefined;
let sentAt = 0;
let sentTimer: number | undefined;

let domain: DomainFilter = 'all';
let search = '';

const list = new ConsoleList(el('rows'), el('rows-sizer'), (id) => openTrack(id));

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
      case 'snapshot':
        store.applySnapshot(message.tracks, message.trails);
        break;
      case 'delta':
        store.applyDelta(message.upserts, message.removals, message.serverTime);
        break;
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
        mainHere = message.screens.some((s) => s.name === 'MAIN');
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
  if (!opened || !callsign) return;
  connection.send({ type: 'room-control', to: 'MAIN', action: { do: 'show', id: opened } });
  sentAt = Date.now();
  window.clearTimeout(sentTimer);
  sentTimer = window.setTimeout(render, SENT_SHOWN_MS);
  window.setTimeout(render, SEND_REST_MS);
  render();
});

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
  el('main-away').hidden = !inRoom || mainHere;

  el('join').hidden = inRoom;
  el('join-lede').textContent =
    code && !refusal ? `Joining room ${code}…` : 'Type the code shown on the main screen. Press Q there to show it.';
  const error = el('join-error');
  error.hidden = !refusal;
  error.textContent = refusal ?? '';
  el('list').hidden = !inRoom || opened !== null;
  el('details').hidden = !inRoom || opened === null;
  if (inRoom) renderList();
  if (opened) renderDetails();
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
  send.disabled = !track || !mainHere || resting || link.status !== 'open';
  send.textContent = mainHere ? 'Send to main screen' : 'Main screen is away';
  el('sent').textContent = Date.now() - sentAt < SENT_SHOWN_MS ? 'Sent to the main screen.' : '';
}

render();
connection.start();
