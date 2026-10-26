// MapLibre's stylesheet first, so ours can override it.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createMap } from './map/createMap';
import { Reticle } from './map/reticle';
import { TrackLayer } from './map/trackLayer';
import { loadTrailMode, TrailControl } from './map/trailControl';
import { TrailLayer } from './map/trailLayer';
import { Connection, defaultSocketUrl } from './net/connection';
import { ServerClock } from './state/clock';
import { Selection } from './state/selection';
import { TrackStore } from './state/trackStore';
import { DetailsPanel } from './ui/detailsPanel';
import { formatDtg } from './ui/format';
import { StatusBar } from './ui/statusBar';
import { TrackList } from './ui/trackList';

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node;
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

/** Symbol labels are drawn onto canvases, so give the web font a moment to arrive first. */
async function waitForFonts(): Promise<void> {
  const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    await Promise.race([document.fonts.load('500 14px "IBM Plex Sans Condensed"'), timeout]);
  } catch {
    // Fall back to system fonts.
  }
}

async function main(): Promise<void> {
  const store = new TrackStore();
  const clock = new ServerClock();
  const selection = new Selection();

  const { map, userHasMoved } = createMap(el('map'));
  await waitForFonts();

  const layer = new TrackLayer(map, store, clock, selection);
  const trailControl = new TrailControl(new TrailLayer(map, store, layer, selection, loadTrailMode()));
  map.addControl(trailControl, 'top-left');
  const reticle = new Reticle(map);
  new DetailsPanel(el('details'), store, clock, layer, selection);
  const list = new TrackList(
    el('track-list'),
    el('list-toggle') as HTMLButtonElement,
    store,
    clock,
    layer,
    selection,
    map,
  );

  // Reticle and follow mode track the dead-reckoned position, not the last report.
  selection.subscribe((id, previous) => {
    const pos = id ? layer.positionOf(id) : undefined;
    if (!id || !pos) {
      reticle.hide();
      return;
    }
    reticle.show(pos.lon, pos.lat, id !== previous);
    if (selection.follow) map.easeTo({ center: [pos.lon, pos.lat], duration: 400 });
  });
  layer.onFrame(() => {
    const pos = selection.id ? layer.positionOf(selection.id) : undefined;
    if (!pos) return;
    reticle.move(pos.lon, pos.lat);
    reticle.setStale(pos.stale);
    if (selection.follow && !map.isMoving()) map.jumpTo({ center: [pos.lon, pos.lat] });
  });
  // Dragging the map is a clear sign the operator wants control back.
  map.on('dragstart', () => selection.setFollow(false));

  // If the selected track disappears from the picture, close its panel.
  store.subscribe(() => {
    if (selection.id && !store.get(selection.id)) selection.select(null);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') selection.select(null);
    // Single-letter shortcuts must not fire while the operator is typing.
    if (isTyping(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 't' || event.key === 'T') trailControl.cycle();
    if (event.key === 'l' || event.key === 'L') list.setOpen(!list.open);
    if (event.key === '/') {
      event.preventDefault(); // otherwise the slash lands in the search box
      list.focusSearch();
    }
  });

  // Top bar clock, in server time.
  const dtg = el('dtg');
  const tickClock = () => {
    const now = clock.now();
    dtg.textContent = formatDtg(now);
    dtg.setAttribute('datetime', new Date(now).toISOString());
  };
  tickClock();
  window.setInterval(tickClock, 1000);

  const scenarioName = el('scenario-name');
  let framed = false;

  const connection = new Connection(defaultSocketUrl(), {
    onMessage(message, receivedAt) {
      clock.update(message.serverTime, receivedAt);
      switch (message.type) {
        case 'hello':
          store.setStaleness(message.staleness);
          scenarioName.textContent = message.scenario
            ? `${message.scenario.name}, simulated traffic`
            : 'Live traffic';
          if (message.scenario && !framed && !userHasMoved()) {
            const { center, zoom } = message.scenario;
            map.jumpTo({ center: [center.lon, center.lat], zoom });
          }
          framed = true;
          break;
        case 'snapshot':
          store.applySnapshot(message.tracks, message.trails);
          break;
        case 'delta':
          store.applyDelta(message.upserts, message.removals, message.serverTime);
          break;
      }
    },
    onState(state) {
      status.setConnection(state);
    },
  });

  const status = new StatusBar(el('statusbar'), map, store, clock, () => connection.retryNow());
  connection.start();
}

void main();
