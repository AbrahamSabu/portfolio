// MapLibre's stylesheet first, so ours can override it.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createMap } from './map/createMap';
import { DataCredits } from './map/dataCredits';
import { FilterControl } from './map/filterControl';
import { Reticle } from './map/reticle';
import { TrackLayer } from './map/trackLayer';
import { PathLayer } from './map/pathLayer';
import { StyleControl } from './map/styleControl';
import { loadTrailMode, TrailControl } from './map/trailControl';
import { TrailLayer } from './map/trailLayer';
import { viewForServer } from './map/viewBox';
import { Connection, defaultSocketUrl } from './net/connection';
import { ServerClock } from './state/clock';
import { loadFilterState, PictureFilter, saveFilterState } from './state/pictureFilter';
import { SelectedDetails } from './state/selectedDetails';
import { SelectedPath } from './state/selectedPath';
import { loadSymbolStyle, SymbolStyleSetting } from './state/symbolStyle';
import { Selection } from './state/selection';
import { TrackStore } from './state/trackStore';
import { DetailsPanel } from './ui/detailsPanel';
import { FilterPanel } from './ui/filterPanel';
import { HoverCard } from './ui/hoverCard';
import { KeyDialog } from './ui/keyDialog';
import { formatDtg, trafficLabel } from './ui/format';
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

  // What the operator has chosen to see, remembered per browser.
  const filter = new PictureFilter(loadFilterState());
  filter.subscribe(() => saveFilterState(filter.state));

  const style = new SymbolStyleSetting(loadSymbolStyle());

  const layer = new TrackLayer(map, store, clock, selection, filter, style);
  const trailControl = new TrailControl(new TrailLayer(map, store, layer, selection, filter, loadTrailMode()));
  map.addControl(trailControl, 'top-left');
  // After the trails, so the selected path draws above them (and below the tracks).
  const path = new SelectedPath();
  const pathLayer = new PathLayer(map, store, path);
  map.addControl(new StyleControl(style), 'top-left');
  const filterPanel = new FilterPanel(el('filter-panel'), filter, store, clock, () => filterControl.update());
  const filterControl = new FilterControl(filterPanel, filter);
  map.addControl(filterControl, 'top-left');
  const reticle = new Reticle(map);
  new HoverCard(map, store, clock, layer);
  const keyDialog = new KeyDialog(el('key-dialog') as HTMLDialogElement, el('key-toggle') as HTMLButtonElement, style);
  const details = new SelectedDetails();
  new DetailsPanel(el('details'), store, clock, layer, selection, style, path, details, () => pathLayer.fit());
  const list = new TrackList(
    el('track-list'),
    el('list-toggle') as HTMLButtonElement,
    store,
    clock,
    layer,
    selection,
    map,
    filter,
  );

  // A newly selected track's path and details come from the server: it holds
  // hours of history and reference data the browser doesn't.
  selection.subscribe((id) => {
    if (id === path.id) return;
    path.select(id);
    details.select(id);
    if (id) connection.send({ type: 'track', id });
  });

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
  // How long the page took to show the picture (User Timing, for DevTools and measurements).
  const stopFirstDraw = layer.onFrame(() => {
    if (store.size === 0) return;
    performance.mark('wf:first-tracks');
    stopFirstDraw();
  });

  // Dragging the map is a clear sign the operator wants control back.
  map.on('dragstart', () => selection.setFollow(false));

  // If the selected track disappears from the picture, close its panel.
  store.subscribe(() => {
    if (selection.id && !store.get(selection.id)) selection.select(null);
  });

  document.addEventListener('keydown', (event) => {
    // The key is a modal dialog: it handles its own Escape, and nothing behind it should react.
    if (keyDialog.open) return;
    if (event.key === 'Escape') {
      // Close the filter first if it's open; a second Escape clears the selection.
      if (filterPanel.open) filterPanel.setOpen(false);
      else selection.select(null);
    }
    // Single-letter shortcuts must not fire while the operator is typing.
    if (isTyping(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 't' || event.key === 'T') trailControl.cycle();
    if (event.key === 'l' || event.key === 'L') list.setOpen(!list.open);
    if (event.key === 'f' || event.key === 'F') filterControl.toggle();
    if (event.key === 's' || event.key === 'S') style.toggle();
    if (event.key === '?') keyDialog.toggle();
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

  // Tell the server what's on screen, so a pay-per-area feed can poll just that.
  // Debounced: a pan or zoom sends one view once it settles (300 ms), not one per frame.
  const sendView = () => {
    const b = map.getBounds();
    connection.send({
      type: 'view',
      bbox: viewForServer({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }),
    });
  };
  let viewTimer: number | undefined;
  map.on('moveend', () => {
    window.clearTimeout(viewTimer);
    viewTimer = window.setTimeout(sendView, 300);
  });

  const credits = new DataCredits(map);
  const connection = new Connection(defaultSocketUrl(), {
    onMessage(message, receivedAt) {
      clock.update(message.serverTime, receivedAt);
      switch (message.type) {
        case 'hello':
          store.setStaleness(message.staleness);
          scenarioName.textContent = trafficLabel(message.traffic, message.scenario?.name);
          if (message.scenario && !framed && !userHasMoved()) {
            const { center, zoom } = message.scenario;
            map.jumpTo({ center: [center.lon, center.lat], zoom });
          }
          framed = true;
          status.setFeeds(message.feeds);
          // A feed that can't run (no API key) shows no data, so it gets no credit.
          credits.set(message.feeds.filter((f) => f.state !== 'unconfigured').map((f) => f.feed));
          sendView(); // on every (re)connect, so the server always knows what we're looking at
          if (selection.id) connection.send({ type: 'track', id: selection.id }); // a fresh answer after reconnecting
          break;
        case 'snapshot': {
          const applyStart = performance.now();
          store.applySnapshot(message.tracks, message.trails);
          performance.measure('wf:snapshot-apply', { start: applyStart });
          break;
        }
        case 'delta':
          store.applyDelta(message.upserts, message.removals, message.serverTime);
          path.extend(message.upserts);
          if (message.feeds) status.setFeeds(message.feeds);
          break;
        case 'path':
          path.load(message);
          break;
        case 'details':
          details.load(message);
          break;
      }
    },
    onState(state) {
      status.setConnection(state);
    },
  });

  const status = new StatusBar(el('statusbar'), map, store, clock, filter, () => connection.retryNow());
  connection.start();
}

void main();
